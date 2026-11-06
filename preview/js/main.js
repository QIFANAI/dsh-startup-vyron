/* ============================================================================
 * VYRON 星海鲸航 — 启动页编排器（唯一主时钟）
 * ----------------------------------------------------------------------------
 * 职责：
 *  1) 解析参数（?speed / ?t / ?reduced / ?sound / ?allowSkip / ?autoskip / ?probe）
 *  2) 以 wall clock 推进动画时间 t_anim = wall * SPEED，驱动 engine / hud / whale / audio
 *  3) 驱动舞台层（舷窗 iris、锁版、bloom、提示、跳过）并上报 ready/progress/done
 *  4) ?t= 定格单帧（截图 / QA 用），离线预览结束显示重播
 * 契约：docs/design-spec.md §3、§7。模块全部可选，缺一个不崩。
 * ========================================================================== */
(function () {
  'use strict'

  var TL = window.VYRON_TIMELINE
  if (!TL) { console.warn('[vyron] timeline.js 缺失，启动页终止'); return }

  var injected = window.__DSH_VYRON__ || {}
  var P = TL.paramsFromLocation(window.location.search, injected)
  var SPEED = P.speedRatio
  var TOTAL = TL.TOTAL
  var REDUCED = P.reduced
  /* 减弱动态：定格在终帧构图（P4 尾），而不是 P0 黑场（verifier C-1） */
  var COMPOSE_T = TOTAL - 1.0
  var FREEZE = P.freezeT
  var START_WALL = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()

  var stage = document.getElementById('vyStage')
  var fx = document.getElementById('vyFx')
  var whaleFx = document.getElementById('vyWhaleFx')
  var hudRoot = document.getElementById('vyHudRoot')
  var whaleRoot = document.getElementById('vyWhaleRoot')
  var lockup = document.getElementById('vyLockup')
  var lockupMeta = document.getElementById('vyLockupMeta')
  var markSlot = document.getElementById('vyMarkSlot')
  var wordmark = document.getElementById('vyWordmark')
  var subLine = document.getElementById('vySub')
  var signal = document.getElementById('vySignal')
  var signalMain = document.getElementById('vySignalMain')
  var signalSub = document.getElementById('vySignalSub')
  var countdown = document.getElementById('vyCountdown')
  var hint = document.getElementById('vyHint')
  var skipBtn = document.getElementById('vySkip')
  var probeEl = document.getElementById('vyProbe')
  var iris = document.getElementById('vyIris')
  var flash = document.getElementById('vyFlash')
  var blackout = document.getElementById('vyBlackout')
  var seam = document.getElementById('vySeam')
  var headerEl = document.getElementById('vyHeader')
  var footerEl = document.getElementById('vyFooter')
  var hudEl = document.getElementById('vyHud')

  if (!stage) { console.warn('[vyron] 舞台节点缺失'); return }

  /* ── 基础参数落地 ───────────────────────────────────────────────────── */
  try {
    var root = document.documentElement
    root.style.setProperty('--vy-speed', String(SPEED))
    root.style.setProperty('--vy-impact', String(Math.min(1.45, 1 / Math.sqrt(SPEED))))
    root.style.setProperty('--vy-total', String(TOTAL))
    if (P.embed) root.classList.add('vy-embed')
    if (REDUCED) root.classList.add('vy-reduced')
    if (FREEZE !== null) root.classList.add('vy-frozen')
  } catch (err) { /* noop */ }

  document.title = 'DEEPSEEK HARNESS · VYRON STARWHALE BOOT'
  if (skipBtn) skipBtn.hidden = !P.allowSkip
  if (hint) hint.hidden = true

  var previewVersion = String(P.version || '0.2.0')
  if (signalSub) signalSub.textContent = 'CMD\\LN · BOOT SEQUENCE · v' + previewVersion

  /* 离线预览的演示 facts（宿主内由 host 注入真实 facts） */
  var DEMO_FACTS = {
    profile: 'DESKTOP',
    model: 'deepseek-flash',
    workspace: 'weilong',
    sandbox: 'danger-full-access',
    version: '0.2.1-rc.5',
    sessions: 202,
    plugins: 12,
    bundleCount: 6
  }
  var facts = Object.assign({}, DEMO_FACTS, P.facts && typeof P.facts === 'object' ? P.facts : {})

  /* ── 词标逐字 ---------- */
  function buildWordmark(text) {
    if (!wordmark) return
    var html = ''
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i)
      if (ch === ' ') html += '<i class="vy-wordmark-space"></i>'
      else html += '<i class="vy-wordmark-ch" style="--vy-i:' + i + '">' + ch + '</i>'
    }
    wordmark.innerHTML = html
  }
  buildWordmark('DEEPSEEK HARNESS')

  /* ── 事件桥 ─────────────────────────────────────────────────────────── */
  var parentWindow = null
  try { parentWindow = window.parent && window.parent !== window ? window.parent : null } catch (err) { parentWindow = null }
  var posted = { ready: false, done: false, lastProgress: 0, lastPhase: '' }

  function post(type, payload) {
    if (!parentWindow) return
    try {
      parentWindow.postMessage(Object.assign({ type: 'dsh-startup-vyron:' + type }, payload || {}), '*')
    } catch (err) { /* noop */ }
  }

  var probeLines = []
  function probe(message) {
    if (!P.probe) return
    var line = '[vyron-probe] ' + message
    probeLines.push(line)
    try { console.log(line) } catch (err) { /* noop */ }
    if (probeEl) {
      probeEl.textContent = message
      probeEl.dataset.lines = String(probeLines.length)
    }
  }
  function wallMs() {
    var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
    return now - START_WALL
  }

  /* ── 模块创建（全部可选 + 守卫） ─────────────────────────────────────── */
  var modules = { engine: null, hud: null, whale: null }
  var readyList = []
  var audioReady = false

  function track(name, promise) {
    readyList.push(Promise.resolve(promise).then(function (value) {
      probe('module ready: ' + name)
      return value
    }).catch(function (err) {
      console.warn('[vyron] ' + name + ' ready 失败：' + (err && err.message ? err.message : err))
      return null
    }))
  }

  /* 音频先于画面启动（自动播放可能被拦，引擎内部处理手势补播） */
  var audioApi = window.VYRON_AUDIO || null
  try {
    if (audioApi && typeof audioApi.init === 'function') {
      audioApi.init({
        src: '../lib/assets/audio/vyron-boot.wav',
        chimeSrc: '../lib/assets/audio/handoff.wav',
        enabled: P.sound,
        volume: P.volume / 100,
        reduced: REDUCED,
        rate: SPEED
      })
      audioReady = true
    }
  } catch (err) {
    audioReady = false
    console.warn('[vyron] audio init 失败：' + (err && err.message ? err.message : err))
  }

  try {
    if (window.VYRON_ENGINE && fx) {
      modules.engine = window.VYRON_ENGINE.create({
        canvas: fx,
        hiSrc: '../lib/assets/hero-4k.webp',
        midSrc: '../lib/assets/hero-2k.webp',
        posterSrc: '../lib/assets/poster.webp',
        reduced: REDUCED,
        quality: window.devicePixelRatio > 1.5 ? 'auto' : 'high'
      })
      if (modules.engine && modules.engine.ready) track('engine', modules.engine.ready)
    }
  } catch (err) { console.warn('[vyron] engine 创建失败：' + (err && err.message ? err.message : err)) }

  try {
    if (window.VYRON_HUD && hudRoot) {
      modules.hud = window.VYRON_HUD.create({ root: hudRoot, reduced: REDUCED })
      if (modules.hud && modules.hud.ready) track('hud', modules.hud.ready)
      if (modules.hud && typeof modules.hud.setFacts === 'function') modules.hud.setFacts(facts)
    }
  } catch (err) { console.warn('[vyron] hud 创建失败：' + (err && err.message ? err.message : err)) }

  try {
    if (window.VYRON_WHALE && whaleRoot) {
      modules.whale = window.VYRON_WHALE.create({ root: whaleRoot, canvas: whaleFx, reduced: REDUCED })
      if (modules.whale && modules.whale.ready) track('whale', modules.whale.ready)
    }
  } catch (err) { console.warn('[vyron] whale 创建失败：' + (err && err.message ? err.message : err)) }

  /* ── 布局 ───────────────────────────────────────────────────────────── */
  var viewport = { w: window.innerWidth || 1600, h: window.innerHeight || 900 }
  var markRect = { x: viewport.w / 2, y: viewport.h / 2, w: 0, h: 0 }
  var pointer = { x: 0, y: 0, tx: 0, ty: 0 }

  function measureMark() {
    if (!markSlot) return
    var r = markSlot.getBoundingClientRect()
    if (r && r.width > 0) {
      markRect = { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }
      try {
        document.documentElement.style.setProperty('--vy-mark-x', markRect.x + 'px')
        document.documentElement.style.setProperty('--vy-mark-y', markRect.y + 'px')
        document.documentElement.style.setProperty('--vy-mark-w', markRect.w + 'px')
      } catch (err) { /* noop */ }
    }
  }

  function layout() {
    viewport = { w: window.innerWidth || 1600, h: window.innerHeight || 900 }
    measureMark()
    var dpr = Math.min(2, window.devicePixelRatio || 1)
    if (fx) {
      if (modules.engine && typeof modules.engine.resize === 'function') modules.engine.resize(viewport.w, viewport.h)
      else { fx.width = Math.round(viewport.w * dpr); fx.height = Math.round(viewport.h * dpr) }
    }
    if (whaleFx) {
      whaleFx.width = Math.round(viewport.w * dpr)
      whaleFx.height = Math.round(viewport.h * dpr)
      try { whaleFx.style.width = viewport.w + 'px'; whaleFx.style.height = viewport.h + 'px' } catch (err) { /* noop */ }
    }
    if (modules.hud && typeof modules.hud.resize === 'function') modules.hud.resize(viewport.w, viewport.h)
  }

  window.addEventListener('resize', layout, { passive: true })
  window.addEventListener('pointermove', function (event) {
    pointer.tx = (event.clientX / (viewport.w || 1) - 0.5) * 2
    pointer.ty = (event.clientY / (viewport.h || 1) - 0.5) * 2
  }, { passive: true })

  /* ── 舞台状态 ───────────────────────────────────────────────────────── */
  var stageState = { reveal: 0, iris: 0, bloom: 0, phase: 'signal', lockup: 0, seam: 0 }
  var lastStagePhase = ''

  function setText(node, text) { if (node && node.textContent !== text) node.textContent = text }

  function updateStage(t) {
    var phase = TL.phaseAt(t)
    stageState.phase = phase.key
    if (phase.key !== lastStagePhase) {
      stage.dataset.phase = phase.key
      probe('phase ' + phase.key + ' @' + t.toFixed(2) + 's wall=' + (wallMs() / 1000).toFixed(2) + 's')
      lastStagePhase = phase.key
    }

    /* 舷窗 iris：P2 0..1 展开；P5 再放大 */
    var irisOpen = TL.smooth(TL.progress(t, 3.10, 4.85))
    var bloomOpen = TL.smooth(TL.progress(t, 9.00, 9.72))
    stageState.reveal = irisOpen
    stageState.iris = irisOpen
    stageState.bloom = bloomOpen
    stageState.lockup = TL.progress(t, 7.60, 8.60)
    /* 减弱动态：直接给终帧构图（design-spec §3 reduced 分支） */
    if (REDUCED) stageState.lockup = 1
    /* Round2：P5 收束成线 —— 终帧 9.02–9.40 纵向压成一条线，9.20–9.62 全场压黑只剩光缝 */
    var collapse = REDUCED ? 0 : TL.smooth(TL.progress(t, 9.02, 9.40))
    var blackoutP = REDUCED ? 0 : TL.smooth(TL.progress(t, 9.20, 9.62))
    /* 光缝宽度：随收束快速拉满（与宿主交接的整幅光缝衔接，避免突然变宽） */
    stageState.seam = Math.max(TL.easeInCubic(TL.progress(t, 9.02, 9.80)), collapse)
    stageState.collapse = collapse
    if (stage) stage.classList.toggle('is-collapsing', !REDUCED && t >= 9.0 && t < TOTAL)

    try {
      stage.style.setProperty('--vy-reveal', irisOpen.toFixed(4))
      stage.style.setProperty('--vy-iris', (irisOpen * (1 + bloomOpen * 0.6)).toFixed(4))
      stage.style.setProperty('--vy-bloom', bloomOpen.toFixed(4))
      stage.style.setProperty('--vy-lock', stageState.lockup.toFixed(4))
      stage.style.setProperty('--vy-seam', stageState.seam.toFixed(4))
      stage.style.setProperty('--vy-collapse', collapse.toFixed(4))
    } catch (err) { /* noop */ }
    if (blackout) blackout.style.opacity = (blackoutP * 0.97).toFixed(3)

    /* P0 信号层：开场即有 DSH 鱼标 + 字标；0.70–1.12s 淡出交给 HUD 的 ORBIT CORE */
    if (signal) {
      var signalOut = REDUCED ? 1 : TL.smooth(TL.progress(t, 0.66, 0.94))
      var signalAlpha = 1 - signalOut
      signal.style.opacity = signalAlpha.toFixed(3)
      signal.style.setProperty('--vy-signal-out', signalOut.toFixed(3))
      signal.style.visibility = signalAlpha <= 0.001 ? 'hidden' : 'visible'
    }
    setText(signalMain, 'DEEPSEEK HARNESS')
    var remain = Math.max(0, 0.65 - t)
    setText(countdown, t < 0.65 ? 'T-' + remain.toFixed(2) : 'T+OK')

    /* 终帧锁版：7.6 起显示；减弱动态直接亮终帧 */
    var lockVisible = REDUCED ? true : t >= 7.30
    if (lockup) {
      lockup.classList.toggle('is-on', lockVisible)
      lockup.style.setProperty('--vy-lock', stageState.lockup.toFixed(4))
    }
    if (headerEl) headerEl.classList.toggle('is-on', t >= 3.0 && t < 9.02)
    if (footerEl) footerEl.classList.toggle('is-on', t >= 3.0 && t < 9.02)

    /* 提示：终帧出现；收束开始前撤掉 */
    if (hint) {
      var showHint = P.allowSkip && t >= 7.90 && t < 9.02
      hint.hidden = !showHint
      hint.classList.toggle('is-on', showHint)
    }

    /* 白闪：P3 撞镜头 7.52–7.92 + P5 收束高闪 9.02–9.44（Round2） */
    var morphFlash = TL.progress(t, 7.52, 7.70) * (1 - TL.progress(t, 7.70, 7.92))
    var p5Flash = REDUCED ? 0 : TL.progress(t, 9.02, 9.10) * (1 - TL.progress(t, 9.10, 9.40)) * 0.88
    if (flash) flash.style.opacity = Math.max(morphFlash, p5Flash).toFixed(3)
    if (seam) seam.style.opacity = Math.max(stageState.seam * 0.92, collapse * 0.98).toFixed(3)

    /* 进度上报（节流 200ms） */
    var now = wallMs()
    if (now - posted.lastProgress > 200) {
      posted.lastProgress = now
      post('progress', { t: Number(t.toFixed(3)), phase: phase.key, wall: Math.round(now) })
    }
  }

  /* ── 主循环 ─────────────────────────────────────────────────────────── */
  var finished = false
  var ended = false
  var raf = 0
  var lastFrameTime = 0
  var lastAudioSync = -1
  var frameCount = 0
  var frameAccum = 0
  var frameP95 = 0
  var reducedHoldStart = 0

  function animationTime() {
    if (FREEZE !== null) return FREEZE
    var elapsed = wallMs() / 1000
    return Math.min(TOTAL, elapsed * SPEED)
  }

  function frameCtx(t) {
    var phase = TL.phaseAt(t)
    return {
      t: t,
      phase: phase.key,
      phaseProgress: TL.phaseProgress(t, phase.key),
      speed: SPEED,
      reduced: REDUCED,
      w: viewport.w,
      h: viewport.h,
      pointer: pointer,
      facts: facts,
      reveal: stageState.reveal,
      bloom: stageState.bloom,
      lockup: stageState.lockup,
      markRect: markRect,
      lockupMeta: lockupMeta,
      ended: ended
    }
  }

  function draw(t) {
    /* pointer 阻尼 */
    pointer.x += (pointer.tx - pointer.x) * 0.06
    pointer.y += (pointer.ty - pointer.y) * 0.06
    var ctx = frameCtx(t)
    if (modules.engine && typeof modules.engine.render === 'function') {
      try { modules.engine.render(t, ctx) } catch (err) { warnOnce('engine-render', err) }
    }
    if (modules.hud && typeof modules.hud.update === 'function') {
      try { modules.hud.update(t, ctx) } catch (err) { warnOnce('hud-update', err) }
    }
    if (modules.whale && typeof modules.whale.update === 'function') {
      try { modules.whale.update(t, ctx) } catch (err) { warnOnce('whale-update', err) }
    }
    updateStage(t)
  }

  var warned = {}
  function warnOnce(key, err) {
    if (warned[key]) return
    warned[key] = true
    console.warn('[vyron] ' + key + ' 异常（后续静默）：' + (err && err.message ? err.message : err))
  }

  function tick() {
    if (finished) return
    var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
    if (lastFrameTime) {
      var dt = now - lastFrameTime
      if (dt > 0 && dt < 500) {
        frameCount++
        frameAccum += dt
        if (dt > frameP95) frameP95 = dt
      }
    }
    lastFrameTime = now

    var t = animationTime()
    if (FREEZE !== null) {
      /* 定格：只画一帧 */
      draw(t)
      finished = true
      probe('frozen @t=' + t.toFixed(2))
      return
    }

    if (REDUCED) {
      /* 减弱动态：0.35s 淡入 → 静帧定格 2.2s → done('reduced') */
      if (!reducedHoldStart && wallMs() >= 350) reducedHoldStart = wallMs()
      draw(COMPOSE_T)
      if (reducedHoldStart && wallMs() - reducedHoldStart >= 2200) {
        finish('reduced')
        return
      }
    } else {
      draw(t)
      /* 音画漂移校准（audio.js 内部会节流，>0.5s 才 seek） */
      if (audioReady && typeof audioApi.sync === 'function' && Math.abs(t - lastAudioSync) > 0.2) {
        lastAudioSync = t
        try { audioApi.sync(t) } catch (err) { /* noop */ }
      }
      if (t >= TOTAL - 0.0001) {
        finish('natural')
        return
      }
    }

    /* autoskip（离线 QA） */
    if (P.autoskip !== null && wallMs() >= P.autoskip * 1000) {
      finish('skip')
      return
    }

    raf = window.requestAnimationFrame(tick)
  }

  function stats() {
    return {
      frames: frameCount,
      avgMs: frameCount ? Math.round((frameAccum / frameCount) * 100) / 100 : 0,
      p95Ms: Math.round(frameP95 * 100) / 100,
      dpr: window.devicePixelRatio || 1,
      speed: SPEED,
      totalWallMs: Math.round(TOTAL / SPEED * 1000),
      modules: { engine: !!modules.engine, hud: !!modules.hud, whale: !!modules.whale, audio: audioReady }
    }
  }

  /* ── 生命周期 ───────────────────────────────────────────────────────── */
  function ready() {
    if (posted.ready) return
    posted.ready = true
    stage.classList.add('is-ready')
    probe('ready @wall=' + (wallMs() / 1000).toFixed(2) + 's ' + JSON.stringify(stats()))
    post('ready', { version: previewVersion, stats: stats() })
  }

  function finish(reason) {
    if (finished) return
    finished = true
    try { if (raf) window.cancelAnimationFrame(raf) } catch (err) { /* noop */ }
    raf = 0
    stage.dataset.done = '1'
    stage.classList.add('is-ending')
    probe('done ' + reason + ' @t=' + animationTime().toFixed(2) + 's wall=' + (wallMs() / 1000).toFixed(2) + 's')
    if (audioReady) {
      try {
        if (typeof audioApi.stop === 'function') audioApi.stop(reason === 'skip' ? 260 : 320)
        /* reduced 只留交接钟声（design-spec §3/§5） */
        if (typeof audioApi.chime === 'function') audioApi.chime()
      } catch (err) { /* noop */ }
    }
    post('done', { reason: reason, wall: Math.round(wallMs()), stats: stats() })
    if (!parentWindow || P.embed) {
      /* 宿主会接管交接；这里保持终帧 */
      ended = true
      stage.classList.add('is-ended')
    } else {
      showEndcard(reason)
    }
  }

  /* 离线预览结束卡（可重播） */
  function showEndcard(reason) {
    ended = true
    stage.classList.add('is-ended')
    var card = document.getElementById('vyEndcard')
    if (!card) {
      card = document.createElement('div')
      card.id = 'vyEndcard'
      card.className = 'vy-endcard'
      card.innerHTML =
        '<div class="vy-endcard-title">STARWHALE BOOT COMPLETE</div>' +
        '<div class="vy-endcard-sub" id="vyEndcardSub"></div>' +
        '<button type="button" class="vy-endcard-btn" id="vyReplay">重播 · REPLAY (R)</button>'
      stage.appendChild(card)
      var replay = function () { window.location.reload() }
      card.querySelector('#vyReplay').addEventListener('click', replay)
      window.addEventListener('keydown', function (event) {
        if (event.key === 'r' || event.key === 'R') replay()
      })
    }
    card.hidden = false
    card.classList.add('is-on')
    var sub = document.getElementById('vyEndcardSub')
    if (sub) sub.textContent = 'reason=' + reason + ' · ' + previewVersion + ' · wall ' + (wallMs() / 1000).toFixed(2) + 's · p95 ' + stats().p95Ms + 'ms'
    if (hint) hint.hidden = true
  }

  function requestFinish(reason) {
    if (finished) return
    finish(reason)
  }

  function skip() {
    if (!P.allowSkip) return
    if (ended) { window.location.reload(); return }
    requestFinish('skip')
  }

  /* 交互：点击 / 任意键 / Esc / 跳过按钮 */
  stage.addEventListener('pointerdown', function (event) {
    if (event.target && event.target.closest && event.target.closest('button, a')) return
    if (ended && !parentWindow) { window.location.reload(); return }
    if (P.allowSkip) skip()
  })
  window.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' || event.key === 'Esc') { if (P.allowSkip) skip(); return }
    if (P.allowSkip && !ended) skip()
  })
  if (skipBtn) skipBtn.addEventListener('click', function (event) { event.stopPropagation(); skip() })

  /* 启动 */
  layout()
  try { measureMark() } catch (err) { /* noop */ }

  /* 等模块 ready（或 2.6s 超时）后放行，首帧先画一帧占位 */
  draw(0)
  requestAnimationFrame(function () { /* 让首帧提交 */ })
  Promise.all(readyList).then(function () {
    ready()
    if (FREEZE === null && !REDUCED) {
      if (audioReady) { try { if (typeof audioApi.start === 'function') audioApi.start() } catch (err) { /* noop */ } }
    }
    raf = window.requestAnimationFrame(tick)
  })

  window.__VYRON_STAGE__ = {
    version: previewVersion,
    params: P,
    facts: facts,
    state: function () {
      return {
        t: Number(animationTime().toFixed(3)),
        phase: TL.phaseAt(animationTime()).key,
        finished: finished,
        ended: ended,
        reduced: REDUCED,
        freeze: FREEZE,
        stats: stats(),
        probe: probeLines.slice(0, 64)
      }
    },
    skip: skip,
    finish: requestFinish,
    replay: function () { window.location.reload() },
    modules: modules,
    audio: function () { try { return audioApi && audioApi.state ? audioApi.state() : null } catch (err) { return null } }
  }

  probe('boot params ' + JSON.stringify({
    speed: P.speed, freeze: FREEZE, reduced: REDUCED, sound: P.sound, volume: P.volume,
    allowSkip: P.allowSkip, embed: P.embed, probe: P.probe
  }))
})();
