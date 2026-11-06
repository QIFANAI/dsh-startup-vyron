/* ============================================================================
 * VYRON 星海鲸航 — 主时间轴 / 契约常量 / 参数解析
 * ----------------------------------------------------------------------------
 * 唯一权威：docs/design-spec.md §3。改相位起点或 TOTAL 必须同步：
 *   preview/css/splash.css 中的 CSS 变量、lib/splash.js 的 TOTAL 常量、
 *   test/smoke-preview.mjs 的断言。
 * 本文件不依赖任何库，file:// 与宿主 iframe 双端可用。
 * ========================================================================== */
(function () {
  'use strict'

  var PHASES = [
    { key: 'signal', a: 0.00, b: 0.65 },
    { key: 'console', a: 0.65, b: 3.10 },
    { key: 'breach', a: 3.10, b: 5.10 },
    { key: 'whale', a: 5.10, b: 7.60 },
    { key: 'lockup', a: 7.60, b: 9.00 },
    { key: 'bloom', a: 9.00, b: 9.80 }
  ]

  /* 声音事件（动画秒）：与 lib/assets/audio/vyron-boot.wav 的合成表一致，
     ?probe=1 时用于断言音画同步。 */
  var CUES = [
    { at: 0.00, key: 'ping', label: 'sonar-ping' },
    { at: 0.30, key: 'drone', label: 'sub-drone' },
    { at: 0.75, key: 'beep-1', label: 'terminal-beep' },
    { at: 1.05, key: 'beep-2', label: 'terminal-beep' },
    { at: 1.38, key: 'beep-3', label: 'terminal-beep' },
    { at: 1.72, key: 'beep-4', label: 'terminal-beep' },
    { at: 3.10, key: 'impact', label: 'hatch-impact' },
    { at: 3.30, key: 'wind-in', label: 'solar-wind' },
    { at: 4.40, key: 'riser', label: 'riser-wall' },
    { at: 5.15, key: 'call-1', label: 'whale-call-far' },
    { at: 6.35, key: 'call-2', label: 'whale-call-near' },
    { at: 7.60, key: 'lock-hit', label: 'lockup-impact' },
    { at: 8.60, key: 'power-down', label: 'power-down' }
  ]

  var TOTAL = 9.80
  var SPEED_MIN = 50
  var SPEED_MAX = 150
  var SPEED_DEFAULT = 85
  var BASE_WALL_MS = Math.round((TOTAL * 1000 * 100) / SPEED_DEFAULT) // 11529ms @85%
  var HANDOFF_BASE_MS = 1200

  function clamp(value, min, max) {
    if (!isFinite(value)) return min
    return value < min ? min : (value > max ? max : value)
  }

  function lerp(a, b, t) {
    return a + (b - a) * clamp(t, 0, 1)
  }

  /* 平滑插值：smoothstep（0..1 两端一阶导为 0） */
  function smooth(t) {
    var x = clamp(t, 0, 1)
    return x * x * (3 - 2 * x)
  }

  function easeInOutCubic(t) {
    var x = clamp(t, 0, 1)
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
  }

  function easeOutCubic(t) {
    var x = clamp(t, 0, 1)
    return 1 - Math.pow(1 - x, 3)
  }

  function easeInCubic(t) {
    return Math.pow(clamp(t, 0, 1), 3)
  }

  /* 归一化到某区间的 0..1 进度（无区间返回 0/1） */
  function progress(t, a, b) {
    if (!(b > a)) return t >= b ? 1 : 0
    return clamp((t - a) / (b - a), 0, 1)
  }

  function phaseAt(t) {
    if (t < PHASES[0].a) return PHASES[0]
    for (var i = 0; i < PHASES.length; i++) {
      if (t < PHASES[i].b) return PHASES[i]
    }
    return PHASES[PHASES.length - 1]
  }

  function phaseIndex(key) {
    for (var i = 0; i < PHASES.length; i++) if (PHASES[i].key === key) return i
    return -1
  }

  function phaseProgress(t, key) {
    var index = phaseIndex(key)
    if (index < 0) return 0
    return progress(t, PHASES[index].a, PHASES[index].b)
  }

  function intOr(value, fallback) {
    var n = typeof value === 'number' ? value : parseInt(value, 10)
    return isFinite(n) ? Math.round(n) : fallback
  }

  function boolOr(value, fallback) {
    if (value === false || value === 'false' || value === 0 || value === '0') return false
    if (value === true || value === 'true' || value === 1 || value === '1') return true
    return fallback
  }

  /* 参数解析：query > 宿主注入（window.__DSH_VYRON__）> 默认。
     返回主时钟需要的一切，main.js 只消费这里的结果。 */
  function paramsFromLocation(search, injected) {
    var q
    try { q = new URLSearchParams(String(search || '')) } catch (err) { q = null }
    var get = function (key) { return q && q.has(key) ? q.get(key) : null }
    var inj = injected && typeof injected === 'object' ? injected : {}
    var speedRaw = get('speed') !== null ? intOr(get('speed'), SPEED_DEFAULT)
      : intOr(inj.splashSpeed, SPEED_DEFAULT)
    var speed = clamp(speedRaw, SPEED_MIN, SPEED_MAX)
    var freeze = null
    if (get('t') !== null) {
      var tRaw = parseFloat(get('t'))
      if (isFinite(tRaw)) freeze = clamp(tRaw, 0, TOTAL + 0.6)
    }
    var volumeRaw = get('volume') !== null ? intOr(get('volume'), 65) : intOr(inj.volume, 65)
    return {
      embed: get('embed') === '1',
      preview: get('preview') === '1',
      probe: get('probe') === '1',
      version: String(get('v') || inj.version || '0.1.0'),
      speed: speed,
      speedRatio: speed / 100,
      freezeT: freeze,
      reduced: get('reduced') === '1' || boolOr(inj.reducedMotion, false),
      allowSkip: get('allowSkip') === '0' ? false : (inj.allowSkip === false ? false : true),
      sound: get('sound') === '0' || get('sound') === 'false' ? false : (inj.sound !== false),
      volume: clamp(volumeRaw, 0, 100),
      autoskip: get('autoskip') !== null ? Math.max(0, parseFloat(get('autoskip')) || 0) : null,
      facts: inj.facts && typeof inj.facts === 'object' ? inj.facts : {},
      raw: {
        speed: speed,
        total: TOTAL,
        wallMs: Math.round((TOTAL * 1000) / (speed / 100)),
        phases: PHASES,
        cues: CUES,
        handoffMs: HANDOFF_BASE_MS
      }
    }
  }

  window.VYRON_TIMELINE = {
    TOTAL: TOTAL,
    SPEED_MIN: SPEED_MIN,
    SPEED_MAX: SPEED_MAX,
    SPEED_DEFAULT: SPEED_DEFAULT,
    BASE_WALL_MS: BASE_WALL_MS,
    HANDOFF_BASE_MS: HANDOFF_BASE_MS,
    PHASES: PHASES,
    CUES: CUES,
    clamp: clamp,
    lerp: lerp,
    smooth: smooth,
    easeInOutCubic: easeInOutCubic,
    easeOutCubic: easeOutCubic,
    easeInCubic: easeInCubic,
    progress: progress,
    phaseAt: phaseAt,
    phaseProgress: phaseProgress,
    paramsFromLocation: paramsFromLocation
  }
})();
