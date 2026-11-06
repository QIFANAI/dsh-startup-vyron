/* ============================================================================
 * dsh-startup-vyron — 宿主侧启动层（iframe 启动动画 + 交接转场）
 * ----------------------------------------------------------------------------
 * 1) 注入 #dsh-vyron-root 后创建全屏 iframe，加载 preview/index.html?embed=1
 * 2) ready / progress / done 协议；看门狗；跳过；减弱动态
 * 3) done 后执行设计化交接：黑场光缝 → 亮度展开 → 通电扫描 → 宿主 UI 显影
 * 4) QA 后门（只读 query，不写配置）：?vyron_nosplash=1 / ?vyron_t=秒 / ?vyron_speed=
 *
 * 时间常量（design-spec §3 速度模型；Round2 交接从 950ms 增至 1200ms）：
 *   SPEED = clamp(splashSpeed,50,150)/100        默认 85 → SPEED 0.85
 *   IMPACT = 1/sqrt(SPEED)                       一次性冲击动作倍率
 *   HANDOFF_MS = round(1200*IMPACT)              done 起算交接总时长（85% → 1303ms）
 *   HANDOFF_SKIP_MS = round(600*IMPACT)
 *   HANDOFF_REDUCED_MS = 380                     固定
 *   HANDOFF_ERROR_MS = 40                        固定（快速释放）
 *   WATCHDOG_MS = clamp(4000 + 9800/SPEED + HANDOFF_MS, 8000, 40000)
 *   TOTAL_WALL_MS = round(9800/SPEED)
 *   --vyron-k = clamp(ms/1200, 0.02, 1.5)        交接 CSS/JS 过渡缩放
 *
 * Round2 交接编排（基准 ms，实际 ×k）：
 *   0    黑场 + 中央 2px 光缝（与 preview 终帧 y=50% 的光线衔接）
 *   0–120   iframe 藏到黑幕之后
 *   120  上下黑幕从中央缝向上下滑开 930ms（露出宿主 UI =「从一条线展开」）
 *   300  html.vyron-enter（皮肤分区显影 + #root 亮度爬升）
 *   420  声呐环从中央飞向 [data-composer-card] 矩形 680ms
 *   700  竖直光带从 50% 扫到顶栏 520ms（启动线 → UI 时间轨）
 *   1200 清理
 * ========================================================================== */
(function () {
  'use strict'

  if (window.__DSH_VYRON_BOOTED__) return
  window.__DSH_VYRON_BOOTED__ = true

  var ROOT_ID = 'dsh-vyron-root'
  var ROUTE = '/dsh-vyron'
  var PREVIEW = ROUTE + '/preview/index.html'
  var HANDOFF_BASE_MS = 1200
  var HANDOFF_SKIP_BASE_MS = 600
  var HANDOFF_REDUCED_MS = 380
  var HANDOFF_ERROR_MS = 40
  var PREVIEW_TOTAL = 9.8
  var SPEED_MIN = 50
  var SPEED_MAX = 150
  var SPEED_DEFAULT = 85
  var HANDOFF_MS = HANDOFF_BASE_MS
  var HANDOFF_SKIP_MS = HANDOFF_SKIP_BASE_MS
  var WATCHDOG_MS = 14000
  var SPEED = 1
  var IMPACT = 1
  var TOTAL_WALL_MS = Math.round(PREVIEW_TOTAL * 1000)
  var DEFAULTS = {
    enabled: true, mode: 'session', allowSkip: true, reducedMotion: false, sound: true, volume: 65, splashSpeed: SPEED_DEFAULT
  }

  function bool(value, fallback) {
    if (value === false || value === 'false' || value === 0 || value === '0') return false
    if (value === true || value === 'true' || value === 1 || value === '1') return true
    return fallback
  }

  function int(value, min, max, fallback) {
    var n = typeof value === 'number' ? value : parseInt(value, 10)
    if (!isFinite(n)) return fallback
    n = Math.round(n)
    return n < min ? min : (n > max ? max : n)
  }

  function clampNum(value, min, max) {
    if (!isFinite(value)) return min
    return value < min ? min : (value > max ? max : value)
  }

  function normalize(input) {
    var src = input && typeof input === 'object' ? input : {}
    return {
      enabled: bool(src.enabled, DEFAULTS.enabled),
      mode: (src.mode === 'session' || src.mode === 'daily' || src.mode === 'always') ? src.mode : DEFAULTS.mode,
      allowSkip: bool(src.allowSkip, DEFAULTS.allowSkip),
      reducedMotion: bool(src.reducedMotion, DEFAULTS.reducedMotion),
      sound: bool(src.sound, DEFAULTS.sound),
      volume: int(src.volume, 0, 100, DEFAULTS.volume),
      splashSpeed: int(src.splashSpeed, SPEED_MIN, SPEED_MAX, DEFAULTS.splashSpeed)
    }
  }

  var injected = window.__DSH_VYRON__ || {}
  var cfg = normalize(injected)

  function query() {
    try { return new URLSearchParams(String(window.location.search || '')) } catch (err) { return null }
  }
  var q = query()
  var qsT = q && q.has('vyron_t') ? parseFloat(q.get('vyron_t')) : NaN
  var forceT = isFinite(qsT) && qsT >= 0 ? Math.min(PREVIEW_TOTAL + 0.5, qsT) : null
  var nosplash = !!(q && q.get('vyron_nosplash') === '1')
  var forceSpeed = q && q.has('vyron_speed') ? parseInt(q.get('vyron_speed'), 10) : NaN
  if (isFinite(forceSpeed)) cfg.splashSpeed = int(forceSpeed, SPEED_MIN, SPEED_MAX, SPEED_DEFAULT)
  var forceReduced = q && (q.get('vyron_reduced') === '1' || q.get('reduced') === '1')
  var reduced = forceReduced ? true : cfg.reducedMotion

  SPEED = cfg.splashSpeed / 100
  IMPACT = 1 / Math.sqrt(SPEED)
  HANDOFF_MS = Math.round(HANDOFF_BASE_MS * IMPACT)
  HANDOFF_SKIP_MS = Math.round(HANDOFF_SKIP_BASE_MS * IMPACT)
  WATCHDOG_MS = clampNum(
    Math.round(4000 + (PREVIEW_TOTAL * 1000) / SPEED + HANDOFF_MS),
    8000,
    40000
  )
  TOTAL_WALL_MS = Math.round((PREVIEW_TOTAL * 1000) / SPEED)

  var facts = window.__DSH_VYRON_FACTS__ || injected.facts || {}
  var root = document.getElementById(ROOT_ID)
  /* skipAuto：本次页面加载不自动播放（nosplash / 本会话已播 / 插件禁用），
   * 但**仍然完整初始化 API**，这样「页面内全屏预览」（Ctrl+Alt+V / 设置页按钮）
   * 在任意时刻都能挂载真实启动层。Round2.1 起不再提前 return。 */
  var skipAuto = false
  if (!root) {
    if (nosplash || window.__DSH_VYRON_SKIP__ || !cfg.enabled) skipAuto = true
    else {
      root = document.createElement('div')
      root.id = ROOT_ID
      if (document.body) document.body.appendChild(root)
    }
  }

  var finished = false
  var ready = false
  var watchdog = 0
  var frame = null
  var state = 'boot'
  var progress = 0
  var lastHandoffMs = 0
  var handoffTimers = []
  var handoffNodes = []
  var chime = null
  var replaying = false
  var previewing = null

  function lock(on) {
    try {
      document.documentElement.classList.toggle('vyron-lock', !!on)
      if (document.body && document.body.style) document.body.style.overflow = on ? 'hidden' : ''
    } catch (err) { /* noop */ }
  }

  function clearWatchdog() {
    if (watchdog) {
      clearTimeout(watchdog)
      watchdog = 0
    }
  }

  function clearHandoffTimers() {
    for (var i = 0; i < handoffTimers.length; i++) {
      try { clearTimeout(handoffTimers[i]) } catch (err) { /* noop */ }
    }
    handoffTimers = []
  }

  function later(fn, ms) {
    handoffTimers.push(window.setTimeout(fn, ms))
  }

  /* ── 交接音频（宿主侧，独立于 iframe 生命周期） ─────────────────────── */
  function playChime(reason) {
    if (!cfg.sound || cfg.volume <= 0) return
    if (reason === 'reduced') return
    try {
      var audio = new Audio(ROUTE + '/lib/assets/audio/handoff.wav')
      chime = audio
      audio.preload = 'auto'
      audio.volume = Math.max(0, Math.min(1, cfg.volume / 100)) * 0.85
      var attempt = audio.play()
      if (attempt && typeof attempt.catch === 'function') attempt.catch(function () { /* 自动播放被拦：静默 */ })
    } catch (err) { /* noop */ }
  }

  /* ── 交接装饰（Round2：黑幕缝展开 → UI 显影 → 声呐环飞入 → 光带扫到顶栏） ── */
  var decor = { seam: null, barTop: null, barBottom: null, ring: null, scan: null }

  function emptyDecor() {
    return { seam: null, barTop: null, barBottom: null, ring: null, scan: null }
  }

  function removeDecorations() {
    for (var i = 0; i < handoffNodes.length; i++) {
      try {
        if (handoffNodes[i] && handoffNodes[i].parentNode) handoffNodes[i].parentNode.removeChild(handoffNodes[i])
      } catch (err) { /* noop */ }
    }
    handoffNodes = []
    decor = emptyDecor()
  }

  function makeNode(className) {
    var node = document.createElement('div')
    node.className = className
    node.setAttribute('aria-hidden', 'true')
    return node
  }

  /* 实测输入框卡片矩形（交接时把声呐环飞到它上面，完成"启动线 → UI"的形态衔接） */
  function findComposerRect() {
    try {
      var selectors = ['[data-composer-card]', '[data-composer-seat]']
      for (var i = 0; i < selectors.length; i++) {
        var node = document.querySelector(selectors[i])
        if (!node) continue
        var r = node.getBoundingClientRect()
        var vh = window.innerHeight || 800
        if (r && r.width > 120 && r.height > 40 && r.top > -r.height && r.top < vh) {
          return { left: r.left, top: r.top, width: r.width, height: r.height }
        }
      }
    } catch (err) { /* noop */ }
    return null
  }

  function prepareDecorations(host) {
    removeDecorations()
    if (!host || !host.appendChild) return
    try {
      var seam = makeNode('vyron-seam')
      var barTop = makeNode('vyron-bar vyron-bar--top')
      var barBottom = makeNode('vyron-bar vyron-bar--bottom')
      var scan = makeNode('vyron-scan')
      var ring = makeNode('vyron-ring')
      host.appendChild(seam)
      host.appendChild(barTop)
      host.appendChild(barBottom)
      host.appendChild(scan)
      host.appendChild(ring)
      handoffNodes = [seam, barTop, barBottom, scan, ring]
      decor = { seam: seam, barTop: barTop, barBottom: barBottom, ring: ring, scan: scan }
    } catch (err) { handoffNodes = []; decor = emptyDecor() }
  }

  /* 声呐环：中央 mark 位置 → 输入框卡片矩形，最后在边缘消散（皮肤 composer 环接管） */
  function flyRing(rect, k) {
    var ring = decor.ring
    if (!ring) return
    var vw = window.innerWidth || 1280
    var vh = window.innerHeight || 800
    var cx = vw / 2
    var cy = vh * 0.5
    var w0 = 140
    var h0 = 140
    ring.style.left = Math.round(cx - w0 / 2) + 'px'
    ring.style.top = Math.round(cy - h0 / 2) + 'px'
    ring.style.width = w0 + 'px'
    ring.style.height = h0 + 'px'
    ring.style.opacity = '0.92'
    var dur = Math.max(200, Math.round(680 * k))
    if (typeof ring.animate !== 'function') {
      ring.style.opacity = '0'
      return
    }
    if (!rect) {
      ring.animate([
        { transform: 'scale(.55)', opacity: 0.95 },
        { transform: 'scale(1.9)', opacity: 0 }
      ], { duration: dur + 220, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards' })
      return
    }
    var pad = 6
    ring.animate([
      { left: (cx - w0 / 2) + 'px', top: (cy - h0 / 2) + 'px', width: w0 + 'px', height: h0 + 'px', borderRadius: '999px', opacity: 0.95, offset: 0 },
      { left: (rect.left + rect.width * 0.16) + 'px', top: (rect.top + rect.height * 0.26) + 'px', width: (rect.width * 0.68) + 'px', height: (rect.height * 0.48) + 'px', borderRadius: '18px', opacity: 0.86, offset: 0.56 },
      { left: (rect.left - pad) + 'px', top: (rect.top - pad) + 'px', width: (rect.width + pad * 2) + 'px', height: (rect.height + pad * 2) + 'px', borderRadius: '22px', opacity: 0.52, offset: 0.86 },
      { left: (rect.left - pad * 3) + 'px', top: (rect.top - pad * 3) + 'px', width: (rect.width + pad * 6) + 'px', height: (rect.height + pad * 6) + 'px', borderRadius: '28px', opacity: 0, offset: 1 }
    ], { duration: dur, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards' })
  }

  /* 竖直光带：从画面中线扫到顶栏，把"启动线"变成 UI 的时间轨（皮肤 daybar 增亮） */
  function flyScan(k) {
    var scan = decor.scan
    if (!scan) return
    if (typeof scan.animate !== 'function') { scan.style.opacity = '0'; return }
    var vh = window.innerHeight || 800
    var dur = Math.max(180, Math.round(520 * k))
    scan.animate([
      { top: Math.round(vh * 0.5) + 'px', opacity: 0 },
      { top: Math.round(vh * 0.34) + 'px', opacity: 0.9, offset: 0.45 },
      { top: Math.round(-vh * 0.08) + 'px', opacity: 0 }
    ], { duration: dur, easing: 'cubic-bezier(.3,.6,.3,1)', fill: 'forwards' })
  }

  function cleanupHandoff(reason) {
    clearHandoffTimers()
    var wasPreview = !!previewing
    var current = root
    try {
      removeDecorations()
      if (current && current.parentNode) current.parentNode.removeChild(current)
      if (root === current) root = null
    } catch (err) { /* noop */ }
    try { document.documentElement.classList.remove('vyron-enter') } catch (err) { /* noop */ }
    try { document.documentElement.style.removeProperty('--vyron-k') } catch (err) { /* noop */ }
    try { if (frame && frame.parentNode) frame.parentNode.removeChild(frame) } catch (err) { /* noop */ }
    frame = null
    if (chime) { try { chime.pause() } catch (err) { /* noop */ } chime = null }
    lock(false)
    /* 页面内预览结束：还原被草稿参数临时覆盖的配置（预览不写配置） */
    if (previewing) {
      var savedCfg = previewing
      previewing = null
      restorePreviewConfig(savedCfg)
    }
    window.__DSH_VYRON_FAILED__ = !wasPreview && reason !== 'natural' && reason !== 'skip' && reason !== 'reduced'
    state = 'done'
    window.dispatchEvent(new Event('dsh-vyron:done'))
  }

  function handoff(reason, ms) {
    var current = root
    lastHandoffMs = ms
    if (!current) {
      lock(false)
      state = 'done'
      return
    }
    var html = document.documentElement
    var k = Math.max(0.02, Math.min(1.5, ms / HANDOFF_BASE_MS))
    try { html.style.setProperty('--vyron-k', String(k)) } catch (err) { /* noop */ }
    var reducedPath = reduced || reason === 'reduced'
    prepareDecorations(current)
    try { current.classList.add('vyron-handoff') } catch (err) { /* noop */ }

    if (ms <= HANDOFF_ERROR_MS) {
      later(function () { cleanupHandoff(reason) }, HANDOFF_ERROR_MS)
      return
    }

    playChime(reason)

    var composer = reducedPath ? null : findComposerRect()
    var barsOpenMs = Math.max(160, Math.round((reducedPath ? 240 : 930) * k))

    /* 0：光缝亮起；iframe 在 120ms 内藏到黑幕之后 */
    if (decor.seam) decor.seam.classList.add('is-on')

    /* 120ms：上下黑幕从中央缝向上下滑开 —— 宿主 UI 从这条线里"展开" */
    later(function () {
      if (!decor.barTop || !decor.barBottom) return
      var transition = 'transform ' + barsOpenMs + 'ms cubic-bezier(.16,.8,.24,1)'
      try {
        decor.barTop.style.transition = transition
        decor.barBottom.style.transition = transition
        decor.barTop.style.transform = 'scaleY(0)'
        decor.barBottom.style.transform = 'scaleY(0)'
      } catch (err) { /* noop */ }
      if (decor.seam) decor.seam.classList.add('is-open')
    }, Math.max(1, Math.round(120 * k)))

    if (reducedPath) {
      later(function () { flyRing(null, k) }, Math.round(80 * k))
    } else {
      /* 300ms：宿主 UI 通电显影（皮肤分区显影由 skin.css 的 .vyron-enter 规则接管） */
      later(function () {
        try { html.classList.add('vyron-enter') } catch (err) { /* noop */ }
      }, Math.round(300 * k))
      /* 420ms：声呐环飞向输入框 */
      later(function () { flyRing(composer, k) }, Math.round(420 * k))
      /* 700ms：光带从中央扫到顶栏 */
      later(function () { flyScan(k) }, Math.round(700 * k))
    }

    /* 760ms：中央光缝淡出（黑幕已打开、环/光带接管） */
    later(function () {
      if (decor.seam) decor.seam.classList.add('is-out')
    }, Math.round(760 * k))

    /* 1200ms：移除 root、撤 vyron-enter、解锁滚动、清理 */
    later(function () { cleanupHandoff(reason) }, ms)
  }

  function release(reason) {
    if (finished) return
    finished = true
    state = 'done'
    progress = 1
    clearWatchdog()
    try { window.removeEventListener('message', onMessage) } catch (err) { /* noop */ }
    var ms = HANDOFF_MS
    if (reason === 'skip') ms = HANDOFF_SKIP_MS
    else if (reason === 'timeout' || reason === 'error') ms = HANDOFF_ERROR_MS
    else if (reduced) ms = HANDOFF_REDUCED_MS
    handoff(reason, ms)
  }

  /* ── iframe ─────────────────────────────────────────────────────────── */
  function iframeUrl() {
    var version = window.__DSH_VYRON_VERSION__ || '0.2.1'
    var list = [
      'embed=1',
      'v=' + encodeURIComponent(version),
      'sound=' + (cfg.sound ? '1' : '0'),
      'volume=' + cfg.volume,
      'speed=' + cfg.splashSpeed
    ]
    if (forceT !== null) list.push('t=' + encodeURIComponent(String(forceT)))
    else if (reduced) list.push('reduced=1')
    if (!cfg.allowSkip) list.push('allowSkip=0')
    list.push('_=' + Date.now())
    return PREVIEW + '?' + list.join('&')
  }

  function onMessage(event) {
    try {
      if (!frame || event.source !== frame.contentWindow) return
      var data = event.data
      if (!data || typeof data.type !== 'string') return
      if (data.type === 'dsh-startup-vyron:ready') {
        ready = true
        clearWatchdog()
        try { if (root) root.classList.remove('vyron-boot') } catch (err) { /* noop */ }
        return
      }
      if (data.type === 'dsh-startup-vyron:progress') {
        if (typeof data.t === 'number') progress = Math.max(0, Math.min(1, data.t / PREVIEW_TOTAL))
        if (data.phase) state = String(data.phase)
        return
      }
      if (data.type === 'dsh-startup-vyron:done') {
        var reason = data.reason === 'skip' ? 'skip' : (data.reason === 'reduced' ? 'reduced' : 'natural')
        release(reason)
      }
    } catch (err) { /* noop */ }
  }

  function mount() {
    finished = false
    ready = false
    state = 'running'
    progress = 0
    lastHandoffMs = 0
    clearHandoffTimers()
    removeDecorations()
    try {
      document.documentElement.classList.remove('vyron-enter')
      document.documentElement.style.removeProperty('--vyron-k')
    } catch (err) { /* noop */ }
    if (!root || root.isConnected === false || !root.parentNode) {
      root = document.createElement('div')
      root.id = ROOT_ID
      if (document.body) document.body.appendChild(root)
    }
    root.className = 'vyron-root vyron-boot'
    root.innerHTML = ''
    lock(true)

    frame = document.createElement('iframe')
    frame.className = 'vyron-frame'
    frame.title = 'DSH startup animation'
    frame.setAttribute('allow', 'autoplay; fullscreen')
    frame.setAttribute('scrolling', 'no')
    frame.setAttribute('tabindex', '-1')
    frame.src = iframeUrl()
    frame.addEventListener('error', function () { release('error') })
    root.appendChild(frame)

    window.addEventListener('message', onMessage)
    clearWatchdog()
    watchdog = window.setTimeout(function () { release('timeout') }, WATCHDOG_MS)
  }

  function replay() {
    if (replaying || state === 'running') return
    replaying = true
    try {
      clearWatchdog()
      finished = true
      try { window.removeEventListener('message', onMessage) } catch (err) { /* noop */ }
      if (frame && frame.parentNode) frame.parentNode.removeChild(frame)
      frame = null
      if (root) { try { root.innerHTML = '' } catch (err) { /* noop */ } }
      try {
        document.documentElement.classList.remove('vyron-enter')
        document.documentElement.style.removeProperty('--vyron-k')
      } catch (err) { /* noop */ }
      removeDecorations()
      mount()
    } finally {
      replaying = false
    }
  }

  function skip() {
    if (cfg.allowSkip) release('skip')
  }

  /* ── 页面内全屏预览（Round2.1） ──────────────────────────────────────────
   * 在**当前页面**挂载真实启动层（与开机同一套 iframe/交接），实时套用设置页草稿参数，
   * 不写配置、不标记「本次会话已播放」；预览结束自动还原配置。
   * 预览强制 allowSkip=true（否则用户可能被困在预览里）。
   * 入口：设置页「页面内全屏预览」按钮 / 任意页面快捷键 Ctrl+Alt+V /
   *       window.__DSH_VYRON_API__.preview({speed,sound,volume,reduced}) /
   *       window.dispatchEvent(new CustomEvent('dsh-vyron:preview', {detail:{...}})) */

  function recomputeTiming() {
    SPEED = cfg.splashSpeed / 100
    IMPACT = 1 / Math.sqrt(SPEED)
    HANDOFF_MS = Math.round(HANDOFF_BASE_MS * IMPACT)
    HANDOFF_SKIP_MS = Math.round(HANDOFF_SKIP_BASE_MS * IMPACT)
    WATCHDOG_MS = clampNum(
      Math.round(4000 + (PREVIEW_TOTAL * 1000) / SPEED + HANDOFF_MS),
      8000,
      40000
    )
    TOTAL_WALL_MS = Math.round((PREVIEW_TOTAL * 1000) / SPEED)
  }

  function restorePreviewConfig(saved) {
    if (!saved) return
    cfg.splashSpeed = saved.splashSpeed
    cfg.sound = saved.sound
    cfg.volume = saved.volume
    cfg.allowSkip = saved.allowSkip
    reduced = saved.reduced
    recomputeTiming()
  }

  function preview(opts) {
    if (state === 'running') return false
    var saved = {
      splashSpeed: cfg.splashSpeed,
      sound: cfg.sound,
      volume: cfg.volume,
      allowSkip: cfg.allowSkip,
      reduced: reduced
    }
    var o = opts && typeof opts === 'object' ? opts : {}
    cfg.splashSpeed = int(o.speed, SPEED_MIN, SPEED_MAX, cfg.splashSpeed)
    cfg.sound = bool(o.sound, cfg.sound)
    cfg.volume = int(o.volume, 0, 100, cfg.volume)
    cfg.allowSkip = true
    reduced = o.reduced === true
    recomputeTiming()
    previewing = saved
    try {
      replay()
    } catch (err) {
      previewing = null
      restorePreviewConfig(saved)
      return false
    }
    return state === 'running'
  }

  try {
    window.addEventListener('keydown', function (event) {
      if (!event || event.defaultPrevented) return
      if (!event.ctrlKey || !event.altKey) return
      var key = String(event.key || '').toLowerCase()
      if (key !== 'v' && event.keyCode !== 86) return
      if (event.preventDefault) event.preventDefault()
      if (event.stopPropagation) event.stopPropagation()
      preview({})
    })
    window.addEventListener('dsh-vyron:preview', function (event) {
      var detail = event && event.detail
      preview(detail && typeof detail === 'object' ? detail : {})
    })
  } catch (err) { /* noop */ }

  window.__DSH_VYRON_API__ = {
    replay: replay,
    preview: preview,
    skip: skip,
    finish: function () { release('natural') },
    get state() { return state },
    get progress() { return progress },
    get ready() { return ready },
    get facts() { return facts },
    get handoffMs() { return lastHandoffMs },
    get speed() { return cfg.splashSpeed },
    get totalWallMs() { return TOTAL_WALL_MS },
    get watchdogMs() { return WATCHDOG_MS },
    get config() { return cfg }
  }

  if (skipAuto || nosplash || window.__DSH_VYRON_SKIP__ || !cfg.enabled) {
    try {
      if (root && root.parentNode) root.parentNode.removeChild(root)
      if (root === document.getElementById(ROOT_ID)) root = null
    } catch (err) { /* noop */ }
    lock(false)
    window.__DSH_VYRON_FAILED__ = false
    state = 'done'
    return
  }

  mount()
})();
