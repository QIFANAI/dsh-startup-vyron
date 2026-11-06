/* ============================================================================
 * smoke-host.mjs — 宿主半侧（lib/index.js）冒烟
 * ----------------------------------------------------------------------------
 * 覆盖面（design-spec §8 / §9）：
 *  [1] 导出形状                    [2] apply 注册清单（7 路由 / tapIndex / effect）
 *  [3] 静态路由与 MIME             [4] config 默认值与 facts 采集
 *  [5] config POST 归一化与边界     [6] 旧配置补默认 / reset / 非法输入
 *  [7] assets 前缀（HEAD / Range / 穿越守卫 / 416）
 *  [8] preview 前缀                [9] tapIndex 首屏注入 + BOOTSTRAP 兜底公式
 *  [10] 信任栅栏（requestRejection）[11] 生命周期清理
 *
 * 运行：node test/smoke-host.mjs（由 npm test 串联；无显示器、无网络依赖）
 * ========================================================================== */
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHarness } from './_mocks.mjs'

const PLUGIN_ROOT = fileURLToPath(new URL('..', import.meta.url))
const SMOKE_HOME = path.join(os.tmpdir(), 'dsh-vyron-smoke-' + Date.now())
fs.mkdirSync(SMOKE_HOME, { recursive: true })
process.env.DSH_HOME = SMOKE_HOME
const CONFIG_FILE = path.join(SMOKE_HOME, 'dsh-startup-vyron.json')

const H = createHarness('HOST')

/* ────────────────────────────────────────────────────────── mock ctx */
const ROUTES = new Map()
const TAPS = []
let effects = 0
let effectCleanup = null
let rejectNext

const webServer = {
  register(route) {
    const key = route.kind + ' ' + route.path
    if (ROUTES.has(key)) throw new Error('duplicate route ' + key)
    ROUTES.set(key, route)
    return () => ROUTES.delete(key)
  },
  tapIndex(fn) {
    TAPS.push(fn)
    return () => {
      const i = TAPS.indexOf(fn)
      if (i >= 0) TAPS.splice(i, 1)
    }
  },
}

const factsStub = {
  profileContext: { name: 'desktop', cwd: '/workspace', startedBundles: ['dsh-base', 'dsh-web-app'] },
  sandboxPolicy: { defaultMode: 'workspace-write' },
  agentDefaultModel: { currentSelection: async () => ({ model: 'deepseek-flash' }) },
  pluginManager: { listBundles: async () => [{ name: '@deepseek-ai/dsh-base', version: 'v0.2.1-rc.5' }] },
  pluginInventory: { list: async () => ({ entries: [{ fiberPhase: 'active' }, { fiberPhase: 'active' }, { fiberPhase: 'idle' }] }) },
  sessions: { list: async () => [{}, {}] },
}

const ctx = {
  webServer,
  get(name) {
    if (name === 'webServer') return webServer
    if (name === 'connection') return { requestRejection: () => rejectNext }
    if (Object.prototype.hasOwnProperty.call(factsStub, name)) return factsStub[name]
    return undefined
  },
  effect(fn) {
    effects++
    const cleanup = fn()
    if (typeof cleanup === 'function') effectCleanup = cleanup
    return () => {}
  },
}

class FakeReq extends EventEmitter {
  constructor(method, body, url, headers) {
    super()
    this.method = method || 'GET'
    this.headers = Object.assign({ host: '127.0.0.1:3080' }, headers || {})
    this.url = url || '/'
    this.destroyed = false
    process.nextTick(() => {
      if (body !== undefined && body !== null) this.emit('data', Buffer.from(body))
      this.emit('end')
    })
  }
  destroy() { this.destroyed = true }
}

function fakeRes() {
  return {
    statusCode: 0,
    headers: null,
    body: Buffer.alloc(0),
    writeHead(code, headers) {
      this.statusCode = code
      this.headers = headers || {}
      return this
    },
    end(buf) {
      this.body = buf === undefined ? Buffer.alloc(0) : Buffer.from(buf)
    },
  }
}

async function call(key, method = 'GET', body, url, headers) {
  const route = ROUTES.get(key)
  if (!route) throw new Error('route missing: ' + key)
  const res = fakeRes()
  await route.handler(new FakeReq(method, body, url, headers), res)
  return res
}

/* 独立复算宿主兜底公式（design-spec §3：看门狗 + 3000，上限 60s） */
function expectedFallbackMs(speed) {
  const s = Math.max(50, Math.min(150, Math.round(Number(speed) || 85))) / 100
  const handoff = Math.round(1200 / Math.sqrt(s))
  const watchdog = Math.max(8000, Math.min(40000, Math.round(4000 + 9800 / s + handoff)))
  return Math.min(60000, watchdog + 3000)
}

const mod = await import(pathToFileURL(path.join(PLUGIN_ROOT, 'lib', 'index.js')).href)

/* ────────────────────────────────────────────────────────── [1] 导出 */
console.log('[1] 导出形状')
H.check('name === dsh-startup-vyron', () => assert.equal(mod.name, 'dsh-startup-vyron'))
H.check("inject = ['webServer','connection']", () => assert.deepEqual(mod.inject, ['webServer', 'connection']))
H.check('apply 是函数', () => assert.equal(typeof mod.apply, 'function'))
H.check('无 default 导出', () => assert.equal(mod.default, undefined))
H.check('无 Config 导出', () => assert.equal(mod.Config, undefined))

/* ────────────────────────────────────────────────── [2] apply 注册清单 */
console.log('[2] apply 注册清单')
mod.apply(ctx)
H.check('路由总数 7', () => assert.equal(ROUTES.size, 7))
H.check('exact /dsh-vyron/splash.css', () => assert.ok(ROUTES.has('exact /dsh-vyron/splash.css')))
H.check('exact /dsh-vyron/splash.js', () => assert.ok(ROUTES.has('exact /dsh-vyron/splash.js')))
H.check('exact /dsh-vyron/skin.css', () => assert.ok(ROUTES.has('exact /dsh-vyron/skin.css')))
H.check('exact /dsh-vyron/lib/audio.js', () => assert.ok(ROUTES.has('exact /dsh-vyron/lib/audio.js')))
H.check('exact /dsh-vyron/config', () => assert.ok(ROUTES.has('exact /dsh-vyron/config')))
H.check('prefix /dsh-vyron/preview', () => assert.ok(ROUTES.has('prefix /dsh-vyron/preview')))
H.check('prefix /dsh-vyron/lib/assets', () => assert.ok(ROUTES.has('prefix /dsh-vyron/lib/assets')))
H.check('tapIndex 1 次', () => assert.equal(TAPS.length, 1))
H.check('ctx.effect 1 次', () => assert.equal(effects, 1))
await new Promise((resolve) => setTimeout(resolve, 60))

/* ──────────────────────────────────────────────── [3] 静态路由与 MIME */
console.log('[3] 静态路由与 MIME')
let r = await call('exact /dsh-vyron/splash.css')
H.check('splash.css 200', () => assert.equal(r.statusCode, 200))
H.check('splash.css text/css', () => assert.match(r.headers['Content-Type'], /^text\/css/))
H.check('splash.css 含 vyron 交接层', () => {
  const css = r.body.toString('utf8')
  assert.match(css, /#dsh-vyron-root/)
  assert.match(css, /vyron-handoff/)
  assert.match(css, /vyron-seam/)
  assert.match(css, /vyron-seam/)
  assert.match(css, /vyron-bar/)
  assert.match(css, /vyron-ring/)
})

r = await call('exact /dsh-vyron/splash.js')
H.check('splash.js 200', () => assert.equal(r.statusCode, 200))
H.check('splash.js application/javascript', () => assert.match(r.headers['Content-Type'], /^application\/javascript/))
H.check('splash.js 三条消息协议常量', () => {
  const js = r.body.toString('utf8')
  assert.match(js, /dsh-startup-vyron:ready/)
  assert.match(js, /dsh-startup-vyron:progress/)
  assert.match(js, /dsh-startup-vyron:done/)
})
H.check('splash.js 速度/看门狗公式常量', () => {
  const js = r.body.toString('utf8')
  assert.match(js, /HANDOFF_MS/)
  assert.match(js, /HANDOFF_SKIP_MS/)
  assert.match(js, /HANDOFF_REDUCED_MS/)
  assert.match(js, /WATCHDOG_MS/)
  assert.match(js, /PREVIEW_TOTAL/)
})

r = await call('exact /dsh-vyron/lib/audio.js')
H.check('audio.js 200', () => assert.equal(r.statusCode, 200))
H.check('audio.js application/javascript', () => assert.match(r.headers['Content-Type'], /^application\/javascript/))
H.check('audio.js VYRON_AUDIO 契约', () => {
  const js = r.body.toString('utf8')
  assert.match(js, /window\.VYRON_AUDIO/)
  assert.match(js, /__vyronAudio/)
  assert.match(js, /function init/)
  assert.match(js, /function start/)
  assert.match(js, /function sync/)
  assert.match(js, /function stop/)
  assert.match(js, /function chime/)
  assert.match(js, /function state/)
  assert.match(js, /preservesPitch/)
})

r = await call('exact /dsh-vyron/skin.css')
H.check('skin.css 200', () => assert.equal(r.statusCode, 200))
H.check('skin.css text/css', () => assert.match(r.headers['Content-Type'], /^text\/css/))
H.check('skin.css 已落盘且非空（交付完整性）', () => {
  assert.ok(r.body.length > 1024, 'skin.css 为空或过小：' + r.body.length + 'B')
  const css = r.body.toString('utf8')
  assert.match(css, /dsh-vyron-skin/)
})

/* ──────────────────────────────────────────── [4] config 默认值与 facts */
console.log('[4] config 默认值与 facts')
r = await call('exact /dsh-vyron/config')
let payload = JSON.parse(r.body.toString('utf8'))
const DEFAULTS = {
  enabled: true,
  mode: 'session',
  allowSkip: true,
  reducedMotion: false,
  sound: true,
  volume: 65,
  splashSpeed: 85,
  skin: 'glass',
  skinTheme: 'orbit',
  skinMotion: true,
  glassTransparency: 50,
}
H.check('config GET ok', () => assert.equal(payload.ok, true))
H.check('version 0.2.1', () => assert.equal(payload.version, '0.2.1'))
H.check('默认配置与 design-spec §8 全等', () => assert.deepEqual(payload.config, DEFAULTS))
H.check('defaults 镜像', () => assert.deepEqual(payload.defaults, DEFAULTS))
H.check('config 文件在 DSH_HOME 下', () => assert.ok(payload.file.startsWith(SMOKE_HOME), payload.file))
H.check('config 文件名 dsh-startup-vyron.json', () => assert.equal(path.basename(payload.file), 'dsh-startup-vyron.json'))
H.check('facts.profile', () => assert.equal(payload.facts.profile, 'DESKTOP'))
H.check('facts.workspace', () => assert.equal(payload.facts.workspace, 'workspace'))
H.check('facts.sandbox', () => assert.equal(payload.facts.sandbox, 'workspace-write'))
H.check('facts.model', () => assert.equal(payload.facts.model, 'deepseek-flash'))
H.check('facts.version 去 v 前缀', () => assert.equal(payload.facts.version, '0.2.1-rc.5'))
H.check('facts.bundleCount', () => assert.equal(payload.facts.bundleCount, 1))
H.check('facts.plugins / activePlugins', () => {
  assert.equal(payload.facts.plugins, 3)
  assert.equal(payload.facts.activePlugins, 2)
})
H.check('facts.sessions', () => assert.equal(payload.facts.sessions, 2))
H.check('facts.hash 8 位大写十六进制', () => assert.match(String(payload.facts.hash), /^[0-9A-F]{8}$/))
H.check('facts.ready', () => assert.equal(payload.facts.ready, true))

/* ────────────────────────────────── [5] config POST 归一化 / 边界钳制 */
console.log('[5] config POST 归一化与边界')
const post = async (patch) => JSON.parse((await call('exact /dsh-vyron/config', 'POST', JSON.stringify({ patch }))).body.toString('utf8')).config

let cfg = await post({ enabled: 'false', mode: 'daily', skin: 'accent', skinTheme: 'terra', splashSpeed: 150, glassTransparency: 0, volume: 100 })
H.check("enabled 字符串 'false' → false", () => assert.equal(cfg.enabled, false))
H.check('mode daily 写入', () => assert.equal(cfg.mode, 'daily'))
H.check('skin accent 写入', () => assert.equal(cfg.skin, 'accent'))
H.check('skinTheme terra 写入', () => assert.equal(cfg.skinTheme, 'terra'))
H.check('splashSpeed 150 写入', () => assert.equal(cfg.splashSpeed, 150))
H.check('glassTransparency 0 写入', () => assert.equal(cfg.glassTransparency, 0))
H.check('volume 100 写入', () => assert.equal(cfg.volume, 100))
H.check('配置原子落盘且无 .tmp 残留', () => {
  assert.ok(fs.existsSync(CONFIG_FILE))
  assert.ok(!fs.existsSync(CONFIG_FILE + '.tmp'))
  const disk = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
  assert.equal(disk.skin, 'accent')
  assert.equal(disk.splashSpeed, 150)
})

cfg = await post({ splashSpeed: 999, glassTransparency: 150, volume: 999 })
H.check('splashSpeed 999 钳到 150', () => assert.equal(cfg.splashSpeed, 150))
H.check('glassTransparency 150 钳到 100', () => assert.equal(cfg.glassTransparency, 100))
H.check('volume 999 钳到 100', () => assert.equal(cfg.volume, 100))

cfg = await post({ splashSpeed: 10, glassTransparency: -5, volume: -20 })
H.check('splashSpeed 10 钳到 50', () => assert.equal(cfg.splashSpeed, 50))
H.check('glassTransparency -5 钳到 0', () => assert.equal(cfg.glassTransparency, 0))
H.check('volume -20 钳到 0', () => assert.equal(cfg.volume, 0))

cfg = await post({ splashSpeed: 'xyz', glassTransparency: 'abc', volume: 'abc' })
H.check('非法 splashSpeed 回默认 85', () => assert.equal(cfg.splashSpeed, 85))
H.check('非法 glassTransparency 回默认 50', () => assert.equal(cfg.glassTransparency, 50))
H.check('非法 volume 回默认 65', () => assert.equal(cfg.volume, 65))

cfg = await post({ splashSpeed: 80.4, glassTransparency: 33.7, volume: 33.7 })
H.check('splashSpeed 80.4 取整 80', () => assert.equal(cfg.splashSpeed, 80))
H.check('glassTransparency 33.7 取整 34', () => assert.equal(cfg.glassTransparency, 34))
H.check('volume 33.7 取整 34', () => assert.equal(cfg.volume, 34))

cfg = await post({ mode: 'bogus', skin: 'bogus', skinTheme: 'bogus' })
H.check('非法 mode 回 session', () => assert.equal(cfg.mode, 'session'))
H.check('非法 skin 回 glass', () => assert.equal(cfg.skin, 'glass'))
H.check('非法 skinTheme 回 orbit', () => assert.equal(cfg.skinTheme, 'orbit'))

cfg = await post({ sound: 0, allowSkip: '0', reducedMotion: 1, skinMotion: '0' })
H.check('sound 0 → false', () => assert.equal(cfg.sound, false))
H.check("allowSkip '0' → false", () => assert.equal(cfg.allowSkip, false))
H.check('reducedMotion 1 → true', () => assert.equal(cfg.reducedMotion, true))
H.check("skinMotion '0' → false", () => assert.equal(cfg.skinMotion, false))

cfg = await post({ unknownKey: 123 })
H.check('未知键被忽略', () => assert.equal(Object.prototype.hasOwnProperty.call(cfg, 'unknownKey'), false))
H.check('部分 patch 保留其它键', () => assert.equal(cfg.mode, 'session'))

/* ───────────────────────────── [6] 旧配置补默认 / reset / 非法输入 */
console.log('[6] 旧配置补默认 / reset / 非法输入')
fs.writeFileSync(CONFIG_FILE, JSON.stringify({ enabled: false, mode: 'always', allowSkip: false }), 'utf8')
r = await call('exact /dsh-vyron/config')
payload = JSON.parse(r.body.toString('utf8'))
H.check('旧配置已有键保留', () => {
  assert.equal(payload.config.enabled, false)
  assert.equal(payload.config.mode, 'always')
  assert.equal(payload.config.allowSkip, false)
})
H.check('旧配置缺键补默认值', () => {
  for (const key of ['reducedMotion', 'sound', 'volume', 'splashSpeed', 'skin', 'skinTheme', 'skinMotion', 'glassTransparency']) {
    assert.deepEqual(payload.config[key], DEFAULTS[key], key)
  }
})

r = await call('exact /dsh-vyron/config', 'POST', JSON.stringify({ action: 'reset' }))
payload = JSON.parse(r.body.toString('utf8'))
H.check('reset 恢复全部默认', () => assert.deepEqual(payload.config, DEFAULTS))

r = await call('exact /dsh-vyron/config', 'POST', 'not-json')
H.check('非法 JSON → 400', () => assert.equal(r.statusCode, 400))
r = await call('exact /dsh-vyron/config', 'PUT')
H.check('PUT → 405', () => assert.equal(r.statusCode, 405))
H.check('405 JSON 错误体', () => assert.equal(JSON.parse(r.body.toString('utf8')).ok, false))

/* ─────────────────── [7] assets 前缀：HEAD / Range / 穿越守卫 / 416 */
console.log('[7] assets 前缀')
// 公开仓库不含第三方 4K 底板；大二进制 Range 断言改用随仓库发布的程序化音轨
const BIN_ASSET = 'lib/assets/audio/vyron-boot.wav'
const binSize = fs.statSync(path.join(PLUGIN_ROOT, BIN_ASSET)).size
let heroSize = 0
r = await call('prefix /dsh-vyron/lib/assets', 'HEAD', undefined, '/dsh-vyron/' + BIN_ASSET)
H.check('HEAD wav 200', () => assert.equal(r.statusCode, 200))
H.check('wav MIME audio/wav', () => assert.equal(r.headers['Content-Type'], 'audio/wav'))
H.check('Accept-Ranges: bytes', () => assert.equal(r.headers['Accept-Ranges'], 'bytes'))
H.check('Content-Length 与磁盘一致', () => assert.equal(Number(r.headers['Content-Length']), binSize))
H.check('HEAD 无 body', () => assert.equal(r.body.length, 0))

r = await call('prefix /dsh-vyron/lib/assets', 'GET', undefined, '/dsh-vyron/' + BIN_ASSET, { Range: 'bytes=0-99' })
H.check('Range 206', () => assert.equal(r.statusCode, 206))
H.check('Range 长度 100', () => assert.equal(r.body.length, 100))
H.check('Content-Range 头', () => assert.match(r.headers['Content-Range'], /^bytes 0-99\/\d+$/))

r = await call('prefix /dsh-vyron/lib/assets', 'GET', undefined, '/dsh-vyron/' + BIN_ASSET, { Range: 'bytes=-16' })
H.check('后缀 Range 206 且 16B', () => {
  assert.equal(r.statusCode, 206)
  assert.equal(r.body.length, 16)
})

r = await call('prefix /dsh-vyron/lib/assets', 'GET', undefined, '/dsh-vyron/' + BIN_ASSET)
H.check('完整资源 200 且长度一致', () => {
  assert.equal(r.statusCode, 200)
  assert.equal(r.body.length, binSize)
})

r = await call('prefix /dsh-vyron/lib/assets', 'GET', undefined, '/dsh-vyron/' + BIN_ASSET, { Range: 'bytes=999999999-' })
H.check('越界 Range → 416', () => assert.equal(r.statusCode, 416))

/* 第三方 4K 底板仅在本地恢复后存在：有则补测 WebP MIME / 长度契约 */
const HERO4K = 'lib/assets/hero-4k.webp'
if (fs.existsSync(path.join(PLUGIN_ROOT, HERO4K))) {
  heroSize = fs.statSync(path.join(PLUGIN_ROOT, HERO4K)).size
  r = await call('prefix /dsh-vyron/lib/assets', 'HEAD', undefined, '/dsh-vyron/' + HERO4K)
  H.check('HEAD webp 200', () => assert.equal(r.statusCode, 200))
  H.check('webp MIME image/webp', () => assert.equal(r.headers['Content-Type'], 'image/webp'))
  H.check('webp Content-Length 与磁盘一致', () => assert.equal(Number(r.headers['Content-Length']), heroSize))
} else {
  H.skip('4K 底板 WebP MIME / 长度（本地全量包）', '公开仓库不含第三方底图；本地恢复见 scripts/prepare-local-media.ps1')
}

r = await call('prefix /dsh-vyron/lib/assets', 'GET', undefined, '/dsh-vyron/lib/assets/../../../package.json')
H.check('目录穿越 ../ 404', () => assert.equal(r.statusCode, 404))
r = await call('prefix /dsh-vyron/lib/assets', 'GET', undefined, '/dsh-vyron/lib/assets/%2e%2e%2f%2e%2e%2fpackage.json')
H.check('URL 编码穿越 404', () => assert.equal(r.statusCode, 404))
r = await call('prefix /dsh-vyron/lib/assets', 'GET', undefined, '/dsh-vyron/lib/assets/%E0%A4%A')
H.check('非法编码 404', () => assert.equal(r.statusCode, 404))

r = await call('prefix /dsh-vyron/lib/assets', 'GET', undefined, '/dsh-vyron/lib/assets/brand/whale.svg')
H.check('嵌套 SVG 200 + image/svg+xml', () => {
  assert.equal(r.statusCode, 200)
  assert.equal(r.headers['Content-Type'], 'image/svg+xml')
})
r = await call('prefix /dsh-vyron/lib/assets', 'HEAD', undefined, '/dsh-vyron/' + BIN_ASSET)
H.check('wav HEAD audio/wav 且 >1MB', () => {
  assert.equal(r.statusCode, 200)
  assert.equal(r.headers['Content-Type'], 'audio/wav')
  assert.ok(Number(r.headers['Content-Length']) > 1024 * 1024)
})
r = await call('prefix /dsh-vyron/lib/assets', 'GET', undefined, '/dsh-vyron/lib/assets/nope.webp')
H.check('不存在资源 404', () => assert.equal(r.statusCode, 404))
r = await call('prefix /dsh-vyron/lib/assets', 'GET', undefined, '/dsh-vyron/lib/assets/fonts/readme.txt')
H.check('未知扩展名 404', () => assert.equal(r.statusCode, 404))
r = await call('prefix /dsh-vyron/lib/assets', 'POST', undefined, '/dsh-vyron/' + BIN_ASSET)
H.check('POST 静态资源 405', () => assert.equal(r.statusCode, 405))

/* ───────────────────────────────────────────────────── [8] preview 前缀 */
console.log('[8] preview 前缀')
r = await call('prefix /dsh-vyron/preview', 'GET', undefined, '/dsh-vyron/preview/index.html')
H.check('preview index 200 + html', () => {
  assert.equal(r.statusCode, 200)
  assert.match(r.headers['Content-Type'], /^text\/html/)
})
H.check('preview index 含 vyStage 舞台', () => assert.match(r.body.toString('utf8'), /id="vyStage"/))
H.check('preview index 无缓存', () => assert.match(r.headers['Cache-Control'], /no-store/))
r = await call('prefix /dsh-vyron/preview', 'GET', undefined, '/dsh-vyron/preview/js/timeline.js')
H.check('timeline.js 200 + js MIME', () => {
  assert.equal(r.statusCode, 200)
  assert.match(r.headers['Content-Type'], /^application\/javascript/)
})
H.check('timeline.js 含 VYRON_TIMELINE', () => assert.match(r.body.toString('utf8'), /window\.VYRON_TIMELINE/))
r = await call('prefix /dsh-vyron/preview', 'GET', undefined, '/dsh-vyron/preview/css/splash.css')
H.check('预览 css MIME', () => {
  assert.equal(r.statusCode, 200)
  assert.match(r.headers['Content-Type'], /^text\/css/)
})
r = await call('prefix /dsh-vyron/preview', 'GET', undefined, '/dsh-vyron/preview/../package.json')
H.check('preview 穿越 404', () => assert.equal(r.statusCode, 404))

/* ───────────────────────── [9] tapIndex 首屏注入 + 兜底公式 */
console.log('[9] tapIndex 首屏注入')
const BASE = '<!doctype html><html><head><title>DSH</title></head><body><div id="root"></div></body></html>'
const injected = TAPS[0](BASE)
H.check('注入启动根节点', () => assert.match(injected, /<div id="dsh-vyron-root" class="vyron-root vyron-boot"><\/div>/))
H.check('注入 splash.css', () => assert.match(injected, /href="\/dsh-vyron\/splash\.css"/))
H.check('注入 critical style', () => assert.match(injected, /id="dsh-vyron-critical"/))
H.check('注入 splash.js（defer）', () => assert.match(injected, /<script defer src="\/dsh-vyron\/splash\.js"><\/script>/))
H.check('注入 __DSH_VYRON__', () => assert.match(injected, /window\.__DSH_VYRON__=/))
H.check('注入 __DSH_VYRON_FACTS__', () => assert.match(injected, /window\.__DSH_VYRON_FACTS__=/))
H.check('注入 __DSH_VYRON_BOOT__', () => assert.match(injected, /window\.__DSH_VYRON_BOOT__="index"/))
H.check('注入版本号', () => assert.match(injected, /window\.__DSH_VYRON_VERSION__="0\.2\.1"/))
H.check('注入兜底时长 __DSH_VYRON_FALLBACK_MS__', () => assert.match(injected, /window\.__DSH_VYRON_FALLBACK_MS__=\d+/))
H.check('注入配置含全部默认字段', () => {
  for (const [k, v] of Object.entries(DEFAULTS)) {
    const re = new RegExp('"' + k + '":' + JSON.stringify(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    assert.match(injected, re, k)
  }
})
H.check('BOOTSTRAP JS：QA 后门 vyron_nosplash', () => assert.match(injected, /vyron_nosplash=1/))
H.check('BOOTSTRAP JS：session 模式去重', () => {
  assert.match(injected, /sessionStorage/)
  assert.match(injected, /dsh-vyron:shown/)
})
H.check('BOOTSTRAP JS：daily 模式去重', () => {
  assert.match(injected, /localStorage/)
  assert.match(injected, /dsh-vyron:day/)
})
H.check('BOOTSTRAP JS：vyron-lock 锁滚动', () => {
  assert.match(injected, /vyron-lock/)
  assert.match(injected, /overflow='hidden'/)
})
H.check('BOOTSTRAP JS：兜底按速度公式（9800*slow）', () => {
  assert.match(injected, /9800\*slow/)
  assert.match(injected, /1200\/Math\.sqrt/)
  assert.doesNotMatch(injected, /\},14000\)/)
})
H.check('二次注入幂等', () => assert.equal(TAPS[0](injected), injected))
H.check('无 </head> 时插到最前', () => {
  const out = TAPS[0]('<html><body><div id="root"></div></body></html>')
  assert.match(out, /^<link rel="stylesheet" href="\/dsh-vyron\/splash\.css">/)
  assert.match(out, /dsh-vyron-root/)
})

const fallbackOf = (html) => Number(/window\.__DSH_VYRON_FALLBACK_MS__=(\d+)/.exec(html)[1])
H.check('兜底公式 @85 与独立复算一致（±2ms）', () => {
  assert.ok(Math.abs(fallbackOf(injected) - expectedFallbackMs(85)) <= 2, fallbackOf(injected) + ' vs ' + expectedFallbackMs(85))
})
await post({ splashSpeed: 50 })
let html50 = TAPS[0](BASE)
H.check('兜底公式 @50（±2ms）', () => {
  assert.ok(Math.abs(fallbackOf(html50) - expectedFallbackMs(50)) <= 2, fallbackOf(html50) + ' vs ' + expectedFallbackMs(50))
})
await post({ splashSpeed: 150 })
let html150 = TAPS[0](BASE)
H.check('兜底公式 @150（±2ms）', () => {
  assert.ok(Math.abs(fallbackOf(html150) - expectedFallbackMs(150)) <= 2, fallbackOf(html150) + ' vs ' + expectedFallbackMs(150))
})
await post({ action: 'reset' })
H.check('注入 JSON 转义：< 不出现在 script 内', () => assert.doesNotMatch(injected, /<script>window\.__DSH_VYRON__=.*<\/script>/))

/* ────────────────────────────── [10] 信任栅栏 requestRejection */
console.log('[10] 信任栅栏')
rejectNext = 403
r = await call('exact /dsh-vyron/splash.js')
H.check('403 拦截 splash.js', () => {
  assert.equal(r.statusCode, 403)
  assert.equal(r.body.length, 0)
})
r = await call('exact /dsh-vyron/config')
H.check('403 拦截 config', () => assert.equal(r.statusCode, 403))
r = await call('prefix /dsh-vyron/lib/assets', 'GET', undefined, '/dsh-vyron/' + BIN_ASSET)
H.check('403 拦截 assets 前缀', () => assert.equal(r.statusCode, 403))
rejectNext = undefined
r = await call('exact /dsh-vyron/config')
H.check('栅栏放行后 config 200', () => assert.equal(r.statusCode, 200))

/* ─────────────────────────────────────── [11] 生命周期清理 */
console.log('[11] 生命周期清理')
if (typeof effectCleanup === 'function') effectCleanup()
H.check('清理后路由 0', () => assert.equal(ROUTES.size, 0))
H.check('清理后 tapIndex 0', () => assert.equal(TAPS.length, 0))

H.done()
