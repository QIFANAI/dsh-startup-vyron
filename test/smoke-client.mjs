/* ============================================================================
 * smoke-client.mjs — 浏览器半侧（lib/client.js）冒烟
 * ----------------------------------------------------------------------------
 * 用 node:vm + mock __ModuleLoader__ / react / document / fetch 加载 client.js
 * （无显示器）。覆盖面（design-spec §4 皮肤 / §8 配置 / PAUSE-STATE §8 契约）：
 *  [1] 模块加载契约（__ModuleLoader__ / exports.apply / inject=['slots']）
 *  [2] 设置页 section 注册（settings.section + id=startup-vyron + order=27）
 *  [3] 四档 class 切换 off/accent/full/glass
 *  [4] data-vyron-theme 三主题（skin≠off 即设置，与 glass 解耦）
 *  [5] glass 通透度变量：--vyron-glass-alpha(0–100) / --vyron-glass-a(0.55–1.45) 边界
 *  [6] ambient 12 层 va-* 结构与插入位置
 *  [7] glass 降级：static（motion/reduced/低配）与 noblur（无 backdrop-filter）
 *  [8] off 清理：class/theme/变量/ambient 全清
 *  [9] 配置优先于注入 hint 与 fetch 失败兜底
 *  [10] 幂等：重复 apply 不重复注入 skin.css / ambient
 *  [11] 非法值防御：未知 skin/theme 不崩、退回安全态
 *  [12] 可见性降级（document.hidden → --paused）
 *
 * 运行：node test/smoke-client.mjs
 * ========================================================================== */
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { createHarness, makeEnv, readFile } from './_mocks.mjs'

const CLIENT_CODE = readFile('lib/client.js')
const H = createHarness('CLIENT')

const SKIN_CLASS = 'dsh-vyron-skin'
const GLASS_LAYERS = [
  'va-base', 'va-stars', 'va-earth',
  'va-cloud va-c1', 'va-cloud va-c2', 'va-cloud va-c3', 'va-cloud va-c4',
  'va-sea', 'va-sheen', 'va-grain', 'va-vignette', 'va-rim',
]

const reactMock = {
  createElement(tag, props) {
    return { type: tag, props: props || {}, children: Array.prototype.slice.call(arguments, 2) }
  },
}

const okFetch = (payload) => () => Promise.resolve({ ok: true, status: 200, json: async () => payload })

/* 独立复算通透度系数：0→1.45 / 50→1 / 100→0.55（design-spec §4.3） */
function alphaFor(transparency) {
  const raw = Number(transparency)
  const t = Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : 50
  const alpha = 1 + (50 - t) * 0.009
  return Math.round(Math.max(0.55, Math.min(1.45, alpha)) * 1000) / 1000
}

async function loadClient(opts = {}) {
  const env = makeEnv({
    config: opts.hint,
    boot: 'index',
    cores: opts.cores === undefined ? 8 : opts.cores,
    cssSupports: opts.supportsBackdrop === undefined ? undefined : (opts.supportsBackdrop ? true : {}),
    fetch: opts.fetch || okFetch(opts.payload || { ok: true, config: opts.config || {}, defaults: {} }),
  })
  const loader = { calls: [] }
  env.window.__ModuleLoader__ = { load(spec) { loader.calls.push(spec) } }
  const context = vm.createContext(env.sandbox())
  vm.runInContext(CLIENT_CODE, context, { filename: 'client.js' })
  const spec = loader.calls[0]
  const requires = []
  const mod = spec.factory((name) => {
    requires.push(name)
    if (name === 'react') return reactMock
    throw new Error('unexpected require: ' + name)
  })
  const injected = []
  const registered = []
  const ctx = {
    slots: {
      inject: (name, fn) => { injected.push({ name, fn }) },
      register: (desc, component) => { registered.push({ desc, component }); return () => {} },
    },
  }
  /* factory 返回的就是 module.exports 本体 */
  mod.apply(ctx)
  await env.flush()
  await env.flush()
  return {
    env,
    html: env.html,
    loader,
    spec,
    mod,
    requires,
    injected,
    registered,
    ctx,
    skin: env.window.__DSH_VYRON_SKIN__,
    ambient: env.document.getElementById('dsh-vyron-ambient'),
    skinLink: env.document.getElementById('dsh-vyron-skin-css'),
    reapply(hint) {
      env.window.__DSH_VYRON__ = hint
      /* factory 返回的就是 module.exports 本体 */
  mod.apply(ctx)
    },
  }
}

const themeOf = (html) => html.getAttribute('data-vyron-theme')
const classText = (html) => html.className

/* ───────────────────────────────────────────── [1] 模块加载契约 */
console.log('[1] 模块加载契约')
let c = await loadClient({ config: { skin: 'accent', skinTheme: 'orbit' }, hint: { skin: 'accent', skinTheme: 'orbit' } })
H.check('__ModuleLoader__.load 被调用 1 次', () => assert.equal(c.loader.calls.length, 1))
H.check('模块 id = dsh-startup-vyron', () => assert.equal(c.spec.id, 'dsh-startup-vyron'))
H.check('factory 是函数', () => assert.equal(typeof c.spec.factory, 'function'))
H.check('exports.apply / exports.inject', () => {
  assert.equal(typeof c.mod.apply, 'function')
  assert.deepEqual(Array.from(c.mod.inject), ['slots'])
})
H.check('仅 require react', () => assert.deepEqual(c.requires, ['react']))
H.check('注入设置页样式 <style data-plugin-css>', () => {
  const style = c.env.document.querySelector('style[data-plugin-css="dsh-startup-vyron/main.css"]')
  assert.ok(style, 'style 未注入')
  assert.equal(style.dataset.plugin, 'dsh-startup-vyron')
  assert.match(style.textContent, /__me_root/)
  assert.match(style.textContent, /__me_segBtn/)
})
H.check('加载即应用注入 hint 的皮肤（减少首屏闪烁）', () => assert.ok(c.html.classList.contains(SKIN_CLASS + '--accent')))

/* ───────────────────────────────────────── [2] 设置页 section */
console.log('[2] 设置页 section 注册')
H.check('slots.inject(settings.section) 调用', () => {
  assert.equal(c.injected.length, 1)
  assert.equal(c.injected[0].name, 'settings.section')
  assert.equal(typeof c.injected[0].fn, 'function')
})
c.injected[0].fn()
H.check('slots.register 描述符', () => {
  assert.equal(c.registered.length, 1)
  const desc = c.registered[0].desc
  assert.equal(desc.name, 'settings.section')
  assert.equal(desc.id, 'startup-vyron')
  assert.equal(desc.order, 27)
  assert.match(desc.label, /VYRON/)
})
H.check('section 组件是函数', () => assert.equal(typeof c.registered[0].component, 'function'))

/* ───────────────────────────────────────── [3] 四档 class 切换 */
console.log('[3] 四档 class 切换')
c = await loadClient({ config: { skin: 'accent', skinTheme: 'orbit' }, hint: { skin: 'accent', skinTheme: 'orbit' } })
H.check('accent：dsh-vyron-skin + --accent', () => {
  assert.ok(c.html.classList.contains(SKIN_CLASS))
  assert.ok(c.html.classList.contains(SKIN_CLASS + '--accent'))
  assert.ok(!c.html.classList.contains(SKIN_CLASS + '--full'))
  assert.ok(!c.html.classList.contains(SKIN_CLASS + '--glass'))
})
H.check('accent：无 ambient 背景层', () => assert.equal(c.ambient, null))
H.check('accent：publishSkinState', () => {
  assert.equal(c.skin.mode, 'accent')
  assert.equal(c.skin.applied, true)
  assert.equal(c.skin.ambient, false)
})

c = await loadClient({ config: { skin: 'full', skinTheme: 'orbit' }, hint: { skin: 'full', skinTheme: 'orbit' } })
H.check('full：dsh-vyron-skin + --full', () => {
  assert.ok(c.html.classList.contains(SKIN_CLASS + '--full'))
  assert.ok(!c.html.classList.contains(SKIN_CLASS + '--glass'))
})
H.check('full：无 ambient', () => assert.equal(c.ambient, null))

c = await loadClient({ config: { skin: 'glass', skinTheme: 'orbit' }, hint: { skin: 'glass', skinTheme: 'orbit' } })
H.check('glass：dsh-vyron-skin + --glass', () => {
  assert.ok(c.html.classList.contains(SKIN_CLASS))
  assert.ok(c.html.classList.contains(SKIN_CLASS + '--glass'))
})
H.check('glass：ambient 存在', () => assert.ok(c.ambient))

/* ───────────────────────────────────── [4] data-vyron-theme */
console.log('[4] data-vyron-theme')
H.check('glass/orbit → data-vyron-theme="orbit"', () => assert.equal(themeOf(c.html), 'orbit'))
for (const theme of ['terra', 'abyss']) {
  const run = await loadClient({ config: { skin: 'glass', skinTheme: theme }, hint: { skin: 'glass', skinTheme: theme } })
  H.check('glass/' + theme + ' 主题属性', () => assert.equal(themeOf(run.html), theme))
}
let accentTerra = await loadClient({ config: { skin: 'accent', skinTheme: 'terra' }, hint: { skin: 'accent', skinTheme: 'terra' } })
H.check('accent 档也设置主题属性（与 glass 解耦）', () => assert.equal(themeOf(accentTerra.html), 'terra'))
let fullAbyss = await loadClient({ config: { skin: 'full', skinTheme: 'abyss' }, hint: { skin: 'full', skinTheme: 'abyss' } })
H.check('full 档也设置主题属性', () => assert.equal(themeOf(fullAbyss.html), 'abyss'))

/* ────────────────────────── [5] glass 通透度变量与边界 */
console.log('[5] glass 通透度变量')
function varOf(html, name) { return html.style.getPropertyValue(name) }

c = await loadClient({ config: { skin: 'glass', glassTransparency: 50 }, hint: { skin: 'glass', glassTransparency: 50 } })
H.check('50 档：--vyron-glass-alpha=50（原始 0–100）', () => assert.equal(varOf(c.html, '--vyron-glass-alpha'), '50'))
H.check('50 档：--vyron-glass-a=1（归一化）', () => assert.equal(varOf(c.html, '--vyron-glass-a'), '1'))
H.check('50 档：--vyron-glass-t 别名=50', () => assert.equal(varOf(c.html, '--vyron-glass-t'), '50'))
H.check('50 档：publishSkinState 同步', () => {
  assert.equal(c.skin.glassTransparency, 50)
  assert.equal(c.skin.glassAlpha, 1)
})

c = await loadClient({ config: { skin: 'glass', glassTransparency: 0 }, hint: { skin: 'glass', glassTransparency: 0 } })
H.check('0 档（最厚重）：alpha=0 / a=1.45', () => {
  assert.equal(varOf(c.html, '--vyron-glass-alpha'), '0')
  assert.equal(varOf(c.html, '--vyron-glass-a'), '1.45')
})
c = await loadClient({ config: { skin: 'glass', glassTransparency: 100 }, hint: { skin: 'glass', glassTransparency: 100 } })
H.check('100 档（最通透）：alpha=100 / a=0.55', () => {
  assert.equal(varOf(c.html, '--vyron-glass-alpha'), '100')
  assert.equal(varOf(c.html, '--vyron-glass-a'), '0.55')
})
c = await loadClient({ config: { skin: 'glass', glassTransparency: 150 }, hint: { skin: 'glass', glassTransparency: 150 } })
H.check('150 钳到 100（a=0.55）', () => {
  assert.equal(varOf(c.html, '--vyron-glass-alpha'), '100')
  assert.equal(varOf(c.html, '--vyron-glass-a'), '0.55')
})
c = await loadClient({ config: { skin: 'glass', glassTransparency: -5 }, hint: { skin: 'glass', glassTransparency: -5 } })
H.check('-5 钳到 0（a=1.45）', () => {
  assert.equal(varOf(c.html, '--vyron-glass-alpha'), '0')
  assert.equal(varOf(c.html, '--vyron-glass-a'), '1.45')
})
c = await loadClient({ config: { skin: 'glass', glassTransparency: 'abc' }, hint: { skin: 'glass', glassTransparency: 'abc' } })
H.check('非法值回默认 50（a=1）', () => {
  assert.equal(varOf(c.html, '--vyron-glass-alpha'), '50')
  assert.equal(varOf(c.html, '--vyron-glass-a'), '1')
})
c = await loadClient({ config: { skin: 'glass', glassTransparency: 33.7 }, hint: { skin: 'glass', glassTransparency: 33.7 } })
H.check('33.7 取整 34（a=' + alphaFor(34) + '）', () => {
  assert.equal(varOf(c.html, '--vyron-glass-alpha'), '34')
  assert.equal(varOf(c.html, '--vyron-glass-a'), String(alphaFor(34)))
})

/* ───────────────────────────── [6] ambient 12 层结构 */
console.log('[6] ambient 12 层结构')
c = await loadClient({ config: { skin: 'glass' }, hint: { skin: 'glass' } })
H.check('ambient id = dsh-vyron-ambient', () => assert.equal(c.ambient.id, 'dsh-vyron-ambient'))
H.check('ambient aria-hidden + data-plugin', () => {
  assert.equal(c.ambient.getAttribute('aria-hidden'), 'true')
  assert.equal(c.ambient.getAttribute('data-plugin'), 'dsh-startup-vyron')
})
H.check('ambient 是 body 首子节点', () => assert.equal(c.env.body.children[0], c.ambient))
H.check('ambient 恰好 12 层', () => assert.equal(c.ambient.children.length, 12))
H.check('12 层 class 顺序与契约一致', () => {
  const actual = c.ambient.children.map((n) => n.className)
  assert.deepEqual(actual, GLASS_LAYERS)
})
H.check('云层为 va-cloud va-c1..c4', () => {
  const clouds = c.ambient.children.filter((n) => n.classList.contains('va-cloud'))
  assert.equal(clouds.length, 4)
  for (let i = 1; i <= 4; i++) assert.ok(c.ambient.children.some((n) => n.classList.contains('va-c' + i)), 'va-c' + i)
})

/* ───────────────────────── [7] glass 降级 static / noblur */
console.log('[7] glass 降级')
c = await loadClient({ config: { skin: 'glass', skinMotion: false }, hint: { skin: 'glass', skinMotion: false } })
H.check('skinMotion=false → --static', () => assert.ok(c.html.classList.contains(SKIN_CLASS + '--static')))
c = await loadClient({ config: { skin: 'glass', reducedMotion: true }, hint: { skin: 'glass', reducedMotion: true } })
H.check('reducedMotion=true → --static', () => assert.ok(c.html.classList.contains(SKIN_CLASS + '--static')))
c = await loadClient({ config: { skin: 'glass' }, hint: { skin: 'glass' }, cores: 4 })
H.check('4 线程低配 → --static', () => assert.ok(c.html.classList.contains(SKIN_CLASS + '--static')))
c = await loadClient({ config: { skin: 'glass' }, hint: { skin: 'glass' }, cores: 8 })
H.check('8 线程且 motion=true → 无 --static', () => assert.ok(!c.html.classList.contains(SKIN_CLASS + '--static')))
c = await loadClient({ config: { skin: 'glass' }, hint: { skin: 'glass' }, supportsBackdrop: false })
H.check('不支持 backdrop-filter → --noblur', () => assert.ok(c.html.classList.contains(SKIN_CLASS + '--noblur')))
const blurOk = await loadClient({ config: { skin: 'glass' }, hint: { skin: 'glass' }, supportsBackdrop: true })
H.check('支持 backdrop-filter → 无 --noblur', () => assert.ok(!blurOk.html.classList.contains(SKIN_CLASS + '--noblur')))

/* ───────────────────────────────── [8] off 清理 */
console.log('[8] off 清理')
let glassThenOff = await loadClient({ config: { skin: 'glass', skinTheme: 'terra' }, hint: { skin: 'glass', skinTheme: 'terra' } })
H.check('glass 起始态完整', () => {
  assert.ok(glassThenOff.html.classList.contains(SKIN_CLASS + '--glass'))
  assert.ok(glassThenOff.ambient)
  assert.equal(themeOf(glassThenOff.html), 'terra')
})
glassThenOff.reapply({ skin: 'off', skinTheme: 'terra' })
await glassThenOff.env.flush()
H.check('off：移除 dsh-vyron-skin 全部 class', () => {
  assert.ok(!glassThenOff.html.classList.contains(SKIN_CLASS))
  for (const tier of ['--accent', '--full', '--glass', '--static', '--paused', '--noblur']) {
    assert.ok(!glassThenOff.html.classList.contains(SKIN_CLASS + tier), tier)
  }
})
H.check('off：移除 data-vyron-theme', () => assert.equal(themeOf(glassThenOff.html), null))
H.check('off：移除 ambient 背景层', () => assert.equal(glassThenOff.env.document.getElementById('dsh-vyron-ambient'), null))
H.check('off：移除三个玻璃变量', () => {
  assert.equal(varOf(glassThenOff.html, '--vyron-glass-alpha'), '')
  assert.equal(varOf(glassThenOff.html, '--vyron-glass-a'), '')
  assert.equal(varOf(glassThenOff.html, '--vyron-glass-t'), '')
})
H.check('off：publishSkinState applied=false', () => {
  assert.equal(glassThenOff.env.window.__DSH_VYRON_SKIN__.applied, false)
  assert.equal(glassThenOff.env.window.__DSH_VYRON_SKIN__.mode, 'off')
})

/* ─────────────── [9] 配置优先 / fetch 失败兜底 */
console.log('[9] 配置优先与兜底')
let priority = await loadClient({
  hint: { skin: 'accent', skinTheme: 'orbit', glassTransparency: 50 },
  payload: { ok: true, config: { skin: 'glass', skinTheme: 'abyss', glassTransparency: 20 } },
})
H.check('fetch 配置覆盖注入 hint', () => {
  assert.ok(priority.html.classList.contains(SKIN_CLASS + '--glass'))
  assert.equal(themeOf(priority.html), 'abyss')
  assert.equal(varOf(priority.html, '--vyron-glass-alpha'), '20')
})

let failed = await loadClient({ fetch: () => Promise.reject(new Error('network down')) })
H.check('fetch 失败 → 默认 glass 兜底', () => assert.ok(failed.html.classList.contains(SKIN_CLASS + '--glass')))
H.check('fetch 失败只 warn 不 error', () => {
  assert.ok(failed.env.logs.warn.some((line) => /读取皮肤配置失败/.test(line)), failed.env.logs.warn.join('|'))
  assert.equal(failed.env.logs.error.length, 0)
})

let notOk = await loadClient({ payload: { ok: false } })
H.check('config.ok !== true 同样兜底', () => assert.ok(notOk.html.classList.contains(SKIN_CLASS + '--glass')))

/* ───────────────────────────────── [10] 幂等 */
console.log('[10] 幂等')
let idem = await loadClient({ config: { skin: 'glass' }, hint: { skin: 'glass' } })
const ambientFirst = idem.ambient
idem.reapply({ skin: 'glass', glassTransparency: 50 })
await idem.env.flush()
H.check('重复 apply 不重复 ambient', () => {
  assert.equal(idem.env.document.getElementById('dsh-vyron-ambient'), ambientFirst)
  let count = 0
  idem.env.walkAll(idem.env.html, (n) => { if (n.id === 'dsh-vyron-ambient') count++ }, [])
  assert.equal(count, 1)
})
H.check('重复 apply 不重复注入 skin.css', () => {
  let links = 0
  idem.env.walkAll(idem.env.html, (n) => { if (n.id === 'dsh-vyron-skin-css') links++ }, [])
  assert.equal(links, 1)
})
H.check('skin.css link href 指向 /dsh-vyron/skin.css', () => {
  assert.match(idem.skinLink.getAttribute('href') || idem.skinLink.href, /^\/dsh-vyron\/skin\.css\?v=/)
})
H.check('skin.css link rel=stylesheet + data-plugin', () => {
  assert.equal(idem.skinLink.rel, 'stylesheet')
  assert.equal(idem.skinLink.dataset.plugin, 'dsh-startup-vyron')
})

/* ───────────────────────── [11] 非法值防御 */
console.log('[11] 非法值防御')
let bogusSkin = await loadClient({ config: { skin: 'bogus', skinTheme: 'orbit' }, hint: { skin: 'bogus', skinTheme: 'orbit' } })
H.check('未知 skin 退回 off（安全关闭，不崩）', () => {
  assert.equal(bogusSkin.skin.mode, 'off')
  assert.ok(!bogusSkin.html.classList.contains(SKIN_CLASS))
})
let bogusTheme = await loadClient({ config: { skin: 'glass', skinTheme: 'bogus' }, hint: { skin: 'glass', skinTheme: 'bogus' } })
H.check('未知 theme 退回 orbit', () => assert.equal(themeOf(bogusTheme.html), 'orbit'))

/* ───────────────────────── [12] 可见性降级 */
console.log('[12] 可见性降级')
let vis = await loadClient({ config: { skin: 'glass' }, hint: { skin: 'glass' } })
H.check('document.hidden=true → --paused', () => {
  vis.env.document.hidden = true
  vis.env.document.dispatchEvent({ type: 'visibilitychange' })
  assert.ok(vis.html.classList.contains(SKIN_CLASS + '--paused'))
})
H.check('document.hidden=false → 移除 --paused', () => {
  vis.env.document.hidden = false
  vis.env.document.dispatchEvent({ type: 'visibilitychange' })
  assert.ok(!vis.html.classList.contains(SKIN_CLASS + '--paused'))
})

H.done()
