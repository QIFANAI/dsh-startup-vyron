/* ============================================================================
 * smoke-splash.mjs — 宿主启动层控制器（lib/splash.js）冒烟
 * ----------------------------------------------------------------------------
 * 用 node:vm + mock DOM 以浏览器身份加载 lib/splash.js（无显示器）。
 * 覆盖面（design-spec §3 速度模型 / §7 消息契约 / §8 QA 后门）：
 *  [1] 启动层与 iframe 挂载、锁滚动
 *  [2] iframe URL 参数透传（embed/v/sound/volume/speed/allowSkip/reduced/t）
 *  [3] 配置归一化（mode/allowSkip/sound/volume/splashSpeed）
 *  [4] ready / progress 协议与看门狗清除
 *  [5] done → 交接（Round2：HANDOFF_MS=round(1200/√SPEED)、--vyron-k、缝/黑幕/声呐环/光带、钟声、清理）
 *  [6] 速度派生公式 @50/85/150（HANDOFF / SKIP / WATCHDOG / TOTAL_WALL）
 *  [7] skip 与 allowSkip=false
 *  [8] 看门狗超时 → 快速释放（HANDOFF_ERROR_MS=40）
 *  [9] replay 重播
 *  [10] reduced 分支（reduced=1 / HANDOFF_REDUCED_MS=320 / 不播钟声）
 *  [11] QA 后门（vyron_nosplash / vyron_t / vyron_speed / vyron_reduced）
 *  [12] 消息健壮性（错误来源 / 未知类型 / 非法 data）
 *  [13] disabled 与重复加载守卫
 *  [14] 页面内全屏预览（preview API：草稿参数/不写配置/结束还原/强制可跳过）
 *
 * 运行：node test/smoke-splash.mjs
 * ========================================================================== */
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { createHarness, makeEnv, Elem, readFile } from './_mocks.mjs'

const SPLASH_CODE = readFile('lib/splash.js')
const TOTAL = 9.8
const H = createHarness('SPLASH')

/* 独立复算 design-spec §3 速度模型 */
function derive(splashSpeed) {
  const speed = Math.max(50, Math.min(150, Math.round(Number(splashSpeed) || 85)))
  const ratio = speed / 100
  const impact = 1 / Math.sqrt(ratio)
  const handoff = Math.round(1200 * impact)
  const skip = Math.round(600 * impact)
  const reduced = 380
  const errorMs = 40
  const watchdog = Math.max(8000, Math.min(40000, Math.round(4000 + (TOTAL * 1000) / ratio + handoff)))
  const totalWall = Math.round((TOTAL * 1000) / ratio)
  const k = (ms) => Math.max(0.02, Math.min(1.5, ms / 1200))
  return { speed, ratio, impact, handoff, skip, reduced, errorMs, watchdog, totalWall, k }
}

function findIframe(env) {
  let found = null
  env.walkAll(env.html, (node) => {
    if (!found && node.tagName === 'IFRAME') found = node
  }, [])
  return found
}

function findById(env, id) {
  return env.document.getElementById(id)
}

/* 启动一个隔离的 splash 运行环境 */
function boot(config, opts = {}) {
  const env = makeEnv(Object.assign({
    config,
    facts: { profile: 'DESKTOP', ready: true },
    version: '0.1.0',
  }, opts))
  let root = null
  if (opts.injectRoot !== false) {
    root = new Elem('div')
    root.id = 'dsh-vyron-root'
    root.className = 'vyron-root vyron-boot'
    env.body.appendChild(root)
  }
  const context = vm.createContext(env.sandbox())
  vm.runInContext(SPLASH_CODE, context, { filename: 'splash.js' })
  const api = env.window.__DSH_VYRON_API__
  const frame = findIframe(env)
  const fire = (data, source) => env.fireWindowEvent('message', { source: source === undefined ? (frame ? frame.contentWindow : {}) : source, data })
  const ready = () => fire({ type: 'dsh-startup-vyron:ready' })
  const progress = (t, phase) => fire({ type: 'dsh-startup-vyron:progress', t, phase })
  const done = (reason) => fire({ type: 'dsh-startup-vyron:done', reason })
  const url = () => (frame ? String(frame.src) : '')
  const has = (pattern) => new RegExp(pattern).test(url())
  return Object.assign(env, { root, api, frame, fire, ready, progress, done, url, has, context })
}

const BASE = { enabled: true, mode: 'session', allowSkip: true, reducedMotion: false, sound: true, volume: 65, splashSpeed: 85 }

/* ───────────────────────────────────────── [1] 挂载与锁滚动 */
console.log('[1] 启动层挂载')
let env = boot(BASE)
H.check('__DSH_VYRON_BOOTED__ 置位', () => assert.equal(env.window.__DSH_VYRON_BOOTED__, true))
H.check('API 已暴露', () => assert.equal(typeof env.api, 'object'))
H.check('根节点存在', () => assert.ok(env.root && env.root.parentNode === env.body))
H.check('根节点类名 vyron-root vyron-boot', () => {
  assert.ok(env.root.classList.contains('vyron-root'))
  assert.ok(env.root.classList.contains('vyron-boot'))
})
H.check('html 加 vyron-lock', () => assert.ok(env.html.classList.contains('vyron-lock')))
H.check('body overflow hidden', () => assert.equal(env.body.style.overflow, 'hidden'))
H.check('iframe 唯一且挂在根节点', () => {
  assert.ok(env.frame)
  assert.equal(env.root.children.filter((c) => c.tagName === 'IFRAME').length, 1)
  assert.equal(env.frame.parentNode, env.root)
})
H.check('iframe 类名 vyron-frame', () => assert.ok(env.frame.classList.contains('vyron-frame')))
H.check('iframe allow=autoplay; fullscreen', () => assert.match(env.frame.getAttribute('allow'), /autoplay/))
H.check('iframe title 含 startup', () => assert.match(env.frame.getAttribute('title') || env.frame.title || '', /startup/i))
H.check('初始 state=running', () => assert.equal(env.api.state, 'running'))
H.check('初始 ready=false', () => assert.equal(env.api.ready, false))
H.check('api.speed = 85', () => assert.equal(env.api.speed, 85))
H.check('api.facts 透传', () => assert.equal(env.api.facts.profile, 'DESKTOP'))

/* ───────────────────────────────────── [2] iframe URL 透传 */
console.log('[2] iframe URL 透传')
H.check('URL 指向 /dsh-vyron/preview/index.html', () => assert.ok(env.url().startsWith('/dsh-vyron/preview/index.html?')))
H.check('embed=1', () => assert.ok(env.has('[?&]embed=1')))
H.check('v=0.1.0', () => assert.ok(env.has('[?&]v=0\\.1\\.0(&|$)')))
H.check('sound=1', () => assert.ok(env.has('[?&]sound=1(&|$)')))
H.check('volume=65', () => assert.ok(env.has('[?&]volume=65(&|$)')))
H.check('speed=85', () => assert.ok(env.has('[?&]speed=85(&|$)')))
H.check('带缓存破坏参数 _=', () => assert.ok(env.has('[?&]_=\\d+')))
H.check('默认不带 t=', () => assert.ok(!env.has('[?&]t=')))
H.check('默认不带 reduced=', () => assert.ok(!env.has('[?&]reduced=')))
H.check('默认不带 allowSkip=', () => assert.ok(!env.has('[?&]allowSkip=')))

let e2 = boot(Object.assign({}, BASE, { splashSpeed: 150, volume: 0, sound: false, allowSkip: false }))
H.check('speed=150 透传', () => assert.ok(e2.has('[?&]speed=150(&|$)')))
H.check('volume=0 透传', () => assert.ok(e2.has('[?&]volume=0(&|$)')))
H.check('sound=false → sound=0', () => assert.ok(e2.has('[?&]sound=0(&|$)')))
H.check('allowSkip=false → allowSkip=0', () => assert.ok(e2.has('[?&]allowSkip=0(&|$)')))

let e3 = boot(Object.assign({}, BASE, { reducedMotion: true }))
H.check('reducedMotion=true → reduced=1', () => assert.ok(e3.has('[?&]reduced=1(&|$)')))

let e4 = boot(BASE, { search: '?vyron_t=4.2' })
H.check('vyron_t=4.2 → t=4.2', () => assert.ok(e4.has('[?&]t=4\\.2(&|$)')))
H.check('vyron_t 优先于 reduced', () => assert.ok(!e4.has('[?&]reduced=')))
H.check('vyron_t 保留 embed', () => assert.ok(e4.has('[?&]embed=1')))

let e5 = boot(BASE, { search: '?vyron_t=99' })
H.check('vyron_t 超界钳到 TOTAL+0.5=10.3', () => assert.ok(e5.has('[?&]t=10\\.3(&|$)')))

let e6 = boot(BASE, { search: '?vyron_t=abc' })
H.check('非法 vyron_t 被忽略', () => assert.ok(!e6.has('[?&]t=')))

/* ───────────────────────────────────── [3] 配置归一化 */
console.log('[3] 配置归一化')
const messy = {
  enabled: 'true',
  mode: 'bogus',
  allowSkip: '0',
  reducedMotion: '1',
  sound: 'false',
  volume: -5,
  splashSpeed: 999,
}
let e7 = boot(messy)
H.check('enabled 字符串 true', () => assert.equal(e7.api.config.enabled, true))
H.check('非法 mode 回 session', () => assert.equal(e7.api.config.mode, 'session'))
H.check("allowSkip '0' → false", () => assert.equal(e7.api.config.allowSkip, false))
H.check("reducedMotion '1' → true", () => assert.equal(e7.api.config.reducedMotion, true))
H.check("sound 'false' → false", () => assert.equal(e7.api.config.sound, false))
H.check('volume -5 钳到 0', () => assert.equal(e7.api.config.volume, 0))
H.check('splashSpeed 999 钳到 150', () => assert.equal(e7.api.config.splashSpeed, 150))
H.check('归一化后 URL 同步', () => {
  assert.ok(e7.has('[?&]speed=150(&|$)'))
  assert.ok(e7.has('[?&]volume=0(&|$)'))
  assert.ok(e7.has('[?&]sound=0(&|$)'))
  assert.ok(e7.has('[?&]allowSkip=0(&|$)'))
  assert.ok(e7.has('[?&]reduced=1(&|$)'))
})

/* ───────────────────────────────── [4] ready / progress 协议 */
console.log('[4] ready / progress')
const d85 = derive(85)
H.check('初始 watchdogMs = 公式值', () => assert.equal(env.api.watchdogMs, d85.watchdog))
H.check('初始 totalWallMs = 11529', () => assert.equal(env.api.totalWallMs, d85.totalWall))
env.ready()
H.check('ready 后 api.ready=true', () => assert.equal(env.api.ready, true))
H.check('ready 后移除 vyron-boot 类', () => assert.ok(!env.root.classList.contains('vyron-boot')))
env.advance(d85.watchdog + 5000)
H.check('ready 后看门狗已清除（超时时刻不释放）', () => {
  assert.equal(env.api.state, 'running')
  assert.ok(env.root && env.root.parentNode === env.body)
  assert.ok(!env.root.classList.contains('vyron-handoff'))
})
env.progress(4.9, 'whale')
H.check('progress t=4.9 → api.progress=0.5', () => assert.equal(env.api.progress, 0.5))
H.check('progress phase 写入 state', () => assert.equal(env.api.state, 'whale'))
env.progress(99, 'bloom')
H.check('progress 超界钳到 1', () => assert.equal(env.api.progress, 1))
env.progress(-5, 'signal')
H.check('progress 负数钳到 0', () => assert.equal(env.api.progress, 0))

/* ───────────────────────────── [5] done → 交接自然路径 */
console.log('[5] done 交接（自然结束）')
let e8 = boot(BASE)
const d8 = derive(85)
e8.ready()
e8.done('natural')
H.check('done 后 state=done', () => assert.equal(e8.api.state, 'done'))
H.check('交接时长 handoffMs = round(1200/√0.85)', () => assert.equal(e8.api.handoffMs, d8.handoff))
H.check('根节点加 vyron-handoff', () => assert.ok(e8.root.classList.contains('vyron-handoff')))
H.check('--vyron-k = handoff/1200', () => {
  const expected = String(d8.k(d8.handoff))
  assert.equal(e8.html.style.getPropertyValue('--vyron-k'), expected)
})
H.check('交接装饰 5 层（seam/bar-top/bar-bottom/scan/ring）', () => {
  const classes = e8.root.children.map((c) => c.className)
  assert.ok(classes.some((c) => /vyron-seam/.test(c)), classes.join('|'))
  assert.ok(classes.some((c) => /vyron-bar--top/.test(c)), classes.join('|'))
  assert.ok(classes.some((c) => /vyron-bar--bottom/.test(c)), classes.join('|'))
  assert.ok(classes.some((c) => /vyron-scan/.test(c)), classes.join('|'))
  assert.ok(classes.some((c) => /vyron-ring/.test(c)), classes.join('|'))
})
H.check('交接钟声 handoff.wav 已播放', () => {
  assert.equal(e8.audios.length, 1)
  assert.match(e8.audios[0].src, /\/dsh-vyron\/lib\/assets\/audio\/handoff\.wav/)
  assert.equal(e8.audios[0].playCalls, 1)
})
H.check('交接钟声音量 = volume/100*0.85', () => {
  assert.ok(Math.abs(e8.audios[0].volume - 0.65 * 0.85) < 1e-9, String(e8.audios[0].volume))
})
/* 120*k：上下黑幕开始从中央缝滑开（露出宿主 UI） */
const barAt = Math.round(120 * (d8.handoff / 1200))
e8.advance(barAt)
H.check('120*k 后黑幕进入打开态（transform scaleY(0)）', () => {
  const bars = e8.root.children.filter((c) => /vyron-bar/.test(c.className))
  assert.equal(bars.length, 2)
  assert.ok(bars.every((b) => String(b.style.transform || '').indexOf('scaleY(0)') >= 0), bars.map((b) => b.style.transform).join('|'))
})
/* 300*k：宿主 UI 通电显影 */
const enterAt = Math.round(300 * (d8.handoff / 1200))
e8.advance(enterAt - barAt)
H.check('300*k 后 html 加 vyron-enter（宿主 UI 通电）', () => assert.ok(e8.html.classList.contains('vyron-enter')))
/* 420*k：声呐环在场（mock 无 WAAPI，退化为 opacity=0 不崩） */
e8.advance(Math.round(420 * (d8.handoff / 1200)) - enterAt)
H.check('420*k 声呐环节点存在且不抛异常', () => {
  const ring = e8.root.children.find((c) => /vyron-ring/.test(c.className))
  assert.ok(ring)
})
e8.advance(d8.handoff)
H.check('交接完成后根节点移除', () => assert.equal(findById(e8, 'dsh-vyron-root'), null))
H.check('交接后解锁滚动', () => {
  assert.equal(e8.body.style.overflow, '')
  assert.ok(!e8.html.classList.contains('vyron-lock'))
})
H.check('交接后清 --vyron-k', () => assert.equal(e8.html.style.getPropertyValue('--vyron-k'), ''))
H.check('交接后移除 vyron-enter', () => assert.ok(!e8.html.classList.contains('vyron-enter')))
H.check('派发 dsh-vyron:done 事件', () => assert.ok(e8.dispatched.some((ev) => ev.type === 'dsh-vyron:done')))
H.check('自然结束不算失败', () => assert.equal(e8.window.__DSH_VYRON_FAILED__, false))

/* ───────────────────────── [6] 速度派生公式 @50/85/150 */
console.log('[6] 速度派生公式')
for (const speed of [50, 85, 150]) {
  const d = derive(speed)
  const run = boot(Object.assign({}, BASE, { splashSpeed: speed }))
  H.check('@' + speed + ' watchdogMs=' + d.watchdog, () => assert.equal(run.api.watchdogMs, d.watchdog))
  H.check('@' + speed + ' totalWallMs=' + d.totalWall, () => assert.equal(run.api.totalWallMs, d.totalWall))
  run.ready()
  run.done('natural')
  H.check('@' + speed + ' handoffMs=' + d.handoff, () => assert.equal(run.api.handoffMs, d.handoff))
  run.advance(d.handoff)
  H.check('@' + speed + ' 交接清理完成', () => assert.equal(findById(run, 'dsh-vyron-root'), null))
}
H.check('看门狗公式值在 [8000,40000] 内（含极限）', () => {
  for (const s of [50, 85, 150, 1, 999]) {
    const w = derive(s).watchdog
    assert.ok(w >= 8000 && w <= 40000, s + '→' + w)
  }
})
H.check('TOTAL_WALL @50 = 19600 / @150 = 6533', () => {
  assert.equal(derive(50).totalWall, 19600)
  assert.equal(derive(150).totalWall, 6533)
})

/* ───────────────────────────────── [7] skip 与 allowSkip */
console.log('[7] skip')
let e9 = boot(BASE)
const d9 = derive(85)
e9.ready()
e9.api.skip()
H.check('skip 后 handoffMs = round(600/√SPEED)', () => assert.equal(e9.api.handoffMs, d9.skip))
H.check('skip 后根节点进入交接', () => assert.ok(e9.root.classList.contains('vyron-handoff')))
e9.advance(d9.skip)
H.check('skip 交接清理', () => assert.equal(findById(e9, 'dsh-vyron-root'), null))
H.check('skip 不算失败', () => assert.equal(e9.window.__DSH_VYRON_FAILED__, false))

let e10 = boot(Object.assign({}, BASE, { allowSkip: false }))
e10.api.skip()
H.check('allowSkip=false 时 skip 无效', () => {
  assert.equal(e10.api.state, 'running')
  assert.ok(!e10.root.classList.contains('vyron-handoff'))
})
e10.advance(derive(85).watchdog + 1)
H.check('allowSkip=false 仍受看门狗保护', () => assert.equal(e10.api.state, 'done'))

/* ───────────────────────────── [8] 看门狗超时 → 快速释放 */
console.log('[8] 看门狗超时')
let e11 = boot(BASE)
const d11 = derive(85)
e11.advance(d11.watchdog + 1)
H.check('超时后 state=done', () => assert.equal(e11.api.state, 'done'))
H.check('超时 handoff = HANDOFF_ERROR_MS=40', () => assert.equal(e11.api.handoffMs, 40))
H.check('超时不播钟声', () => assert.equal(e11.audios.length, 0))
H.check('超时快速清理（40ms）', () => {
  e11.advance(40)
  assert.equal(findById(e11, 'dsh-vyron-root'), null)
})
H.check('超时后 __DSH_VYRON_FAILED__=true（cleanupHandoff 内标记）', () => assert.equal(e11.window.__DSH_VYRON_FAILED__, true))

/* ───────────────────────────────────────────── [9] replay */
console.log('[9] replay')
let e12 = boot(BASE)
const d12 = derive(85)
e12.ready()
e12.done('natural')
e12.advance(d12.handoff)
H.check('replay 前根节点已移除', () => assert.equal(findById(e12, 'dsh-vyron-root'), null))
e12.api.replay()
H.check('replay 重建根节点', () => {
  const root = findById(e12, 'dsh-vyron-root')
  assert.ok(root && root.parentNode === e12.body)
})
H.check('replay 重置 state=running/ready=false', () => {
  assert.equal(e12.api.state, 'running')
  assert.equal(e12.api.ready, false)
})
H.check('replay 重新锁滚动', () => {
  assert.ok(e12.html.classList.contains('vyron-lock'))
  assert.equal(e12.body.style.overflow, 'hidden')
})
H.check('replay 后新 iframe 仍在并重挂看门狗', () => {
  assert.ok(findIframe(e12))
  e12.advance(derive(85).watchdog + 1)
  assert.equal(e12.api.state, 'done')
})

/* ───────────────────────────────────────── [10] reduced 分支 */
console.log('[10] reduced 分支')
let e13 = boot(Object.assign({}, BASE, { reducedMotion: true }), { prefersReducedMotion: true })
e13.ready()
e13.done('reduced')
H.check('reduced 交接 HANDOFF_REDUCED_MS=380', () => assert.equal(e13.api.handoffMs, 380))
H.check('reduced 不播钟声', () => assert.equal(e13.audios.length, 0))
H.check('reduced --vyron-k = 380/1200', () => {
  assert.equal(e13.html.style.getPropertyValue('--vyron-k'), String(derive(85).k(380)))
})
e13.advance(380)
H.check('reduced 交接清理且不算失败', () => {
  assert.equal(findById(e13, 'dsh-vyron-root'), null)
  assert.equal(e13.window.__DSH_VYRON_FAILED__, false)
})

/* ───────────────────────────── [11] QA 后门 */
console.log('[11] QA 后门')
let e14 = boot(BASE, { search: '?vyron_nosplash=1' })
H.check('vyron_nosplash=1 移除根节点', () => assert.equal(findById(e14, 'dsh-vyron-root'), null))
H.check('vyron_nosplash=1 不建 iframe', () => assert.equal(findIframe(e14), null))
H.check('vyron_nosplash=1 state=done', () => assert.equal(e14.window.__DSH_VYRON_API__.state, 'done'))
H.check('vyron_nosplash=1 不算失败', () => assert.equal(e14.window.__DSH_VYRON_FAILED__, false))
H.check('vyron_nosplash=1 解锁滚动', () => {
  assert.ok(!e14.html.classList.contains('vyron-lock'))
  assert.equal(e14.body.style.overflow, '')
})

let e15 = boot(BASE, { search: '?vyron_nosplash=1', injectRoot: false })
H.check('无根节点 + nosplash 直接静默返回', () => {
  assert.equal(findById(e15, 'dsh-vyron-root'), null)
  assert.equal(findIframe(e15), null)
})

let e16 = boot(BASE, { search: '?vyron_speed=999' })
H.check('vyron_speed=999 → 150', () => assert.equal(e16.api.speed, 150))
H.check('vyron_speed 覆写后 watchdog 同步', () => assert.equal(e16.api.watchdogMs, derive(150).watchdog))
let e17 = boot(BASE, { search: '?vyron_speed=10' })
H.check('vyron_speed=10 → 50', () => assert.equal(e17.api.speed, 50))
let e18 = boot(BASE, { search: '?vyron_reduced=1' })
H.check('vyron_reduced=1 → URL reduced=1', () => assert.ok(e18.has('[?&]reduced=1(&|$)')))
let e19 = boot(BASE, { search: '?reduced=1' })
H.check('reduced=1 别名同样生效', () => assert.ok(e19.has('[?&]reduced=1(&|$)')))

/* ───────────────────────── [12] 消息健壮性 */
console.log('[12] 消息健壮性')
let e20 = boot(BASE)
e20.fire({ type: 'dsh-startup-vyron:ready' }, {})
H.check('错误来源的 ready 被忽略', () => assert.equal(e20.api.ready, false))
e20.fire({ type: 'unknown:type' })
H.check('未知消息类型被忽略', () => assert.equal(e20.api.ready, false))
e20.fire(null)
e20.fire('string-data')
e20.fire({ type: 42 })
H.check('非法 data 不抛异常', () => assert.equal(e20.api.state, 'running'))
e20.fire({ type: 'dsh-startup-vyron:progress', t: 'abc' })
H.check('非法 progress.t 不污染进度', () => assert.equal(e20.api.progress, 0))
e20.advance(derive(85).watchdog + 1)
H.check('看门狗仍然生效', () => assert.equal(e20.api.state, 'done'))

/* ───────────────────────── [13] disabled 与重复加载 */
console.log('[13] disabled 与重复加载')
let e21 = boot(Object.assign({}, BASE, { enabled: false }))
H.check('enabled=false 移除根节点', () => assert.equal(findById(e21, 'dsh-vyron-root'), null))
H.check('enabled=false 不建 iframe', () => assert.equal(findIframe(e21), null))
H.check('enabled=false state=done 且不算失败', () => {
  assert.equal(e21.window.__DSH_VYRON_API__.state, 'done')
  assert.equal(e21.window.__DSH_VYRON_FAILED__, false)
})

let e22 = boot(BASE)
const first = e22.frame
vm.runInContext(SPLASH_CODE, e22.context, { filename: 'splash.js' })
H.check('重复加载守卫（__DSH_VYRON_BOOTED__）', () => {
  assert.equal(e22.frame, first)
  assert.equal(e22.root.children.filter((c) => c.tagName === 'IFRAME').length, 1)
})

/* ───────────────────── [14] 页面内全屏预览（Round2.1） */
console.log('[14] 页面内全屏预览')
/* 预览会重建 iframe：消息必须用「当前」iframe 的 contentWindow 投递 */
function winFrame(env) { const f = findIframe(env); return f ? f.contentWindow : {} }
function fireCurrent(env, data) { return env.fire(data, winFrame(env)) }
H.check('API 暴露 preview()', () => assert.equal(typeof e22.api.preview, 'function'))
let e23 = boot(BASE)
const d23 = derive(85)
H.check('启动层播放中 preview() 返回 false', () => assert.equal(e23.api.preview({ speed: 120 }), false))
e23.ready()
e23.done('natural')
e23.advance(d23.handoff)
H.check('自然结束后 preview() 返回 true 并重新挂载', () => {
  const ok = e23.api.preview({ speed: 120, sound: false, volume: 20 })
  assert.equal(ok, true)
  assert.equal(e23.api.state, 'running')
  assert.ok(findIframe(e23), '预览应重新建 iframe')
})
H.check('预览 iframe 使用草稿参数（speed=120 / volume=20 / sound=0）', () => {
  const url = String(findIframe(e23).src)
  assert.match(url, /[?&]speed=120(&|$)/)
  assert.match(url, /[?&]volume=20(&|$)/)
  assert.match(url, /[?&]sound=0(&|$)/)
})
H.check('预览强制 allowSkip=true（不带 allowSkip=0，Esc/点击可退出）', () => {
  const url = String(findIframe(e23).src)
  assert.doesNotMatch(url, /[?&]allowSkip=0(&|$)/)
})
H.check('预览期间 api.config 为草稿值（不写盘）', () => {
  assert.equal(e23.api.speed, 120)
  assert.equal(e23.api.config.sound, false)
  assert.equal(e23.api.config.volume, 20)
})
/* 模拟预览 iframe 播完 → 交接清理后配置还原 */
fireCurrent(e23, { type: 'dsh-startup-vyron:ready' })
fireCurrent(e23, { type: 'dsh-startup-vyron:done', reason: 'natural' })
e23.advance(d23.handoff)
H.check('预览结束配置还原（speed=85 / sound=true / volume=65 / allowSkip=true）', () => {
  assert.equal(e23.api.speed, 85)
  assert.equal(e23.api.config.sound, true)
  assert.equal(e23.api.config.volume, 65)
  assert.equal(e23.api.config.allowSkip, true)
})
H.check('预览不算失败（__DSH_VYRON_FAILED__=false）', () => assert.equal(e23.window.__DSH_VYRON_FAILED__, false))

let e24 = boot(BASE)
e24.ready()
e24.done('natural')
e24.advance(d23.handoff)
e24.api.preview({ reduced: true })
H.check('预览 reduced 草稿 → iframe reduced=1', () => {
  const url = String(findIframe(e24).src)
  assert.match(url, /[?&]reduced=1(&|$)/)
})
fireCurrent(e24, { type: 'dsh-startup-vyron:ready' })
fireCurrent(e24, { type: 'dsh-startup-vyron:done', reason: 'reduced' })
e24.advance(380)
H.check('reduced 预览交接 380ms 内清理', () => assert.equal(findById(e24, 'dsh-vyron-root'), null))

let e25 = boot(BASE)
e25.ready()
e25.done('natural')
e25.advance(d23.handoff)
H.check('自定义事件 dsh-vyron:preview 可触发预览', () => {
  e25.fireWindowEvent('dsh-vyron:preview', { detail: { speed: 100 } })
  assert.equal(e25.api.state, 'running')
  assert.match(String(findIframe(e25).src), /[?&]speed=100(&|$)/)
})
fireCurrent(e25, { type: 'dsh-startup-vyron:done', reason: 'skip' })
e25.advance(derive(100).skip)
H.check('Ctrl+Alt+V 快捷键可触发预览（任意页面）', () => {
  e25.fireWindowEvent('keydown', { key: 'v', ctrlKey: true, altKey: true })
  assert.equal(e25.api.state, 'running')
  assert.ok(findIframe(e25))
})
fireCurrent(e25, { type: 'dsh-startup-vyron:done', reason: 'skip' })
e25.advance(derive(85).skip)
H.check('无根节点 + nosplash：仍暴露 API 供页面内预览', () => {
  const e26 = boot(BASE, { search: '?vyron_nosplash=1', injectRoot: false })
  assert.equal(typeof e26.window.__DSH_VYRON_API__, 'object')
  assert.equal(e26.window.__DSH_VYRON_API__.state, 'done')
  assert.equal(e26.window.__DSH_VYRON_API__.preview({ speed: 90 }), true)
  assert.ok(findIframe(e26), '预览应能懒加载启动层/iframe')
  fireCurrent(e26, { type: 'dsh-startup-vyron:done', reason: 'skip' })
  e26.advance(derive(90).skip)
  assert.equal(findById(e26, 'dsh-vyron-root'), null)
})

H.done()
