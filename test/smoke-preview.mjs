/* ============================================================================
 * smoke-preview.mjs — 启动页（preview/）契约冒烟
 * ----------------------------------------------------------------------------
 * 纯 node：vm 加载 preview/js/timeline.js 做行为断言，源码/HTML 做结构性断言。
 * 覆盖面（design-spec §3 时间轴 / §5 声音事件 / §7 模块契约）：
 *  [1] timeline.js 契约导出
 *  [2] 6 相位起止与 §3 逐项一致（TOTAL=9.8 / 0.65 / 2.45 / 2.0 / 2.5 / 1.4 / 0.8）
 *  [3] phaseAt 边界语义
 *  [4] paramsFromLocation：?t= 定格、speed/volume/reduced/allowSkip/sound/embed/autoskip
 *  [5] 声音 CUES 13 事件与 §5 事件表一致
 *  [6] index.html：4 个模块脚本 + 4 个 CSS 全部存在、加载顺序、ID 契约齐全
 *  [7] 消息协议常量（ready/progress/done + natural/skip/reduced）
 *  [8] main.js 编排契约：?t= 单帧定格、reduced 2.2s 停留、缺模块降级、__VYRON_STAGE__
 *  [9] 三模块 + audio 的 window.VYRON_* 契约
 *  [10] 跨文件常量一致（TOTAL=9.8 / HANDOFF=950 三处以上）
 *
 * 运行：node test/smoke-preview.mjs
 * ========================================================================== */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createHarness, ROOT, readFile, fileExists, fileSize } from './_mocks.mjs'

const H = createHarness('PREVIEW')
const p = (rel) => path.join(ROOT, rel)

/* 本测试自己声明的权威常量（design-spec §3；PAUSE-STATE §2 要求"三处一致"） */
const TOTAL = 9.8
const HANDOFF_MS = 1200
const EXPECTED_PHASES = [
  { key: 'signal', a: 0.00, b: 0.65 },
  { key: 'console', a: 0.65, b: 3.10 },
  { key: 'breach', a: 3.10, b: 5.10 },
  { key: 'whale', a: 5.10, b: 7.60 },
  { key: 'lockup', a: 7.60, b: 9.00 },
  { key: 'bloom', a: 9.00, b: 9.80 },
]
const EXPECTED_CUES = [
  [0.00, 'ping'], [0.30, 'drone'],
  [0.75, 'beep-1'], [1.05, 'beep-2'], [1.38, 'beep-3'], [1.72, 'beep-4'],
  [3.10, 'impact'], [3.30, 'wind-in'], [4.40, 'riser'],
  [5.15, 'call-1'], [6.35, 'call-2'],
  [7.60, 'lock-hit'], [8.60, 'power-down'],
]
const REQUIRED_IDS = [
  'vyStage', 'vyFx', 'vyHudRoot', 'vyWhaleRoot',
  'vyLockup', 'vyMarkSlot', 'vyLockupMeta', 'vyHint', 'vySkip',
]
const REQUIRED_SCRIPTS = [
  '../lib/audio.js', 'js/timeline.js', 'js/engine.js', 'js/hud.js', 'js/whale.js', 'js/main.js',
]
const REQUIRED_CSS = ['css/splash.css', 'css/engine.css', 'css/hud.css', 'css/whale.css']
const MODULE_SCRIPTS = ['js/engine.js', 'js/hud.js', 'js/whale.js', 'js/main.js']

const TIMELINE_CODE = readFile('preview/js/timeline.js')
const INDEX_HTML = readFile('preview/index.html')
const MAIN_JS = readFile('preview/js/main.js')

/* ────────────────────────────────────────── [1] timeline 契约导出 */
console.log('[1] timeline.js 契约导出')
const tlEnv = {
  window: {},
  console,
  URLSearchParams: globalThis.URLSearchParams,
  isFinite,
  parseInt,
  parseFloat,
  Math,
  Number,
  String,
  Object,
  Array,
}
tlEnv.window.window = tlEnv.window
const tlContext = vm.createContext(tlEnv)
vm.runInContext(TIMELINE_CODE, tlContext, { filename: 'timeline.js' })
const TL = tlEnv.window.VYRON_TIMELINE
H.check('window.VYRON_TIMELINE 存在', () => assert.equal(typeof TL, 'object'))
const REQUIRED_TL_KEYS = ['TOTAL', 'PHASES', 'SPEED_MIN', 'SPEED_MAX', 'clamp', 'smooth', 'lerp', 'phaseAt', 'paramsFromLocation']
for (const key of REQUIRED_TL_KEYS) {
  H.check('导出 ' + key, () => assert.ok(TL[key] !== undefined, '缺 ' + key))
}
H.check('辅助导出 phaseProgress/easeInOutCubic/BASE_WALL_MS', () => {
  assert.equal(typeof TL.phaseProgress, 'function')
  assert.equal(typeof TL.easeInOutCubic, 'function')
  assert.equal(TL.BASE_WALL_MS, 11529)
  assert.equal(TL.HANDOFF_BASE_MS, HANDOFF_MS)
  assert.equal(TL.SPEED_DEFAULT, 85)
})

/* ────────────────────────── [2] 6 相位与 §3 一致 */
console.log('[2] 6 相位与设计规格一致')
H.check('TOTAL = 9.8', () => assert.equal(TL.TOTAL, TOTAL))
H.check('相位数量 6', () => assert.equal(TL.PHASES.length, 6))
for (let i = 0; i < EXPECTED_PHASES.length; i++) {
  const want = EXPECTED_PHASES[i]
  H.check('P' + i + ' ' + want.key + ' [' + want.a.toFixed(2) + ',' + want.b.toFixed(2) + ']', () => {
    const got = TL.PHASES[i]
    assert.equal(got.key, want.key)
    assert.ok(Math.abs(got.a - want.a) < 1e-9, 'a=' + got.a)
    assert.ok(Math.abs(got.b - want.b) < 1e-9, 'b=' + got.b)
  })
}
H.check('相位首尾相接且覆盖 0..TOTAL', () => {
  assert.equal(TL.PHASES[0].a, 0)
  assert.equal(TL.PHASES[TL.PHASES.length - 1].b, TOTAL)
  for (let i = 1; i < TL.PHASES.length; i++) assert.equal(TL.PHASES[i].a, TL.PHASES[i - 1].b)
})
H.check('节拍时长 0.65/2.45/2.0/2.5/1.4/0.8', () => {
  const durations = Array.from(TL.PHASES, (ph) => Math.round((ph.b - ph.a) * 100) / 100)
  assert.deepEqual(durations, [0.65, 2.45, 2.0, 2.5, 1.4, 0.8])
})
H.check('速度区间 50–150 / 默认 85', () => {
  assert.equal(TL.SPEED_MIN, 50)
  assert.equal(TL.SPEED_MAX, 150)
  assert.equal(TL.SPEED_DEFAULT, 85)
})

/* ────────────────────────── [3] phaseAt 边界 */
console.log('[3] phaseAt 边界语义')
H.check('phaseAt(0) = signal', () => assert.equal(TL.phaseAt(0).key, 'signal'))
H.check('phaseAt(0.649) = signal', () => assert.equal(TL.phaseAt(0.649).key, 'signal'))
H.check('phaseAt(0.65) = console（左闭右开）', () => assert.equal(TL.phaseAt(0.65).key, 'console'))
H.check('phaseAt(3.10) = breach', () => assert.equal(TL.phaseAt(3.1).key, 'breach'))
H.check('phaseAt(5.10) = whale', () => assert.equal(TL.phaseAt(5.1).key, 'whale'))
H.check('phaseAt(7.60) = lockup', () => assert.equal(TL.phaseAt(7.6).key, 'lockup'))
H.check('phaseAt(9.00) = bloom', () => assert.equal(TL.phaseAt(9.0).key, 'bloom'))
H.check('phaseAt(9.8) = bloom（终点不平移）', () => assert.equal(TL.phaseAt(9.8).key, 'bloom'))
H.check('phaseProgress 中点 0.5', () => assert.equal(TL.phaseProgress(1.875, 'console'), 0.5))
H.check('clamp / smooth 端点', () => {
  assert.equal(TL.clamp(5, 0, 1), 1)
  assert.equal(TL.smooth(0), 0)
  assert.equal(TL.smooth(1), 1)
  assert.equal(TL.smooth(0.5), 0.5)
  assert.equal(TL.lerp(0, 10, 0.25), 2.5)
})

/* ──────────────────── [4] paramsFromLocation（?t= 定格等） */
console.log('[4] paramsFromLocation')
const P = (search, injected) => TL.paramsFromLocation(search, injected)
H.check('?t=4.2 → freezeT=4.2', () => assert.equal(P('?t=4.2').freezeT, 4.2))
H.check('?t=12 钳到 TOTAL+0.6=10.4', () => assert.equal(P('?t=12').freezeT, 10.4))
H.check('?t=-1 钳到 0（定格首帧）', () => assert.equal(P('?t=-1').freezeT, 0))
H.check('?t=abc → 不定格', () => assert.equal(P('?t=abc').freezeT, null))
H.check('无 t 参数 → freezeT=null', () => assert.equal(P('').freezeT, null))
H.check('?speed=85 → speedRatio 0.85 / wallMs 11529', () => {
  const params = P('?speed=85')
  assert.equal(params.speed, 85)
  assert.equal(params.speedRatio, 0.85)
  assert.equal(params.raw.wallMs, 11529)
})
H.check('?speed=999 → 150 / wallMs 6533', () => {
  const params = P('?speed=999')
  assert.equal(params.speed, 150)
  assert.equal(params.raw.wallMs, 6533)
})
H.check('?speed=10 → 50 / wallMs 19600', () => {
  const params = P('?speed=10')
  assert.equal(params.speed, 50)
  assert.equal(params.raw.wallMs, 19600)
})
H.check('?volume=150 → 100', () => assert.equal(P('?volume=150').volume, 100))
H.check('?volume=-5 → 0', () => assert.equal(P('?volume=-5').volume, 0))
H.check('?sound=0 → sound=false', () => assert.equal(P('?sound=0').sound, false))
H.check('?reduced=1 → reduced=true', () => assert.equal(P('?reduced=1').reduced, true))
H.check('?allowSkip=0 → allowSkip=false', () => assert.equal(P('?allowSkip=0').allowSkip, false))
H.check('?embed=1 / ?preview=1 / ?probe=1', () => {
  assert.equal(P('?embed=1').embed, true)
  assert.equal(P('?preview=1').preview, true)
  assert.equal(P('?probe=1').probe, true)
})
H.check('?autoskip=3.5 → 3.5', () => assert.equal(P('?autoskip=3.5').autoskip, 3.5))
H.check('?v=0.1.0 版本透传', () => assert.equal(P('?v=0.1.0').version, '0.1.0'))
H.check('宿主注入兜底：injected.splashSpeed/volume/reducedMotion/allowSkip/sound', () => {
  const params = P('', { splashSpeed: 150, volume: 20, reducedMotion: true, allowSkip: false, sound: false })
  assert.equal(params.speed, 150)
  assert.equal(params.volume, 20)
  assert.equal(params.reduced, true)
  assert.equal(params.allowSkip, false)
  assert.equal(params.sound, false)
})
H.check('query 优先于宿主注入（speed/volume）', () => {
  const params = P('?speed=50&volume=80', { splashSpeed: 150, volume: 20, reducedMotion: true })
  assert.equal(params.speed, 50)
  assert.equal(params.volume, 80)
  /* reduced 采用 OR 语义：query reduced=1 或宿主 reducedMotion 任一为真即减弱（不能由 query 关闭） */
  assert.equal(params.reduced, true)
  assert.equal(P('?reduced=0', { reducedMotion: true }).reduced, true)
  assert.equal(P('?reduced=1', { reducedMotion: false }).reduced, true)
})
H.check('raw 元数据：total=9.8 / handoffMs=1200 / 13 cues', () => {
  const params = P('')
  assert.equal(params.raw.total, TOTAL)
  assert.equal(params.raw.handoffMs, HANDOFF_MS)
  assert.equal(params.raw.phases.length, 6)
  assert.equal(params.raw.cues.length, 13)
})
H.check('injected.facts 透传', () => {
  const params = P('', { facts: { profile: 'DESKTOP', model: 'deepseek-flash' } })
  assert.equal(params.facts.profile, 'DESKTOP')
})

/* ───────────────── [5] 声音 CUES 与 §5 事件表一致 */
console.log('[5] 声音事件表')
H.check('CUES 13 条', () => assert.equal(TL.CUES.length, 13))
for (let i = 0; i < EXPECTED_CUES.length; i++) {
  const [at, key] = EXPECTED_CUES[i]
  H.check('cue[' + i + '] ' + key + ' @' + at.toFixed(2), () => {
    assert.equal(TL.CUES[i].key, key)
    assert.ok(Math.abs(TL.CUES[i].at - at) < 1e-9, 'at=' + TL.CUES[i].at)
    assert.equal(typeof TL.CUES[i].label, 'string')
  })
}
H.check('CUES 严格升序（音画同轴）', () => {
  for (let i = 1; i < TL.CUES.length; i++) assert.ok(TL.CUES[i].at > TL.CUES[i - 1].at)
})
H.check('关键音画同步点：冲击 3.10 / 鲸叫 5.15,6.35 / 锁版 7.60 / 交接 9.80', () => {
  const at = (key) => TL.CUES.find((c) => c.key === key).at
  assert.equal(at('impact'), 3.1)
  assert.equal(at('call-1'), 5.15)
  assert.equal(at('call-2'), 6.35)
  assert.equal(at('lock-hit'), 7.6)
  assert.equal(TOTAL, 9.8)
})

/* ──────────── [6] index.html 资源与 ID 契约 */
console.log('[6] index.html 资源与 ID 契约')
const scriptRefs = [...INDEX_HTML.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1])
const cssRefs = [...INDEX_HTML.matchAll(/<link[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/g)].map((m) => m[1])
H.check('脚本引用 = ' + REQUIRED_SCRIPTS.length + ' 个（实际 ' + scriptRefs.length + '）', () => {
  assert.deepEqual(scriptRefs, REQUIRED_SCRIPTS)
})
H.check('CSS 引用 = 4 个（实际 ' + cssRefs.length + '）', () => {
  assert.deepEqual(cssRefs, REQUIRED_CSS)
})
H.check('index.html 引用的全部本地脚本文件存在', () => {
  for (const rel of scriptRefs) {
    const abs = rel.startsWith('../') ? path.join(ROOT, 'preview', rel) : p('preview/' + rel)
    assert.ok(fs.existsSync(abs), '缺文件 ' + rel + ' → ' + abs)
  }
})
H.check('index.html 引用的全部 CSS 文件存在', () => {
  for (const rel of cssRefs) assert.ok(fileExists('preview/' + rel), '缺文件 ' + rel)
})
H.check('4 个模块脚本（engine/hud/whale/main）齐全', () => {
  for (const rel of MODULE_SCRIPTS) assert.ok(scriptRefs.includes(rel), '缺 ' + rel)
})
H.check('加载顺序：audio → timeline → engine/hud/whale → main', () => {
  const idx = (rel) => scriptRefs.indexOf(rel)
  assert.ok(idx('../lib/audio.js') < idx('js/timeline.js'))
  assert.ok(idx('js/timeline.js') < idx('js/engine.js'))
  assert.ok(idx('js/engine.js') < idx('js/hud.js'))
  assert.ok(idx('js/hud.js') < idx('js/whale.js'))
  assert.ok(idx('js/whale.js') < idx('js/main.js'))
})
H.check('模块脚本非空（交付完整性）', () => {
  for (const rel of MODULE_SCRIPTS) assert.ok(fileSize('preview/' + rel) > 1024, rel + ' 过小')
})
for (const id of REQUIRED_IDS) {
  H.check('ID 契约 #' + id, () => {
    const count = (INDEX_HTML.match(new RegExp('id="' + id + '"', 'g')) || []).length
    assert.equal(count, 1, id + ' 出现 ' + count + ' 次')
  })
}
H.check('舞台初始相位 data-phase="signal"', () => assert.match(INDEX_HTML, /id="vyStage"[^>]*data-phase="signal"/))
H.check('P0 信号层含 DEEPSEEK HARNESS', () => assert.match(INDEX_HTML, /id="vySignalMain"[^>]*>DEEPSEEK HARNESS</))
/* Round2 回归：开幕即有 DSH 鱼标；P5 收束成线；信号层交棒给 HUD ORBIT CORE */
H.check('P0 信号层含官方鱼标 path（内联、非空）', () => {
  const m = INDEX_HTML.match(/id="vySignalMarkPath"\s+d="([^"]+)"/)
  assert.ok(m, '缺 #vySignalMarkPath')
  assert.ok(m[1].length > 1500, 'path 过短 ' + (m && m[1].length))
})
H.check('P5 收束黑场 #vyBlackout 存在', () => assert.match(INDEX_HTML, /id="vyBlackout"/))
H.check('main.js 实现 P5 收束（--vy-collapse / blackout / 9.02 高闪）', () => {
  assert.match(MAIN_JS, /--vy-collapse/)
  assert.match(MAIN_JS, /is-collapsing/)
  assert.match(MAIN_JS, /blackout/)
  assert.match(MAIN_JS, /9\.02, 9\.40/)
})
H.check('main.js P0 信号层 0.66–0.94s 淡出（交给 HUD 中央 core，无重影）', () => {
  assert.match(MAIN_JS, /TL\.progress\(t, 0\.66, 0\.94\)/)
})
H.check('splash.css 有收束/黑场/光缝增强样式', () => {
  const css = readFile('preview/css/splash.css')
  assert.match(css, /\.vy-blackout/)
  assert.match(css, /is-collapsing/)
  assert.match(css, /--vy-collapse/)
  assert.match(css, /\.vy-signal-mark/)
})
H.check('canvas #vyFx 与 #vyWhaleFx 存在', () => {
  assert.match(INDEX_HTML, /<canvas id="vyFx"/)
  assert.match(INDEX_HTML, /<canvas id="vyWhaleFx"/)
})
H.check('CSS 五件套样式文件均非空且含关键类', () => {
  assert.ok(fileSize('preview/css/splash.css') > 1024)
  assert.match(readFile('preview/css/splash.css'), /\.vy-stage/)
  assert.match(readFile('preview/css/splash.css'), /\.vy-lockup/)
  assert.match(readFile('preview/css/splash.css'), /\.vy-hint/)
  assert.match(readFile('preview/css/splash.css'), /\.vy-skip/)
  assert.match(readFile('preview/css/splash.css'), /\.vy-iris/)
  assert.ok(fileSize('preview/css/engine.css') > 0)
  assert.ok(fileSize('preview/css/hud.css') > 0)
  assert.ok(fileSize('preview/css/whale.css') > 0)
})

/* ───────────────── [7] 消息协议常量 */
console.log('[7] 消息协议常量')
H.check('main.js 消息前缀 dsh-startup-vyron:', () => assert.match(MAIN_JS, /dsh-startup-vyron:'\s*\+\s*type/))
H.check('main.js 发送 ready/progress/done', () => {
  assert.match(MAIN_JS, /post\('ready'/)
  assert.match(MAIN_JS, /post\('progress'/)
  assert.match(MAIN_JS, /post\('done'/)
})
H.check('done 原因 natural/skip/reduced', () => {
  assert.match(MAIN_JS, /finish\('natural'\)/)
  assert.match(MAIN_JS, /finish\('reduced'\)/)
  assert.match(MAIN_JS, /requestFinish\('skip'\)|finish\('skip'\)/)
})
H.check('进度节流 200ms', () => assert.match(MAIN_JS, /lastProgress > 200/))
H.check('postMessage 目标为 parent', () => assert.match(MAIN_JS, /parentWindow\.postMessage/))

/* ───────── [8] main.js 编排契约 */
console.log('[8] main.js 编排契约')
H.check('?t= 定格：FREEZE 非 null 只画一帧并结束', () => {
  assert.match(MAIN_JS, /if \(FREEZE !== null\)/)
  assert.match(MAIN_JS, /draw\(t\)[\s\S]{0,120}finished = true/)
})
H.check('reduced：定格终帧构图（COMPOSE_T = TOTAL-1）+ 2.2s 停留 + done(reduced)', () => {
  assert.match(MAIN_JS, /if \(REDUCED\)/)
  assert.match(MAIN_JS, /var COMPOSE_T = TOTAL - 1/)
  assert.match(MAIN_JS, /draw\(COMPOSE_T\)/)
  assert.match(MAIN_JS, /2200/)
  assert.match(MAIN_JS, /finish\('reduced'\)/)
})
H.check('reduced：0.35s 淡入门槛（wallMs >= 350）', () => {
  assert.match(MAIN_JS, /reducedHoldStart/)
  assert.match(MAIN_JS, /wallMs\(\) >= 350/)
})
H.check('reduced 回归：不得再定格在 P0 黑场 t=0.35（verifier C-1）', () => {
  const reducedBlock = MAIN_JS.slice(MAIN_JS.indexOf('if (REDUCED) {'), MAIN_JS.indexOf('if (P.autoskip'))
  assert.doesNotMatch(reducedBlock, /draw\(0\.35\)/)
  assert.match(reducedBlock, /draw\(COMPOSE_T\)/)
})
H.check('从 timeline 取 TOTAL/phaseAt（唯一权威源）', () => {
  assert.match(MAIN_JS, /TL\.TOTAL/)
  assert.match(MAIN_JS, /TL\.phaseAt/)
  assert.match(MAIN_JS, /TL\.paramsFromLocation/)
})
H.check('三模块防御式调用：create / update|render / dispose 不崩', () => {
  for (const name of ['VYRON_ENGINE', 'VYRON_HUD', 'VYRON_WHALE']) {
    assert.match(MAIN_JS, new RegExp('window\\.' + name), name + ' 未引用')
  }
  assert.match(MAIN_JS, /typeof modules\.engine\.render === 'function'/)
  assert.match(MAIN_JS, /typeof modules\.hud\.update === 'function'/)
  assert.match(MAIN_JS, /typeof modules\.whale\.update === 'function'/)
})
H.check('audio 契约调用：init(src/chimeSrc/enabled/volume/reduced/rate) + start + stop + chime', () => {
  assert.match(MAIN_JS, /window\.VYRON_AUDIO/)
  for (const key of ['src:', 'chimeSrc:', 'enabled:', 'volume:', 'reduced:', 'rate:']) {
    assert.ok(MAIN_JS.includes(key), 'audio init 缺 ' + key)
  }
  assert.match(MAIN_JS, /audioApi\.start\(\)/)
  assert.match(MAIN_JS, /audioApi\.stop\(/)
  assert.match(MAIN_JS, /audioApi\.chime\(\)/)
})
H.check('audio sync(t) 节流对齐（design-spec §5 漂移校正）', () => {
  assert.match(MAIN_JS, /audioApi\.sync\(t\)/)
  assert.match(MAIN_JS, /lastAudioSync > 0\.2|> 0\.2/)
})
H.check('reduced 结束仍播交接钟声（§3：只留 ping + 锁版钟声）', () => {
  const finishBlock = MAIN_JS.slice(MAIN_JS.indexOf('function finish('), MAIN_JS.indexOf('function showEndcard'))
  assert.match(finishBlock, /audioApi\.stop\(/)
  assert.match(finishBlock, /audioApi\.chime\(\)/)
  assert.doesNotMatch(finishBlock, /reason !== 'reduced'/)
})
H.check('QA 钩子 window.__VYRON_STAGE__', () => {
  assert.match(MAIN_JS, /window\.__VYRON_STAGE__/)
  assert.match(MAIN_JS, /state: function/)
  assert.match(MAIN_JS, /params: P/)
})
H.check('probe=1 输出 [vyron-probe] phase', () => {
  assert.match(MAIN_JS, /\[vyron-probe\]/)
  assert.match(MAIN_JS, /'phase ' \+ phase\.key/)
})
H.check('跳过交互：pointerdown / keydown / Escape / 按钮', () => {
  assert.match(MAIN_JS, /pointerdown/)
  assert.match(MAIN_JS, /keydown/)
  assert.match(MAIN_JS, /Escape/)
  assert.match(MAIN_JS, /vySkip/)
})
H.check('main.js 只依赖 window.VYRON_* 与原生 API（无外部 import）', () => {
  assert.doesNotMatch(MAIN_JS, /\bimport\s+[\w{*]/)
  assert.doesNotMatch(MAIN_JS, /\brequire\s*\(/)
})

/* ───────── [9] 三模块 + audio 的 window.VYRON_* 契约 */
console.log('[9] 模块 window.VYRON_* 契约')
const MODULE_FILES = [
  ['preview/js/engine.js', 'VYRON_ENGINE', ['create']],
  ['preview/js/hud.js', 'VYRON_HUD', ['create']],
  ['preview/js/whale.js', 'VYRON_WHALE', ['create']],
  ['lib/audio.js', 'VYRON_AUDIO', ['init', 'start', 'sync', 'stop', 'chime', 'state']],
]
for (const [rel, globalName, fns] of MODULE_FILES) {
  H.check(path.basename(rel) + ' 暴露 window.' + globalName, () => {
    assert.match(readFile(rel), new RegExp('(?:window|global)\\.' + globalName + '\\s*='))
    for (const fn of fns) assert.match(readFile(rel), new RegExp('function ' + fn + '\\b|' + fn + ':\\s*function'), rel + ' 缺 ' + fn)
  })
}
H.check('engine/hud/whale 拒绝额外全局依赖（self-contained）', () => {
  for (const rel of ['preview/js/engine.js', 'preview/js/hud.js', 'preview/js/whale.js']) {
    const code = readFile(rel)
    assert.doesNotMatch(code, /\bimport\s+[\w{*]/, rel + ' 含 import')
    assert.doesNotMatch(code, /\brequire\s*\(/, rel + ' 含 require')
  }
})
H.check('splash.css 含 --vyron-k 交接变量契约', () => {
  assert.match(readFile('lib/splash.css'), /--vyron-k/)
  assert.match(readFile('lib/splash.css'), /vyron-handoff/)
})

/* ───────── [10] 跨文件常量一致（三处以上） */
console.log('[10] 跨文件常量一致')
const extract = (rel, re) => {
  const m = re.exec(readFile(rel))
  assert.ok(m, rel + ' 未匹配到 ' + re)
  return Number(m[1])
}
const totalInTimeline = extract('preview/js/timeline.js', /var TOTAL = ([\d.]+)/)
const totalInSplash = extract('lib/splash.js', /var PREVIEW_TOTAL = ([\d.]+)/)
const totalInHost = extract('lib/index.js', /const TOTAL_ANIM = ([\d.]+)/)
H.check('TOTAL 四处一致：timeline=' + totalInTimeline + ' / splash=' + totalInSplash + ' / index=' + totalInHost + ' / test=' + TOTAL, () => {
  assert.equal(totalInTimeline, TOTAL)
  assert.equal(totalInSplash, TOTAL)
  assert.equal(totalInHost, TOTAL)
})
const handoffInTimeline = extract('preview/js/timeline.js', /var HANDOFF_BASE_MS = (\d+)/)
const handoffInSplash = extract('lib/splash.js', /var HANDOFF_BASE_MS = (\d+)/)
H.check('HANDOFF_BASE_MS 三处一致 = 1200', () => {
  assert.equal(handoffInTimeline, HANDOFF_MS)
  assert.equal(handoffInSplash, HANDOFF_MS)
})
H.check('宿主兜底公式引用 9800（TOTAL*1000）与 1200', () => {
  const host = readFile('lib/index.js')
  assert.match(host, /9800\*slow/)
  assert.match(host, /1200\/Math\.sqrt/)
  assert.match(readFile('lib/client.js'), /var SPLASH_BASE_MS = 9800/)
  assert.match(readFile('lib/client.js'), /1200 \* Math\.sqrt/)
})
H.check('主时钟公式 t_anim = wall * SPEED 落在 main.js', () => {
  assert.match(MAIN_JS, /elapsed \* SPEED/)
})
H.check('IMPACT = 1/sqrt(SPEED) 只在一次性动作使用（main 注入 --vy-impact）', () => {
  assert.match(MAIN_JS, /--vy-impact/)
  assert.match(MAIN_JS, /1 \/ Math\.sqrt\(SPEED\)/)
})

H.done()
