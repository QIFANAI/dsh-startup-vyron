/* ============================================================================
 * dsh-startup-vyron · 「VYRON 星海鲸航」浏览器内启动音轨播放引擎
 * ----------------------------------------------------------------------------
 * 契约（docs/design-spec.md §5 / §7）：
 *   window.VYRON_AUDIO = {
 *     init(opts)  { src, chimeSrc, enabled, volume(0..1), reduced, rate(0.5..1.5) }
 *     start()     与动画 t0 同步，boot 元素 currentTime 从 0 播起
 *     sync(t)     对齐动画已播秒数（t 为动画秒）：手势补播 / 漂移校正
 *     stop(ms)    淡出（默认 180ms，clamp 0..2000），不抛异常
 *     chime()     播放交接钟声 handoff.wav（一次性；与 stop 解耦，可在 stop 后调用）
 *     state()     { enabled, playing, blocked, volume, currentTime, duration, mode,
 *                   reduced, failed, rate, preservesPitch, wallDuration, chimePlaying }
 *     __vyronAudio: true
 *   }
 *
 * 速度（splashSpeed）：rate = clamp(SPEED, 0.5, 1.5)，boot 元素 playbackRate = rate，
 *   preservesPitch = true（含 webkit/moz 前缀）：音高不变、墙钟时长按 1/rate 伸缩，
 *   与动画同速；sync(t) 语义不变（t 仍是动画秒）。chime 固定 1.0（交接钟声与速度解耦）。
 *
 * 降级语义：
 *   1) 自动播放被拒（NotAllowedError）→ blocked=true，挂一次性 pointerdown/keydown
 *      （capture）；首次手势后从最近一次 sync(t) 的动画秒补播；手势后仍被拒则静默降级，
 *      只 warn 一次。chime 被拒时同样挂手势，手势后补播钟声。
 *   2) 资源 404 / 解码失败 → console.warn 一次（[vyron-audio] 前缀），静音继续，
 *      不阻塞时间轴；绝不 console.error，绝不抛出导致启动页崩溃。
 *   3) enabled=false → 不播放（元素仍创建，便于 QA 读 duration）；reduced=true →
 *      只播 chime（activeEl 指向钟声元素）。
 *   4) 音量钳制 0..1；start/stop 幂等；重复 init 会重建元素；rate 非法/缺失回 1、越界钳制。
 *   5) headless / 无 HTMLAudioElement 环境：只 warn 一次并整体静音降级，不抛错。
 *
 * 实现：HTMLAudioElement（new Audio() / createElement 兜底），隐藏挂到 body，
 * 不依赖 DOM 结构。data-vyron-audio="boot|chime" 便于排查。
 * ========================================================================== */
(function () {
  'use strict'

  if (typeof window === 'undefined') return
  if (window.VYRON_AUDIO && window.VYRON_AUDIO.__vyronAudio) return

  var VERSION = '1.0.0'
  var DEFAULT_VOLUME = 0.65
  var DEFAULT_RATE = 1
  var RATE_MIN = 0.5
  var RATE_MAX = 1.5
  var DEFAULT_FADE_MS = 180
  var FADE_STEP_MS = 16
  var SYNC_DRIFT = 0.5          // 播放中漂移超过该秒数才 seek，避免频繁抖动
  var SEEK_END_GUARD = 0.05     // 靠近结尾时不补播尾音，避免反复触发

  var cfg = {
    src: null,
    chimeSrc: null,
    enabled: true,
    volume: DEFAULT_VOLUME,
    reduced: false,
    rate: DEFAULT_RATE
  }
  var bootEl = null
  var chimeEl = null
  var userVolume = DEFAULT_VOLUME
  var enabled = true
  var reduced = false
  var rate = DEFAULT_RATE

  var failed = false
  var blocked = false
  var started = false
  var stopped = false
  var pendingT = 0
  var gestureBound = false
  var gestureHandler = null
  var gestureRetried = false
  var chimeBlocked = false
  var pendingChime = false
  var chimePlaying = false
  var fadeTimer = 0
  var warned = {}

  function now() {
    try {
      if (window.performance && typeof window.performance.now === 'function') return window.performance.now()
    } catch (err) { /* noop */ }
    return Date.now()
  }

  function clamp(value, min, max) {
    var n = Number(value)
    if (!isFinite(n)) return min
    return n < min ? min : (n > max ? max : n)
  }

  function warnOnce(key, message) {
    if (warned[key]) return
    warned[key] = true
    try { console.warn('[vyron-audio] ' + message) } catch (err) { /* noop */ }
  }

  /* 音高保持：Chromium 支持 preservesPitch，历史前缀 webkit/moz 一并写入 */
  function setPreservesPitch(el, on) {
    if (!el) return
    try { el.preservesPitch = on } catch (err) { /* noop */ }
    try { el.webkitPreservesPitch = on } catch (err) { /* noop */ }
    try { el.mozPreservesPitch = on } catch (err) { /* noop */ }
  }

  function readPreservesPitch(el) {
    if (!el) return true
    try {
      if (typeof el.preservesPitch === 'boolean') return el.preservesPitch
      if (typeof el.webkitPreservesPitch === 'boolean') return el.webkitPreservesPitch
    } catch (err) { /* noop */ }
    return true
  }

  function applyRate(el, value) {
    if (!el) return
    try { el.playbackRate = value } catch (err) { /* noop */ }
  }

  function readPlaybackRate(el) {
    try {
      if (el && isFinite(el.playbackRate) && el.playbackRate > 0) return el.playbackRate
    } catch (err) { /* noop */ }
    return rate
  }

  function normalize(opts) {
    var source = opts && typeof opts === 'object' ? opts : {}
    return {
      src: typeof source.src === 'string' && source.src ? source.src : null,
      chimeSrc: typeof source.chimeSrc === 'string' && source.chimeSrc ? source.chimeSrc : null,
      enabled: !(source.enabled === false || source.enabled === 0 ||
        source.enabled === '0' || source.enabled === 'false'),
      volume: source.volume === undefined || source.volume === null ? DEFAULT_VOLUME : source.volume,
      reduced: !!(source.reduced || source.reduced === 1 ||
        source.reduced === '1' || source.reduced === 'true'),
      rate: source.rate === undefined || source.rate === null ? DEFAULT_RATE : source.rate
    }
  }

  function activeEl() {
    return reduced ? chimeEl : bootEl
  }

  /* ------------------------------------------------------------------ 元素 */

  function detach(el) {
    if (!el) return
    try { el.pause() } catch (err) { /* noop */ }
    try {
      if (el.parentNode) el.parentNode.removeChild(el)
    } catch (err) { /* noop */ }
    try {
      el.removeAttribute('src')
      el.load()
    } catch (err) { /* noop */ }
  }

  function createAudioElement() {
    var el = null
    try {
      if (typeof window.Audio === 'function') el = new window.Audio()
    } catch (err) { el = null }
    if (!el) {
      try {
        if (typeof document !== 'undefined' && document.createElement) {
          el = document.createElement('audio')
        }
      } catch (err) { el = null }
    }
    return el
  }

  function makeElement(kind, src) {
    var el = createAudioElement()
    if (!el || typeof el.play !== 'function') {
      warnOnce('no-audio-el', 'HTMLAudioElement unavailable (headless/no audio device?); continuing silent')
      failed = true
      return null
    }
    try { el.setAttribute('data-vyron-audio', kind) } catch (err) { /* noop */ }
    try { el.setAttribute('aria-hidden', 'true') } catch (err) { /* noop */ }
    try { el.setAttribute('preload', 'auto') } catch (err) { /* noop */ }
    try { el.loop = false } catch (err) { /* noop */ }
    try { el.volume = userVolume } catch (err) { /* noop */ }
    try { el.style.display = 'none' } catch (err) { /* noop */ }
    el.addEventListener('error', function () { onMediaError(kind) })
    el.addEventListener('playing', function () {
      if (kind === 'chime') { chimeBlocked = false; chimePlaying = true; return }
      if (activeEl() === el && !stopped) blocked = false
    })
    el.addEventListener('ended', function () {
      if (kind === 'chime') { chimePlaying = false; return }
      if (activeEl() === el) started = false
    })
    try {
      if (src) el.src = src
    } catch (err) {
      warnOnce('src-' + kind, kind + ' audio src assign failed; continuing silent')
      failed = true
    }
    try {
      var host = (typeof document !== 'undefined') ? (document.body || document.documentElement) : null
      if (host && host.appendChild) host.appendChild(el)
    } catch (err) { /* noop */ }
    return el
  }

  function onMediaError(kind) {
    var el = kind === 'chime' ? chimeEl : bootEl
    var code = 0
    try { code = el && el.error ? el.error.code : 0 } catch (err) { /* noop */ }
    warnOnce('media-' + kind, kind + ' audio failed to load/decode (MediaError code=' +
      code + '); continuing silent')
    failed = true
    cancelFade()
    try { if (el) el.pause() } catch (err) { /* noop */ }
  }

  /* ------------------------------------------------------------ 播放/拒绝 */

  function playFrom(seek) {
    if (!enabled || failed || stopped) return
    var el = activeEl()
    if (!el || !el.src) return
    var target = Number(seek)
    if (!isFinite(target) || target < 0) target = 0
    var duration = el.duration
    if (isFinite(duration) && duration > 0) {
      target = Math.min(target, Math.max(0, duration - SEEK_END_GUARD))
    }
    try { el.currentTime = target } catch (err) { /* metadata 未就绪时忽略 */ }

    var promise
    try {
      promise = el.play()
    } catch (err) {
      onPlayRejected(err)
      return
    }
    if (promise && typeof promise.then === 'function') {
      promise.then(function () {
        if (stopped) {
          try { el.pause() } catch (err) { /* noop */ }
          return
        }
        blocked = false
      }, function (err) { onPlayRejected(err) })
    }
  }

  function onPlayRejected(err) {
    if (stopped) return
    var name = err && err.name ? String(err.name) : ''
    if (name === 'AbortError') return // 被 pause()/src 变更打断，不算失败
    if (failed) return                 // 资源/解码错误已 warn 过一次，不重复告警
    if (name === 'NotAllowedError') {
      if (gestureRetried) {
        // 手势后仍被拒：静默降级，只 warn 一次
        blocked = true
        failed = true
        warnOnce('autoplay-retry', 'autoplay still blocked after user gesture; continuing silent')
        return
      }
      blocked = true
      bindGesture()
      return
    }
    // 解码/资源/其他错误：静音继续，不阻塞时间轴
    failed = true
    warnOnce('play-' + name, 'playback failed (' + (name || 'Error') + '); continuing silent')
  }

  /* -------------------------------------------------------------- 手势补播 */

  function bindGesture() {
    if (gestureBound || typeof document === 'undefined') return
    gestureBound = true
    gestureHandler = function () {
      unbindGesture()
      resumeFromGesture()
    }
    try {
      document.addEventListener('pointerdown', gestureHandler, { capture: true, passive: true })
      document.addEventListener('keydown', gestureHandler, { capture: true })
    } catch (err) {
      try {
        document.addEventListener('pointerdown', gestureHandler, true)
        document.addEventListener('keydown', gestureHandler, true)
      } catch (err2) { /* noop */ }
    }
  }

  function unbindGesture() {
    if (!gestureBound) return
    gestureBound = false
    try { document.removeEventListener('pointerdown', gestureHandler, true) } catch (err) { /* noop */ }
    try { document.removeEventListener('keydown', gestureHandler, true) } catch (err) { /* noop */ }
    gestureHandler = null
  }

  function resumeFromGesture() {
    gestureRetried = true
    if (pendingChime && !stopped) {
      pendingChime = false
      chime()
    }
    if (stopped || !started || !enabled || failed) return
    playFrom(pendingT)
  }

  /* ------------------------------------------------------------------ 淡出 */

  function cancelFade() {
    if (fadeTimer) {
      try { clearInterval(fadeTimer) } catch (err) { /* noop */ }
      fadeTimer = 0
    }
  }

  function finishFade() {
    cancelFade()
    var all = [bootEl, chimeEl]
    for (var i = 0; i < all.length; i++) {
      var el = all[i]
      if (!el) continue
      try { el.pause() } catch (err) { /* noop */ }
      try { el.volume = userVolume } catch (err) { /* noop */ }
    }
    chimePlaying = false
  }

  function fadeOut(ms) {
    cancelFade()
    var targets = []
    if (bootEl && !bootEl.paused) targets.push(bootEl)
    if (chimeEl && !chimeEl.paused) targets.push(chimeEl)
    if (!targets.length) { finishFade(); return }
    if (!ms) { finishFade(); return }
    var startVols = []
    for (var i = 0; i < targets.length; i++) startVols.push(targets[i].volume)
    var t0 = now()
    fadeTimer = setInterval(function () {
      var k = clamp((now() - t0) / ms, 0, 1)
      for (var j = 0; j < targets.length; j++) {
        try { targets[j].volume = clamp(startVols[j] * (1 - k), 0, 1) } catch (err) { /* noop */ }
      }
      if (k >= 1) finishFade()
    }, FADE_STEP_MS)
  }

  /* ------------------------------------------------------------------- API */

  function init(opts) {
    cfg = normalize(opts)
    enabled = cfg.enabled
    reduced = cfg.reduced
    userVolume = clamp(Number(cfg.volume), 0, 1)
    var cfgRate = Number(cfg.rate)
    rate = isFinite(cfgRate) ? clamp(cfgRate, RATE_MIN, RATE_MAX) : DEFAULT_RATE
    failed = false
    blocked = false
    started = false
    stopped = false
    pendingT = 0
    gestureRetried = false
    chimeBlocked = false
    pendingChime = false
    chimePlaying = false
    warned = {}
    cancelFade()
    unbindGesture()
    detach(bootEl)
    detach(chimeEl)
    bootEl = null
    chimeEl = null
    if (cfg.src) bootEl = makeElement('boot', cfg.src)
    if (cfg.chimeSrc) chimeEl = makeElement('chime', cfg.chimeSrc)
    // 静音/禁用时也让音量保持钳制值，便于外部读取
    if (bootEl) {
      try { bootEl.volume = userVolume } catch (err) { /* noop */ }
      applyRate(bootEl, rate)
      setPreservesPitch(bootEl, true)
    }
    if (chimeEl) {
      try { chimeEl.volume = userVolume } catch (err) { /* noop */ }
      applyRate(chimeEl, 1) // chime 固定原速（交接钟声与速度解耦）
      setPreservesPitch(chimeEl, true)
    }
  }

  function start() {
    started = true
    stopped = false
    pendingT = 0
    cancelFade()
    if (!enabled || failed) { finishFade(); return }
    var el = activeEl()
    if (!el) { finishFade(); return }
    try { el.volume = userVolume } catch (err) { /* noop */ }
    applyRate(el, reduced ? 1 : rate)
    setPreservesPitch(el, true)
    try { el.currentTime = 0 } catch (err) { /* noop */ }
    playFrom(0)
  }

  function sync(t) {
    var time = Number(t)
    if (!isFinite(time) || time < 0) time = 0
    pendingT = time
    if (!started || stopped || !enabled || failed) return
    var el = activeEl()
    if (!el) return
    if (blocked) return // 等一次性手势后从 pendingT 补播
    if (el.paused || el.ended) {
      var duration = el.duration
      if (isFinite(duration) && duration > 0 && time >= duration - SEEK_END_GUARD) return
      playFrom(time)
      return
    }
    var total = el.duration
    if (isFinite(total) && total > 0) {
      var target = Math.min(time, total - SEEK_END_GUARD)
      if (Math.abs(el.currentTime - target) > SYNC_DRIFT) {
        try { el.currentTime = target } catch (err) { /* noop */ }
      }
    }
  }

  function stop(ms) {
    started = false
    stopped = true
    unbindGesture()
    var fadeMs = (typeof ms === 'number' && isFinite(ms)) ? clamp(ms, 0, 2000) : DEFAULT_FADE_MS
    fadeOut(fadeMs)
  }

  function chime() {
    if (!enabled || failed) return false
    var el = chimeEl
    if (!el) return false
    cancelFade()
    try { el.volume = userVolume } catch (err) { /* noop */ }
    applyRate(el, 1)
    setPreservesPitch(el, true)
    try { el.currentTime = 0 } catch (err) { /* noop */ }
    var promise
    try {
      promise = el.play()
    } catch (err) {
      onChimeRejected(err)
      return false
    }
    chimePlaying = true
    if (promise && typeof promise.then === 'function') {
      promise.then(function () {
        chimeBlocked = false
        pendingChime = false
        chimePlaying = !el.paused && !el.ended
      }, function (err) { onChimeRejected(err) })
    }
    return true
  }

  function onChimeRejected(err) {
    var name = err && err.name ? String(err.name) : ''
    if (name === 'AbortError') return
    if (name === 'NotAllowedError') {
      if (gestureRetried) {
        pendingChime = false
        warnOnce('autoplay-retry-chime', 'handoff chime still blocked after user gesture; continuing silent')
        return
      }
      chimeBlocked = true
      pendingChime = true
      bindGesture()
      return
    }
    failed = true
    warnOnce('chime-play-' + name, 'handoff chime playback failed (' +
      (name || 'Error') + '); continuing silent')
  }

  function state() {
    var playing = false
    var current = 0
    var duration = 0
    var el = activeEl()
    if (bootEl && !bootEl.paused && !bootEl.ended) playing = true
    if (chimeEl && !chimeEl.paused && !chimeEl.ended) playing = true
    if (el) {
      if (isFinite(el.currentTime)) current = el.currentTime
      if (isFinite(el.duration)) duration = el.duration
    }
    var activeRate = readPlaybackRate(el)
    return {
      enabled: enabled,
      playing: playing,
      blocked: blocked || chimeBlocked,
      volume: userVolume,
      currentTime: current,
      duration: duration,
      mode: mode(),
      reduced: reduced,
      failed: failed,
      rate: rate,
      preservesPitch: readPreservesPitch(el),
      // 墙钟时长 = 元素时长 / 元素实际 playbackRate（rate 1 时等于 duration）
      wallDuration: isFinite(duration) && duration > 0 ? duration / activeRate : 0,
      chimePlaying: chimePlaying || !!(chimeEl && !chimeEl.paused && !chimeEl.ended)
    }
  }

  function mode() {
    if (!enabled || failed) return 'silent'
    if (reduced) return chimeEl ? 'chime' : 'silent'
    return bootEl ? 'boot' : 'silent'
  }

  function dispose() {
    started = false
    stopped = true
    cancelFade()
    unbindGesture()
    detach(bootEl)
    detach(chimeEl)
    bootEl = null
    chimeEl = null
    chimePlaying = false
  }

  window.VYRON_AUDIO = {
    __vyronAudio: true,
    version: VERSION,
    init: init,
    start: start,
    sync: sync,
    stop: stop,
    chime: chime,
    state: state,
    dispose: dispose
  }
})();
