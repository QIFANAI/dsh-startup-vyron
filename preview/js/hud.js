/* ============================================================================
 * VYRON 星海鲸航 — 终端 HUD 模块（素材 A：CMD\LN V1.03 终端语言的启动页移植）
 * ----------------------------------------------------------------------------
 * 权威源：docs/design-spec.md §2.1 / §3 P0–P4 / §7。
 * 契约：window.VYRON_HUD.create({root, reduced}) ->
 *         { ready:Promise, update(t, {phase,facts,speed}), resize(w,h),
 *           dispose(), setFacts(facts) }
 *
 * 设计原则（与素材 A 一致，去掉 Wallpaper Engine 属性系统）：
 *  1) 一切由 update(t) 纯函数式驱动：所有可见状态都是动画秒 t 的函数，
 *     因此 ?t= 定格单帧与实时播放看到的是同一帧（无计时器、无随机种子）。
 *  2) 所有节点类名以 vy-hud 开头；不拦截指针；不改 stage 布局；不读写他人 DOM，
 *     唯一例外是 index.html 约定的 #vyLockupMeta（main 组装锁版，hud 填排版内容）。
 *  3) 灰阶一律用素材 A 原值：--v-ink-1 #E8E9EA / --v-ink-2 #A3A6AA / --v-ink-3 #85888C。
 *  4) 字体：Oxanium 200（大数字）、Share Tech Mono（标签）、JetBrains Mono（日志）、
 *     Noto Sans JP（汉字微图形）、Quicksand-Bold（终帧日期/时间）。
 *  5) reduced：不播动画，直接静态终帧（日期/时间/月相/facts + 边缘框）。
 *
 * Round2（v0.2.0，ROUND2-PLAN §4.2）：把素材 A 的中央大雷达/轨道图搬回画面正中 ——
 *  `0b.` P1 中央 ORBIT CORE（三层同心环 + 外圈虚线环 + 十字准线 + 罗盘/方位标注 +
 *  8s 扫掠 + 3 回波点 + LUNA 轨道 + 官方鱼标核心 + conic 进度环 + DEEPSEEK HARNESS 字标）、
 *  `0c.` 底部控制带（AUDIO · L/R · 128 BINS 频谱 + X/Y 坐标 + SYNC 合并）、
 *  `0d.` 两侧竖向遥测流、`0e.` P4 环回归（字标后方 7.5% 透明度）。详见 docs/material-a.md §7。
 * ========================================================================== */
(function () {
  'use strict'

  var TL = window.VYRON_TIMELINE || null
  var TOTAL = TL && TL.TOTAL ? TL.TOTAL : 9.80
  var PHASES = TL && TL.PHASES ? TL.PHASES : [
    { key: 'signal', a: 0.00, b: 0.65 }, { key: 'console', a: 0.65, b: 3.10 },
    { key: 'breach', a: 3.10, b: 5.10 }, { key: 'whale', a: 5.10, b: 7.60 },
    { key: 'lockup', a: 7.60, b: 9.00 }, { key: 'bloom', a: 9.00, b: 9.80 }
  ]

  var SVG_NS = 'http://www.w3.org/2000/svg'
  var DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
  var DAYS3 = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
  var MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

  /* DSH 官方鱼标 path（lib/assets/brand/whale.svg，viewBox 0 0 50 50）。
     启动页 file:// / iframe 两种加载方式下都不能让核心元素依赖异步 fetch，
     因此把 path 内联复制；视觉与 P0 信号层 / P4 锁版使用同一枚官方 logo。 */
  var WHALE_D = 'M48.8354 10.0479C48.3232 9.79199 48.1025 10.2798 47.8032 10.5278C47.7007 10.6079 47.6143 10.7119 47.5273 10.8076C46.7793 11.624 45.9048 12.1597 44.7622 12.0957C43.0923 12 41.666 12.5356 40.4058 13.8398C40.1377 12.2319 39.2476 11.272 37.8926 10.6558C37.1836 10.3359 36.4668 10.0156 35.9702 9.31982C35.6235 8.82373 35.5293 8.27197 35.356 7.72754C35.2456 7.3999 35.1353 7.06396 34.7651 7.00781C34.3633 6.94385 34.2056 7.2876 34.0479 7.57568C33.418 8.75195 33.1733 10.0479 33.1973 11.3599C33.2524 14.312 34.4736 16.6641 36.8999 18.3359C37.1758 18.5278 37.2466 18.7197 37.1597 19C36.9946 19.5757 36.7974 20.1357 36.624 20.7119C36.5137 21.0801 36.3486 21.1597 35.9624 21C34.6309 20.4321 33.481 19.5918 32.4644 18.5757C30.7393 16.8721 29.1792 14.9917 27.2334 13.52C26.7764 13.1758 26.3193 12.856 25.8467 12.5518C23.8618 10.584 26.1069 8.96777 26.627 8.77588C27.1704 8.57568 26.8159 7.8877 25.0591 7.896C23.3022 7.90381 21.6953 8.50391 19.647 9.30371C19.3477 9.42383 19.0322 9.51172 18.7095 9.58398C16.8501 9.22363 14.9199 9.14355 12.9033 9.37598C9.10596 9.80762 6.07275 11.6396 3.84326 14.7681C1.16455 18.5278 0.53418 22.7998 1.30664 27.2559C2.11768 31.9521 4.46582 35.8398 8.07373 38.8799C11.8159 42.0322 16.1255 43.5762 21.041 43.2803C24.0269 43.104 27.3516 42.6963 31.1016 39.4561C32.0469 39.936 33.0396 40.1279 34.686 40.272C35.9546 40.3921 37.1758 40.208 38.1211 40.0078C39.6021 39.688 39.4995 38.2881 38.9639 38.0322C34.623 35.9678 35.5762 36.8081 34.71 36.1279C36.9155 33.4639 40.2402 30.6958 41.54 21.728C41.6426 21.0161 41.5557 20.5679 41.54 19.9917C41.5322 19.6396 41.6108 19.5039 42.0049 19.4639C43.0923 19.3359 44.1479 19.0317 45.1167 18.4878C47.9292 16.9199 49.064 14.3438 49.3315 11.2559C49.3711 10.7837 49.3237 10.2959 48.8354 10.0479ZM24.3262 37.8398C20.1196 34.4639 18.0791 33.3521 17.2358 33.3999C16.4482 33.4482 16.5898 34.3682 16.7632 34.9678C16.9443 35.5601 17.1812 35.9683 17.5117 36.4878C17.7402 36.832 17.8979 37.3442 17.2832 37.728C15.9282 38.584 13.5728 37.4399 13.4624 37.3838C10.7207 35.7358 8.42822 33.5601 6.81348 30.584C5.25342 27.7197 4.34766 24.6479 4.19775 21.3677C4.1582 20.5757 4.38672 20.2959 5.15869 20.1519C6.17529 19.96 7.22314 19.9199 8.23926 20.0718C12.5327 20.7119 16.1885 22.6719 19.2529 25.7759C21.002 27.5439 22.3252 29.6558 23.6885 31.7202C25.1377 33.9121 26.6978 36 28.6831 37.7119C29.3843 38.312 29.9434 38.7681 30.479 39.104C28.8643 39.2881 26.1699 39.3281 24.3262 37.8398ZM26.3433 24.6001C26.3433 24.248 26.6191 23.9678 26.9658 23.9678C27.0444 23.9678 27.1152 23.9839 27.1782 24.0078C27.2651 24.04 27.3438 24.0879 27.4067 24.1602C27.5171 24.272 27.5801 24.4321 27.5801 24.6001C27.5801 24.9521 27.3042 25.2319 26.9575 25.2319C26.6108 25.2319 26.3433 24.9521 26.3433 24.6001ZM32.6064 27.8799C32.2046 28.0479 31.8027 28.1919 31.4165 28.208C30.8179 28.2397 30.1641 27.9922 29.8096 27.688C29.2583 27.2158 28.8643 26.9521 28.6987 26.1279C28.6279 25.7759 28.6675 25.2319 28.7305 24.9199C28.8721 24.248 28.7144 23.8159 28.2495 23.4238C27.8716 23.104 27.3911 23.0161 26.8633 23.0161C26.666 23.0161 26.4849 22.9277 26.3511 22.856C26.1304 22.7441 25.9492 22.4639 26.1226 22.1201C26.1777 22.0078 26.4458 21.7358 26.5088 21.688C27.2256 21.272 28.0527 21.4077 28.8169 21.7197C29.5259 22.0161 30.0615 22.5601 30.834 23.3281C31.6216 24.2559 31.7632 24.5117 32.2124 25.208C32.5669 25.752 32.8901 26.312 33.1104 26.9521C33.2446 27.3521 33.0713 27.6802 32.6064 27.8799Z'

  /* 月相：本地计算（Meeus《Astronomical Algorithms》第 49 章），不联网。 */
  var SYNODIC = 29.530588853
  var MS_DAY = 864e5
  var DELTA_T = 70e3

  /* ── 小工具 ─────────────────────────────────────────────────────────── */
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v) }
  function clamp01(v) { return clamp(v, 0, 1) }
  function smooth(v) { var x = clamp01(v); return x * x * (3 - 2 * x) }
  function progress(t, a, b) {
    if (!(b > a)) return t >= b ? 1 : 0
    return clamp01((t - a) / (b - a))
  }
  function easeOutCubic(v) { var x = clamp01(v); return 1 - Math.pow(1 - x, 3) }
  function easeInOutCubic(v) {
    var x = clamp01(v)
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n }
  function pad3(n) { return (n < 100 ? (n < 10 ? '00' : '0') : '') + n }
  function floorStr(n, len) { return String(n).padStart(len, '0') }
  function hhmmss(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()) }
  function hhmm(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) }
  /** 本地时区标签，如 LOCAL · UTC+08。 */
  function tzLabel(d) {
    var off = -d.getTimezoneOffset() / 60
    var sign = off >= 0 ? '+' : '-'
    var abs = Math.abs(off)
    var h = Math.floor(abs)
    var m = Math.round((abs - h) * 60)
    return 'LOCAL · UTC' + sign + pad2(h) + (m ? ':' + pad2(m) : '')
  }
  function phaseAt(t) {
    for (var i = 0; i < PHASES.length; i++) if (t < PHASES[i].b) return PHASES[i]
    return PHASES[PHASES.length - 1]
  }
  function str(v, fallback) {
    if (v === null || v === undefined) return fallback
    var s = String(v).trim()
    return s ? s : fallback
  }
  function num(v) {
    if (v === null || v === undefined || v === '') return null
    var n = typeof v === 'number' ? v : parseInt(v, 10)
    return isFinite(n) ? n : null
  }

  /* ── DOM 构建工具（所有类名统一加 vy-hud- 前缀） ────────────────────── */
  function prefixClasses(value) {
    var parts = String(value || '').split(/\s+/)
    var out = []
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i]) continue
      out.push(parts[i].indexOf('vy-hud-') === 0 ? parts[i] : 'vy-hud-' + parts[i])
    }
    return out.join(' ')
  }
  function el(tag, cls, textContent) {
    var node = document.createElement(tag)
    if (cls) node.className = prefixClasses(cls)
    if (textContent !== undefined && textContent !== null) node.textContent = textContent
    return node
  }
  function svgEl(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag)
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue
        if (k === 'class') node.setAttribute(k, prefixClasses(attrs[k]))
        else node.setAttribute(k, attrs[k])
      }
    }
    return node
  }
  function append(parent) {
    for (var i = 1; i < arguments.length; i++) if (arguments[i]) parent.appendChild(arguments[i])
    return parent
  }

  /* 写入守卫：只在值变化时碰 DOM（每帧调用也不会触发多余排版）。 */
  function op(node, value) {
    if (!node) return
    var v = clamp01(value)
    var s = v.toFixed(3)
    if (node.__vyOp !== s) { node.__vyOp = s; node.style.opacity = s }
  }
  function tf(node, value) {
    if (node && node.__vyTf !== value) { node.__vyTf = value; node.style.transform = value }
  }
  function text(node, value) {
    if (node && node.textContent !== value) node.textContent = value
  }
  function cssVar(node, key, value) {
    if (!node) return
    if (!node.__vyCss) node.__vyCss = {}
    if (node.__vyCss[key] === value) return
    node.__vyCss[key] = value
    node.style.setProperty(key, value)
  }

  /* ══════════════════════════════════════════════════════════════════════
   * 月相：本地计算（不联网，不依赖宿主）
   * ════════════════════════════════════════════════════════════════════ */
  var RAD = Math.PI / 180
  var MOON_PHASES = [['New Moon', 0], ['First Quarter', 0.25], ['Full Moon', 0.5], ['Last Quarter', 0.75]]

  /** 第 k 个朔望月里相位 q（0/.25/.5/.75）的时刻（ms, UT）。 */
  function meeusPhase(k, q) {
    k += q
    var T = k / 1236.85, T2 = T * T, T3 = T2 * T, T4 = T3 * T
    var jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T2 - 0.00000015 * T3 + 0.00000000073 * T4
    var E = 1 - 0.002516 * T - 0.0000074 * T2
    var M = RAD * (2.5534 + 29.1053567 * k - 0.0000014 * T2 - 0.00000011 * T3)
    var Mp = RAD * (201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4)
    var F = RAD * (160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4)
    var O = RAD * (124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3)
    var s = Math.sin, c = Math.cos

    if (q === 0 || q === 0.5) {
      var n = q === 0
      jde += (n ? -0.4072 : -0.40614) * s(Mp) + (n ? 0.17241 : 0.17302) * E * s(M)
        + (n ? 0.01608 : 0.01614) * s(2 * Mp) + (n ? 0.01039 : 0.01043) * s(2 * F)
        + (n ? 0.00739 : 0.00734) * E * s(Mp - M) - (n ? 0.00514 : 0.00515) * E * s(Mp + M)
        + (n ? 0.00208 : 0.00209) * E * E * s(2 * M) - 0.00111 * s(Mp - 2 * F) - 0.00057 * s(Mp + 2 * F)
        + 0.00056 * E * s(2 * Mp + M) - 0.00042 * s(3 * Mp) + 0.00042 * E * s(M + 2 * F)
        + 0.00038 * E * s(M - 2 * F) - 0.00024 * E * s(2 * Mp - M) - 0.00017 * s(O)
        - 0.00007 * s(Mp + 2 * M) + 0.00004 * s(2 * Mp - 2 * F) + 0.00004 * s(3 * M)
        + 0.00003 * s(Mp + M - 2 * F) + 0.00003 * s(2 * Mp + 2 * F) - 0.00003 * s(Mp + M + 2 * F)
        + 0.00003 * s(Mp - M + 2 * F) - 0.00002 * s(Mp - M - 2 * F) - 0.00002 * s(3 * Mp + M)
        + 0.00002 * s(4 * Mp)
    } else {
      jde += -0.62801 * s(Mp) + 0.17172 * E * s(M) - 0.01183 * E * s(Mp + M) + 0.00862 * s(2 * Mp)
        + 0.00804 * s(2 * F) + 0.00454 * E * s(Mp - M) + 0.00204 * E * E * s(2 * M) - 0.0018 * s(Mp - 2 * F)
        - 0.0007 * s(Mp + 2 * F) - 0.0004 * s(3 * Mp) - 0.00034 * E * s(2 * Mp - M) + 0.00032 * E * s(M + 2 * F)
        + 0.00032 * E * s(M - 2 * F) - 0.00028 * E * E * s(Mp + 2 * M) + 0.00027 * E * s(2 * Mp + M)
        - 0.00017 * s(O) - 0.00005 * s(Mp - M - 2 * F) + 0.00004 * s(2 * Mp + 2 * F) - 0.00004 * s(Mp + M + 2 * F)
        + 0.00004 * s(Mp - 2 * M) + 0.00003 * s(Mp + M - 2 * F) + 0.00003 * s(3 * M) + 0.00002 * s(2 * Mp - 2 * F)
        + 0.00002 * s(Mp - M + 2 * F) - 0.00002 * s(3 * Mp + M)
      var W = 0.00306 - 0.00038 * E * c(M) + 0.00026 * c(Mp) - 0.00002 * c(Mp - M) + 0.00002 * c(Mp + M) + 0.00002 * c(2 * F)
      jde += q === 0.25 ? W : -W
    }

    var A = [
      [299.77 + 0.107408 * k - 0.009173 * T2, 0.000325], [251.88 + 0.016321 * k, 0.000165],
      [251.83 + 26.651886 * k, 0.000164], [349.42 + 36.412478 * k, 0.000126], [84.66 + 18.206239 * k, 0.00011],
      [141.74 + 53.303771 * k, 0.000062], [207.14 + 2.453732 * k, 0.00006], [154.84 + 7.30686 * k, 0.000056],
      [34.52 + 27.261239 * k, 0.000047], [207.19 + 0.121824 * k, 0.000042], [291.34 + 1.844379 * k, 0.00004],
      [161.72 + 24.198154 * k, 0.000037], [239.56 + 25.513099 * k, 0.000035], [331.55 + 3.592518 * k, 0.000023]
    ]
    for (var i = 0; i < A.length; i++) jde += A[i][1] * s(RAD * A[i][0])
    return (jde - 2440587.5) * MS_DAY - DELTA_T
  }

  /** now 前后的相位事件表（本地计算）。 */
  function calcEvents(now) {
    var k0 = Math.floor((now - Date.UTC(2000, 0, 6, 18, 14)) / MS_DAY / SYNODIC)
    var out = []
    for (var k = k0 - 1; k <= k0 + 2; k++) {
      for (var i = 0; i < MOON_PHASES.length; i++) out.push({ phase: MOON_PHASES[i][0], t: meeusPhase(k, MOON_PHASES[i][1]) })
    }
    out.sort(function (a, b) { return a.t - b.t })
    return out
  }

  function phaseName(p) {
    var age = p * SYNODIC
    var near = function (a) { return Math.abs(age - a) < 1 }
    if (age < 1 || age > SYNODIC - 1) return 'NEW MOON'
    if (near(SYNODIC / 4)) return 'FIRST QUARTER'
    if (near(SYNODIC / 2)) return 'FULL MOON'
    if (near(SYNODIC * 3 / 4)) return 'LAST QUARTER'
    if (p < 0.25) return 'WAXING CRESCENT'
    if (p < 0.5) return 'WAXING GIBBOUS'
    if (p < 0.75) return 'WANING GIBBOUS'
    return 'WANING CRESCENT'
  }

  /** 月相状态：{phase 0..1, illum 0..1, age 天, fullIn 天, name}。 */
  function moonState(now) {
    var events = calcEvents(now)
    var phase = null, fullAt = null, lastNew = null, nextNew = null
    var i, e
    for (i = 0; i < events.length; i++) {
      e = events[i]
      if (e.phase === 'New Moon') {
        if (e.t <= now) lastNew = e
        else if (!nextNew) nextNew = e
      }
      if (e.phase === 'Full Moon' && e.t > now && fullAt === null) fullAt = e.t
    }
    if (lastNew && nextNew) phase = (now - lastNew.t) / (nextNew.t - lastNew.t)
    if (phase === null) {
      var k = (now - Date.UTC(2000, 0, 6, 18, 14)) / MS_DAY / SYNODIC
      phase = k - Math.floor(k)
    }
    phase = clamp01(phase)
    var illum = (1 - Math.cos(2 * Math.PI * phase)) / 2
    if (fullAt === null) fullAt = now + ((((0.5 - phase) % 1) + 1) % 1) * SYNODIC * MS_DAY
    return {
      phase: phase,
      illum: illum,
      age: phase * SYNODIC,
      fullIn: (fullAt - now) / MS_DAY,
      name: phaseName(phase)
    }
  }

  /** 亮面月盘路径（waxing 右侧亮）。 */
  function moonPath(cx, cy, r, phase) {
    var rx = (r * Math.abs(Math.cos(2 * Math.PI * phase))).toFixed(2)
    var waxing = phase < 0.5
    var gibbous = phase > 0.25 && phase < 0.75
    var top = cx + ' ' + (cy - r), bottom = cx + ' ' + (cy + r)
    var limb = waxing ? 1 : 0
    var term = waxing ? (gibbous ? 1 : 0) : (gibbous ? 0 : 1)
    return 'M' + top + ' A' + r + ' ' + r + ' 0 0 ' + limb + ' ' + bottom +
      ' A' + rx + ' ' + r + ' 0 0 ' + term + ' ' + top + ' Z'
  }

  /* ══════════════════════════════════════════════════════════════════════
   * facts 归一化：宿主注入的真实 DSH facts；缺省给演示兜底（离线预览可见）
   * ════════════════════════════════════════════════════════════════════ */
  function baseName(path) {
    var s = str(path, '')
    if (!s) return ''
    s = s.replace(/[\\/]+$/, '')
    var parts = s.split(/[\\/]/)
    return parts[parts.length - 1] || s
  }
  function shortPath(path, max) {
    var s = str(path, '')
    if (!s) return ''
    s = s.replace(/\\/g, '/')
    max = max || 26
    return s.length > max ? '…' + s.slice(s.length - (max - 1)) : s
  }

  function normaliseFacts(input) {
    var f = input && typeof input === 'object' ? input : {}
    var sessions = num(f.sessions)
    var bundles = num(f.bundles)
    if (bundles === null) bundles = num(f.bundleCount)
    if (bundles === null) bundles = num(f.plugins)
    return {
      profile: str(f.profile, 'DESKTOP'),
      model: str(f.model, 'deepseek-flash'),
      workspace: str(f.workspace, str(f.cwd, 'dsh-workspace')),
      sandbox: str(f.sandbox, 'workspace-write'),
      sessions: sessions === null ? '—' : String(sessions),
      bundles: bundles === null ? '—' : String(bundles),
      version: str(f.version, '0.1.0')
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
   * 模块本体
   * ════════════════════════════════════════════════════════════════════ */
  function create(options) {
    options = options || {}
    var root = options.root
    if (!root) throw new Error('[vyron-hud] create() 需要 root 容器')
    var reduced = !!options.reduced
    var doc = root.ownerDocument || document

    var bootAt = new Date()
    var bootClock = hhmmss(bootAt)
    var state = {
      t: 0,
      phase: '',
      w: 0,
      h: 0,
      disposed: false,
      reduced: reduced,
      factsRaw: null,
      facts: normaliseFacts(null),
      moon: moonState(Date.now()),
      lastMinute: -1,
      lastUptime: -1,
      logChars: [],
      logStarted: 0,
      syncPct: -1,
      dayPct: -1,
      radarDeg: -1,
      coreSweepDeg: -1,
      spectrumTick: -1,
      coordsTick: -1,
      reducedDone: false
    }

    /* ── 根节点 ────────────────────────────────────────────────────── */
    var hud = doc.createElement('div')
    hud.className = 'vy-hud'
    hud.setAttribute('data-phase', 'signal')
    hud.setAttribute('data-reduced', reduced ? '1' : '0')
    root.appendChild(hud)

    var R = {}

    /* ── 0. 40px 网格 + 扫描线（P1 亮，P2 退） ──────────────────────── */
    R.grid = el('div', 'grid')
    hud.appendChild(R.grid)

    /* ══════════════════════════════════════════════════════════════════════
     * 0b. P1 中央 ORBIT CORE（素材 A 中央雷达/轨道图 → 画面正中；核心 = DSH 鱼标）
     * --------------------------------------------------------------------
     * 版式语言取自 3804048141/index.html 的 mg_radar / mg__globe 数据组：
     *   三层同心环（r 200/152/116）+ 外圈虚线环（r 222）+ 5° 罗盘刻度(72 格)
     *   + 十字准线（1.2R…1.6R）+ 顶部信号弧 + 8s 扫掠扇面（P2 充能加速）
     *   + 3 个闪烁回波点 + 6 组方位标注（IN·EVENTS / LUNA·ORBIT / SOL /
     *   SRC·LOCAL / SWEEP 8S / CONTACTS 3）。
     * 环心 50%/47%（与舷窗 iris 同心，P2 外环放大淡出时"变成 iris 圆"）；
     * 鱼标核心约 50%/44%（与 Lead 的 P0 信号层鱼标位置衔接，同一枚官方 logo）。
     * 全部状态都由 t 推导（?t= 定格与实时播放同帧），无 CSS 循环动画。
     * ════════════════════════════════════════════════════════════════════ */
    var CORE_C = 400
    var CORE_R = 200
    function corePolar(r, deg) {
      var a = deg * Math.PI / 180
      return [CORE_C + Math.sin(a) * r, CORE_C - Math.cos(a) * r]
    }
    function xy(p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1) }

    R.core = el('div', 'core')
    /* 中央微图形网格：20px 细网（素材 A 的微图形密度语言），径向淡出成圆形准星区 */
    R.core.appendChild(el('div', 'core-mesh'))
    var coreSvg = svgEl('svg', { viewBox: '0 0 800 800', class: 'core-svg', 'aria-hidden': 'true' })
    /* 梯度：扫掠光束（径向渐隐）+ 外环磷光环带 */
    var coreDefs = svgEl('defs', {})
    var beamGrad = svgEl('radialGradient', { id: 'vyCoreBeam', gradientUnits: 'userSpaceOnUse', cx: 400, cy: 400, r: 200 })
    beamGrad.appendChild(svgEl('stop', { offset: '0', 'stop-color': '#e8e9ea', 'stop-opacity': '0.34' }))
    beamGrad.appendChild(svgEl('stop', { offset: '0.5', 'stop-color': '#e8e9ea', 'stop-opacity': '0.18' }))
    beamGrad.appendChild(svgEl('stop', { offset: '1', 'stop-color': '#e8e9ea', 'stop-opacity': '0.03' }))
    coreDefs.appendChild(beamGrad)
    var haloGrad = svgEl('radialGradient', { id: 'vyCoreHalo', gradientUnits: 'userSpaceOnUse', cx: 400, cy: 400, r: 232 })
    haloGrad.appendChild(svgEl('stop', { offset: '0.865', 'stop-color': '#e8e9ea', 'stop-opacity': '0' }))
    haloGrad.appendChild(svgEl('stop', { offset: '0.93', 'stop-color': '#e8e9ea', 'stop-opacity': '0.21' }))
    haloGrad.appendChild(svgEl('stop', { offset: '0.99', 'stop-color': '#e8e9ea', 'stop-opacity': '0.07' }))
    haloGrad.appendChild(svgEl('stop', { offset: '1', 'stop-color': '#e8e9ea', 'stop-opacity': '0' }))
    coreDefs.appendChild(haloGrad)
    coreSvg.appendChild(coreDefs)
    var coreRings = svgEl('g', { class: 'core-rings' })
    /* 外环磷光环带（雷达玻壳的辉光，压在环外侧，不糊环内刻度） */
    coreRings.appendChild(svgEl('circle', {
      class: 'core-halo', cx: 400, cy: 400, r: 216,
      fill: 'none', stroke: 'url(#vyCoreHalo)', 'stroke-width': 34
    }))
    /* 十字准线（延伸到 1.6R；中心让位给鱼标/字标，做成四臂雷达十字） */
    coreRings.appendChild(svgEl('path', { class: 'core-cross', d: 'M80 400 H276 M524 400 H720 M400 80 V276 M400 524 V720' }))
    /* 十字臂上的距离刻度（视觉密度照素材 A 的 radar 刻度语言） */
    var rangeTicks = svgEl('g', { class: 'core-range' })
    for (var rti = 1; rti <= 12; rti++) {
      var rtd = 80 + rti * 18
      if (rtd > 268 && rtd < 532) continue
      var rt = svgEl('path', {
        class: 'core-rangetick',
        d: 'M400 ' + (rtd - 3) + ' V' + (rtd + 3) +
          ' M' + (rtd - 3) + ' 400 H' + (rtd + 3) +
          ' M' + (800 - rtd - 3) + ' 400 H' + (800 - rtd + 3) +
          ' M400 ' + (800 - rtd - 3) + ' V' + (800 - rtd + 3)
      })
      rangeTicks.appendChild(rt)
    }
    coreRings.appendChild(rangeTicks)
    /* 24 条细辐条（从内环到外环，低对比；把中央"填空"成仪表盘而不是黑场） */
    var spokes = svgEl('g', { class: 'core-spokes' })
    for (var spi = 0; spi < 24; spi++) {
      var spa = corePolar(70, spi * 15)
      var spb = corePolar(196, spi * 15)
      spokes.appendChild(svgEl('line', {
        x1: spa[0].toFixed(1), y1: spa[1].toFixed(1),
        x2: spb[0].toFixed(1), y2: spb[1].toFixed(1), class: 'core-spoke'
      }))
    }
    coreRings.appendChild(spokes)
    /* 三层同心环 */
    coreRings.appendChild(svgEl('circle', { class: 'core-ring core-ring-out', cx: 400, cy: 400, r: 200 }))
    coreRings.appendChild(svgEl('circle', { class: 'core-ring core-ring-mid', cx: 400, cy: 400, r: 152 }))
    coreRings.appendChild(svgEl('circle', { class: 'core-ring core-ring-in', cx: 400, cy: 400, r: 116 }))
    /* 中环刻度环（细点环）与 LUNA 轨道椭圆 + 月相标记（照 mg_globe 的轨道语言） */
    coreRings.appendChild(svgEl('circle', { class: 'core-ring core-ring-dot', cx: 400, cy: 400, r: 176 }))
    coreRings.appendChild(svgEl('circle', { class: 'core-ring core-ring-mid2', cx: 400, cy: 400, r: 134 }))
    var moonOrbit = svgEl('g', { transform: 'rotate(-16 400 400)' })
    moonOrbit.appendChild(svgEl('ellipse', { class: 'core-orbit', cx: 400, cy: 400, rx: 310, ry: 150 }))
    R.coreMoon = svgEl('circle', { class: 'core-moon', cx: 700, cy: 400, r: 4 })
    moonOrbit.appendChild(R.coreMoon)
    coreRings.appendChild(moonOrbit)
    /* 四角定位括号（照素材 A 的角落取景标记语言，落在虚线环外沿） */
    var cornerMarks = svgEl('g', { class: 'core-corners' })
    var CORE_CORNER = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
    for (var cmi = 0; cmi < 4; cmi++) {
      var cmx = 400 + CORE_CORNER[cmi][0] * 236
      var cmy = 400 + CORE_CORNER[cmi][1] * 236
      cornerMarks.appendChild(svgEl('path', {
        class: 'core-corner',
        d: 'M' + cmx + ' ' + (cmy - CORE_CORNER[cmi][1] * 12) + ' V' + cmy + ' H' + (cmx + CORE_CORNER[cmi][0] * 12)
      }))
    }
    coreRings.appendChild(cornerMarks)
    /* 外圈虚线环（慢转）+ 内圈虚线环（反向慢转） */
    R.coreDashOut = svgEl('circle', { class: 'core-dash core-dash-out', cx: 400, cy: 400, r: 222 })
    R.coreDashIn = svgEl('circle', { class: 'core-dash core-dash-in', cx: 400, cy: 400, r: 74 })
    coreRings.appendChild(R.coreDashIn)
    coreRings.appendChild(R.coreDashOut)
    /* 罗盘刻度环：每 2.5° 一格、每 15° 长格 */
    var coreTicks = svgEl('g', { class: 'core-ticks' })
    for (var cti = 0; cti < 144; cti++) {
      var cta = cti * 2.5
      var ctmajor = cti % 6 === 0
      var ctp1 = corePolar(ctmajor ? 202 : 204, cta)
      var ctp2 = corePolar(ctmajor ? 214 : 209, cta)
      var ctick = svgEl('line', {
        x1: ctp1[0].toFixed(1), y1: ctp1[1].toFixed(1),
        x2: ctp2[0].toFixed(1), y2: ctp2[1].toFixed(1), class: 'core-tick'
      })
      if (ctmajor) ctick.classList.add('is-major')
      coreTicks.appendChild(ctick)
    }
    coreRings.appendChild(coreTicks)
    /* 顶部信号弧（±35°）与 SOL 星标 */
    var sigA = corePolar(200, -35), sigB = corePolar(200, 35)
    coreRings.appendChild(svgEl('path', {
      class: 'core-sig-arc',
      d: 'M' + xy(sigA) + ' A200 200 0 0 1 ' + xy(sigB)
    }))
    coreRings.appendChild(svgEl('circle', { class: 'core-sol', cx: 662, cy: 286, r: 3 }))
    coreRings.appendChild(svgEl('path', { class: 'core-cross', d: 'M662 277 V272 M662 295 V300 M653 286 H648 M671 286 H676' }))
    /* 引线 + 节点（对齐 mg_radar 的 IN·EVENTS / LUNA·ORBIT / SRC·LOCAL 引线语言） */
    coreRings.appendChild(svgEl('path', {
      class: 'core-lead',
      d: 'M212 332 L172 318 H140 M523 242 L558 222 H616 M212 468 L176 482 H148 M588 468 L562 484'
    }))
    coreRings.appendChild(svgEl('rect', { class: 'core-node', x: 168, y: 314, width: 8, height: 8 }))
    coreRings.appendChild(svgEl('rect', { class: 'core-node-fill', x: 208, y: 328, width: 8, height: 8 }))
    coreRings.appendChild(svgEl('rect', { class: 'core-node', x: 554, y: 218, width: 8, height: 8 }))
    coreRings.appendChild(svgEl('rect', { class: 'core-node-fill', x: 519, y: 238, width: 8, height: 8 }))
    coreRings.appendChild(svgEl('rect', { class: 'core-node', x: 172, y: 478, width: 8, height: 8 }))
    coreRings.appendChild(svgEl('rect', { class: 'core-node-fill', x: 208, y: 464, width: 8, height: 8 }))
    coreRings.appendChild(svgEl('rect', { class: 'core-node', x: 584, y: 464, width: 8, height: 8 }))
    /* 3 个闪烁回波点（角度/半径照素材 A 的 pulse rect 位置等比放大） */
    R.coreContacts = []
    var CORE_CONTACTS = [[34, 108], [227, 112], [113, 106]]
    for (var cci = 0; cci < CORE_CONTACTS.length; cci++) {
      var ccp = corePolar(CORE_CONTACTS[cci][1], CORE_CONTACTS[cci][0])
      var ccontact = svgEl('rect', {
        class: 'core-contact',
        x: (ccp[0] - 2.5).toFixed(1), y: (ccp[1] - 2.5).toFixed(1), width: 5, height: 5
      })
      ccontact.__vyAngle = CORE_CONTACTS[cci][0]
      coreRings.appendChild(ccontact)
      R.coreContacts.push(ccontact)
    }
    /* 8s 扫掠扇面 + 亮缘弧（P2 充能时整体加速） */
    R.coreSweep = svgEl('g', { class: 'core-sweep' })
    var swTip = corePolar(200, 45)
    var swTailTip = corePolar(200, 90)
    /* 拖尾扇面（前 45° 之后的一段更淡的回波） */
    R.coreSweep.appendChild(svgEl('path', {
      class: 'core-sweep-wedge core-sweep-tail',
      d: 'M400 400 L' + xy(swTip) + ' A200 200 0 0 1 ' + xy(swTailTip) + ' Z'
    }))
    R.coreSweep.appendChild(svgEl('path', {
      class: 'core-sweep-wedge',
      fill: 'url(#vyCoreBeam)',
      d: 'M400 400 L400 200 A200 200 0 0 1 ' + xy(swTip) + ' Z'
    }))
    R.coreSweep.appendChild(svgEl('line', { class: 'core-sweep-line', x1: 400, y1: 400, x2: 400, y2: 200 }))
    var swArcA = corePolar(196, -12), swArcB = corePolar(196, 36)
    R.coreSweep.appendChild(svgEl('path', {
      class: 'core-sweep-arc',
      d: 'M' + xy(swArcA) + ' A196 196 0 0 1 ' + xy(swArcB)
    }))
    coreRings.appendChild(R.coreSweep)
    coreRings.appendChild(svgEl('circle', { class: 'core-dot', cx: 400, cy: 400, r: 2 }))
    coreSvg.appendChild(coreRings)
    R.core.appendChild(coreSvg)

    /* 方位标注（HTML 叠在 SVG 上，字体/字距走素材 A 的 Share Tech Mono 语言） */
    var coreLabels = el('div', 'core-labels')
    function coreLabel(content, posClass, left, top, compass) {
      var node = el('span', 'core-label', content)
      node.classList.add(posClass)
      if (compass) node.classList.add('is-compass')
      node.style.left = left + '%'
      node.style.top = top + '%'
      coreLabels.appendChild(node)
      return node
    }
    coreLabel('000', 'is-mid', 50, 21.5, true)
    coreLabel('090', 'is-start', 76.5, 50.5, true)
    coreLabel('180', 'is-mid', 50, 78.5, true)
    coreLabel('270', 'is-end', 23.5, 50.5, true)
    /* 每 30° 的方位小标（只取 8 个斜向刻度，避免与四正位重复） */
    var bearingDeg = [30, 60, 120, 150, 210, 240, 300, 330]
    for (var bdi = 0; bdi < bearingDeg.length; bdi++) {
      var bdp = corePolar(228, bearingDeg[bdi])
      var bdAnchor = bearingDeg[bdi] > 15 && bearingDeg[bdi] < 165 ? 'is-start'
        : (bearingDeg[bdi] > 195 && bearingDeg[bdi] < 345 ? 'is-end' : 'is-mid')
      var bd = coreLabel(floorStr(bearingDeg[bdi], 3), bdAnchor, bdp[0] / 8, bdp[1] / 8)
      bd.classList.add('is-bearing')
    }
    coreLabel('IN · EVENTS', 'is-end', 17, 40.25)
    coreLabel('LUNA · ORBIT', 'is-start', 77, 28.25)
    coreLabel('SOL', 'is-mid', 82.75, 34)
    coreLabel('SRC · LOCAL', 'is-end', 17.5, 60.25)
    coreLabel('SWEEP 8S', 'is-start', 70.5, 60.25)
    coreLabel('CONTACTS 3', 'is-start', 70.5, 62.5)
    coreLabel('SIG', 'is-end', 34.75, 30.1)
    R.coreSigVal = coreLabel('0.00', 'is-start', 65.25, 30.1)
    R.core.appendChild(coreLabels)

    /* 核心中央：官方鱼标 + conic 进度环 + DEEPSEEK HARNESS 字标 + BOOT CORE */
    R.coreCenter = el('div', 'core-center')
    var coreMark = el('div', 'core-markwrap')
    var coreDial = el('i', 'core-dial')
    var coreDialTicks = el('i', 'core-dial-ticks')
    var coreFish = svgEl('svg', { class: 'core-fish', viewBox: '0 0 50 50', 'aria-hidden': 'true' })
    coreFish.appendChild(svgEl('path', { d: WHALE_D, fill: 'currentColor', 'fill-rule': 'nonzero' }))
    append(coreMark, coreDialTicks, coreDial, coreFish)
    append(R.coreCenter,
      coreMark,
      el('div', 'core-wordmark', 'DEEPSEEK HARNESS'),
      el('div', 'core-caption', 'BOOT CORE · CMD\\LN')
    )
    R.core.appendChild(R.coreCenter)
    hud.appendChild(R.core)

    /* ══════════════════════════════════════════════════════════════════════
     * 0c. 底部控制带：AUDIO · L/R · 128 BINS 频谱 + X/Y 坐标 + SYNC 合并
     * ════════════════════════════════════════════════════════════════════ */
    R.band = el('div', 'band')
    var bandAudio = el('div', 'band-audio')
    var bandHead = el('div', 'band-audio-head')
    bandHead.appendChild(el('span', 'band-audio-label', 'AUDIO · L/R · 128 BINS'))
    R.bandPeak = el('span', 'band-peak', 'PEAK 0.00')
    bandHead.appendChild(R.bandPeak)
    var bandSpectrum = el('div', 'band-spectrum')
    R.bars = []
    for (var bch = 0; bch < 2; bch++) {
      var bandRow = el('div', 'band-row')
      bandRow.classList.add(bch ? 'is-r' : 'is-l')
      bandRow.appendChild(el('i', 'band-ch', bch ? 'R' : 'L'))
      var bandBars = el('div', 'band-bars')
      for (var bbi = 0; bbi < 32; bbi++) {
        var bar = el('i', 'band-bar')
        bar.style.setProperty('--vy-bar', '0.18')
        bandBars.appendChild(bar)
        R.bars.push(bar)
      }
      bandRow.appendChild(bandBars)
      bandSpectrum.appendChild(bandRow)
    }
    append(bandAudio, bandHead, bandSpectrum)
    var bandMeta = el('div', 'band-meta')
    R.coords = el('span', 'band-coords', 'X 0000 · Y 0000 · CMD\\LN')
    bandMeta.appendChild(R.coords)
    var sync = el('div', 'sync')
    sync.appendChild(el('span', 'sync-label', 'SYNC'))
    R.syncVal = el('span', 'sync-val', '000%')
    sync.appendChild(R.syncVal)
    var syncBar = el('div', 'sync-bar')
    R.syncFill = el('i', 'sync-fill')
    syncBar.appendChild(R.syncFill)
    sync.appendChild(syncBar)
    bandMeta.appendChild(sync)
    append(R.band, bandAudio, bandMeta)
    hud.appendChild(R.band)
    R.sync = R.band

    /* ══════════════════════════════════════════════════════════════════════
     * 0d. 两侧竖向遥测流（素材 A 的 TTY0 / UTF-8 · LF / 13L 语言；缓慢上移）
     * ════════════════════════════════════════════════════════════════════ */
    function buildSideRail(side) {
      var rail = el('div', 'side side-' + side)
      rail.appendChild(el('i', 'side-line'))
      var ticks = el('div', 'side-ticks')
      for (var si = 0; si <= 21; si++) {
        var st = el('i', 'side-tick')
        if (si % 5 === 0) st.classList.add('is-major')
        st.style.top = (si / 21 * 100) + '%'
        ticks.appendChild(st)
      }
      rail.appendChild(ticks)
      var stream = el('div', 'side-stream')
      var track = el('div', 'side-track')
      track.textContent = 'TTY0 · 9600 8N1 · UTF-8 · LF · 13L · CMD\\LN · UPLINK LOCAL ONLY · SRC LOCAL CALC · ' +
        'TTY0 · 9600 8N1 · UTF-8 · LF · 13L · CMD\\LN · UPLINK LOCAL ONLY · SRC LOCAL CALC · '
      stream.appendChild(track)
      rail.appendChild(stream)
      var packets = []
      for (var sp = 0; sp < 2; sp++) {
        var pk = el('i', 'side-packet')
        rail.appendChild(pk)
        packets.push(pk)
      }
      hud.appendChild(rail)
      return { el: rail, track: track, packets: packets }
    }
    R.sideL = buildSideRail('l')
    R.sideR = buildSideRail('r')

    /* ══════════════════════════════════════════════════════════════════════
     * 0e. P4：core 的环以 ~7% 透明度在字标后方回归一次（8.6s 后淡出）
     * ════════════════════════════════════════════════════════════════════ */
    R.echo = el('div', 'echo')
    R.echoSvg = svgEl('svg', { viewBox: '0 0 800 800', class: 'echo-svg', 'aria-hidden': 'true' })
    /* 双色描边（暗底 + 亮线）：亮地球背景下 7% 白环几乎不可见，
       用"暗色外描 + 亮色内线"的雕刻线让环在亮/暗背景上都读得出来（有效透明度仍 ~7%）。 */
    function echoLayer(kind) {
      var g = svgEl('g', { class: 'echo-' + kind })
      g.appendChild(svgEl('path', { class: 'echo-cross echo-cross-' + kind, d: 'M400 120 V680 M120 400 H680' }))
      g.appendChild(svgEl('circle', { class: 'echo-ring echo-ring-' + kind, cx: 400, cy: 400, r: 200 }))
      g.appendChild(svgEl('circle', { class: 'echo-ring echo-ring-mid echo-ring-' + kind, cx: 400, cy: 400, r: 152 }))
      g.appendChild(svgEl('circle', { class: 'echo-ring echo-ring-in echo-ring-' + kind, cx: 400, cy: 400, r: 116 }))
      return g
    }
    R.echoSvg.appendChild(echoLayer('dark'))
    R.echoSvg.appendChild(echoLayer('light'))
    R.echoDash = svgEl('circle', { class: 'echo-dash', cx: 400, cy: 400, r: 222 })
    R.echoSvg.appendChild(R.echoDash)
    R.echo.appendChild(R.echoSvg)
    hud.appendChild(R.echo)


    /* ── 1. 边缘框 + P3 扫描条（P2 由四窗外滑展开） ──────────────────── */
    var edge = el('div', 'edge')
    R.edge = edge
    R.railT = el('i', 'edge-rail edge-rail-t')
    R.railB = el('i', 'edge-rail edge-rail-b')
    R.railL = el('i', 'edge-rail edge-rail-l')
    R.railR = el('i', 'edge-rail edge-rail-r')
    append(edge, R.railT, R.railB, R.railL, R.railR)
    for (var ei = 0; ei < 6; ei++) {
      var tickL = el('i', 'edge-tick edge-tick-l')
      tickL.style.top = (18 + ei * 16) + '%'
      edge.appendChild(tickL)
      var tickR = el('i', 'edge-tick edge-tick-r')
      tickR.style.top = (18 + ei * 16) + '%'
      edge.appendChild(tickR)
    }
    R.scan = el('i', 'scan')
    edge.appendChild(R.scan)
    hud.appendChild(edge)

    /* ── 2. 日轨条（顶部中央，当前时间刻度） ─────────────────────────── */
    var daybar = el('div', 'daybar')
    var dbLabel = el('span', 'daybar-label', 'DAY')
    var dbTrack = el('div', 'daybar-track')
    var dbFill = el('i', 'daybar-fill')
    var dbCaret = el('i', 'daybar-caret')
    var dbTicks = el('div', 'daybar-ticks')
    for (var dt = 0; dt <= 24; dt++) {
      var tick = el('i', 'daybar-tick')
      tick.style.left = (dt / 24 * 100) + '%'
      if (dt % 6 === 0) tick.classList.add('is-major')
      dbTicks.appendChild(tick)
    }
    append(dbTrack, dbTicks, dbFill, dbCaret)
    var dbPct = el('span', 'daybar-pct', 'DAY · 000.0%')
    var dbTime = el('span', 'daybar-time', '00:00')
    append(daybar, dbLabel, dbTrack, dbPct, dbTime)
    hud.appendChild(daybar)
    R.daybar = daybar
    R.dayFill = dbFill
    R.dayCaret = dbCaret
    R.dayPct = dbPct
    R.dayTime = dbTime

    /* ── 3. 四窗（左上活动日志 / 右上遥测 / 左下微图形 / 右下账本） ──── */
    function makeWindow(key, no, title) {
      var win = el('section', 'win win-' + key)
      var head = el('header', 'win-head')
      var n = el('span', 'win-no', no)
      var ttl = el('span', 'win-title', title)
      var grow = el('i', 'grow')
      var led = el('i', 'led')
      var btns = el('i', 'win-btns')
      append(head, n, ttl, grow, led, btns)
      var body = el('div', 'win-body')
      var foot = el('footer', 'win-foot')
      append(win, head, body, foot)
      hud.appendChild(win)
      return { el: win, head: head, body: body, foot: foot, led: led }
    }

    /* 3.1 01 ACTIVITY.LOG：终端开机日志流（打字机 + 光标 + 行号） */
    R.winTL = makeWindow('tl', '01', 'ACTIVITY.LOG')
    var log = el('div', 'log')
    R.log = log
    R.logLines = []
    R.winTL.body.appendChild(log)
    var logFoot = R.winTL.foot
    var logFootL = el('span', 'foot-l', 'TTY0 · 9600 8N1')
    var logFootM = el('span', 'foot-m', 'UTF-8 · LF')
    R.logCount = el('span', 'foot-r', '0L')
    append(logFoot, logFootL, logFootM, R.logCount)

    /* 3.2 02 TELEMETRY：雷达扫描环 + 月相 */
    R.winTR = makeWindow('tr', '02', 'TELEMETRY')
    var tel = el('div', 'tel')
    R.winTR.body.appendChild(tel)
    var radarWrap = el('div', 'radar')
    var radarSvg = svgEl('svg', { viewBox: '0 0 120 120', 'aria-hidden': 'true' })
    var radarRoot = svgEl('g', {})
    append(radarRoot,
      svgEl('circle', { class: 'radar-ring', cx: 60, cy: 60, r: 54 }),
      svgEl('circle', { class: 'radar-ring radar-ring-mid', cx: 60, cy: 60, r: 36 }),
      svgEl('circle', { class: 'radar-ring radar-ring-in', cx: 60, cy: 60, r: 18 }),
      svgEl('path', { class: 'radar-cross', d: 'M60 6 V114 M6 60 H114' })
    )
    var ticksG = svgEl('g', { class: 'radar-ticks' })
    for (var ri = 0; ri < 60; ri++) {
      var a = ri * 6
      var rad = a * Math.PI / 180
      var r1 = ri % 5 === 0 ? 54 : 51
      var tickEl = svgEl('line', {
        x1: 60 + r1 * Math.sin(rad), y1: 60 - r1 * Math.cos(rad),
        x2: 60 + 54 * Math.sin(rad), y2: 60 - 54 * Math.cos(rad),
        class: 'radar-tick'
      })
      if (ri % 5 === 0) tickEl.classList.add('is-major')
      ticksG.appendChild(tickEl)
    }
    radarRoot.appendChild(ticksG)
    R.contacts = []
    var CONTACTS = [[22, 40], [128, 30], [205, 44], [255, 38], [300, 22], [162, 47]]
    for (var ci = 0; ci < CONTACTS.length; ci++) {
      var ca = CONTACTS[ci][0] * Math.PI / 180, cr = CONTACTS[ci][1]
      var dot = svgEl('circle', {
        class: 'radar-contact', cx: (60 + cr * Math.sin(ca)).toFixed(1),
        cy: (60 - cr * Math.cos(ca)).toFixed(1), r: 1.7
      })
      dot.__vyAngle = CONTACTS[ci][0]
      radarRoot.appendChild(dot)
      R.contacts.push(dot)
    }
    var sweep = svgEl('g', { class: 'radar-sweep' })
    sweep.appendChild(svgEl('path', { class: 'radar-sweep-wedge', d: 'M60 60 L60 6 A54 54 0 0 1 74.1 8.3 Z' }))
    sweep.appendChild(svgEl('line', { class: 'radar-sweep-line', x1: 60, y1: 60, x2: 60, y2: 6 }))
    radarRoot.appendChild(sweep)
    radarRoot.appendChild(svgEl('circle', { class: 'radar-core', cx: 60, cy: 60, r: 1.8 }))
    radarSvg.appendChild(radarRoot)
    var cardN = svgEl('text', { class: 'radar-card', x: 60, y: 22, 'text-anchor': 'middle' }); cardN.textContent = '000'
    radarSvg.appendChild(cardN)
    var cardE = svgEl('text', { class: 'radar-card', x: 108, y: 64, 'text-anchor': 'middle' }); cardE.textContent = '090'
    radarSvg.appendChild(cardE)
    var cardS = svgEl('text', { class: 'radar-card', x: 60, y: 112, 'text-anchor': 'middle' }); cardS.textContent = '180'
    radarSvg.appendChild(cardS)
    append(radarWrap, radarSvg)
    R.radarSweep = sweep
    R.radarWrap = radarWrap
    var telRead = el('div', 'tel-read')
    function telRow(label, initial) {
      var row = el('div', 'tel-row')
      var k = el('span', 'tel-k', label)
      var v = el('span', 'tel-v', initial)
      append(row, k, v)
      telRead.appendChild(row)
      return v
    }
    R.telSweep = telRow('SWEEP', '000°')
    R.telContact = telRow('CONTACT', '00')
    R.telLink = telRow('LINK', 'LOCAL')
    telRead.appendChild(el('div', 'tel-rule'))
    R.telNote = el('div', 'tel-note', 'FIELD SCAN · LIVE')
    telRead.appendChild(R.telNote)
    append(tel, radarWrap, telRead)
    var moonWrap = el('div', 'moon')
    var moonSvg = svgEl('svg', { viewBox: '0 0 64 64', 'aria-hidden': 'true' })
    moonSvg.appendChild(svgEl('ellipse', { class: 'moon-orbit', cx: 32, cy: 32, rx: 27, ry: 9 }))
    R.moonMark = svgEl('circle', { class: 'moon-mark', cx: 59, cy: 32, r: 2 })
    moonSvg.appendChild(R.moonMark)
    moonSvg.appendChild(svgEl('circle', { class: 'moon-disc', cx: 32, cy: 32, r: 15 }))
    R.moonLit = svgEl('path', { class: 'moon-lit', d: '' })
    moonSvg.appendChild(R.moonLit)
    moonSvg.appendChild(svgEl('path', { class: 'moon-axis', d: 'M32 32 L59 32' }))
    var moonRead = el('div', 'moon-read')
    R.moonName = el('div', 'moon-name', 'LUNA')
    R.moonIllum = el('div', 'moon-row', 'ILLUM ---%')
    R.moonAge = el('div', 'moon-row', 'AGE --.- D')
    R.moonFull = el('div', 'moon-row', 'FULL IN -- D')
    append(moonRead, R.moonName, R.moonIllum, R.moonAge, R.moonFull)
    append(moonWrap, moonSvg, moonRead)
    R.winTR.body.appendChild(moonWrap)
    var telFootL = el('span', 'foot-l', 'SRC · LOCAL CALC')
    var telFootR = el('span', 'foot-r', 'LUNA · CMD\\LN')
    append(R.winTR.foot, telFootL, telFootR)

    /* 3.3 03 MICROGRAPHICS：schema / dither / kanji 三套微图形 */
    R.winBL = makeWindow('bl', '03', 'MICROGRAPHICS')
    var mg = el('div', 'mg')
    R.winBL.body.appendChild(mg)
    R.mg = mg
    R.plates = []
    var plateSpec = [
      { key: 'schema', cap: 'SCHEMA · 03' },
      { key: 'dither', cap: 'DITHER · 02' },
      { key: 'kanji', cap: 'KANJI · 04' }
    ]
    for (var pi = 0; pi < plateSpec.length; pi++) {
      var plate = el('div', 'plate')
      plate.setAttribute('data-plate', plateSpec[pi].key)
      if (plateSpec[pi].key === 'kanji') {
        var kj = el('div', 'kanji')
        var kjCol = el('div', 'kanji-col')
        var chars = ['デ', 'ー', 'タ', 'ル']
        for (var ki = 0; ki < chars.length; ki++) kjCol.appendChild(el('span', 'kanji-ch', chars[ki]))
        var kjMeta = el('div', 'kanji-meta')
        kjMeta.appendChild(el('span', 'kanji-label', 'データ'))
        kjMeta.appendChild(el('span', 'kanji-sub', 'DATA LINK'))
        var seal = el('span', 'kanji-seal', '完了')
        kjMeta.appendChild(seal)
        append(kj, kjCol, kjMeta)
        var scanBar = el('i', 'plate-scan')
        append(plate, kj, scanBar)
        R.kanjiScan = scanBar
        R.kanjiPlate = plate
      } else {
        var canvas = el('canvas', 'plate-canvas')
        canvas.width = 96
        canvas.height = 88
        plate.appendChild(canvas)
        R.plates.push({ key: plateSpec[pi].key, canvas: canvas, ctx: canvas.getContext('2d') })
      }
      var cap = el('span', 'plate-cap', plateSpec[pi].cap)
      plate.appendChild(cap)
      mg.appendChild(plate)
    }
    var mgFootL = el('span', 'foot-l', 'PRESET · GREY')
    var mgFootR = el('span', 'foot-r', 'MATERIAL A')
    append(R.winBL.foot, mgFootL, mgFootR)

    /* 3.4 04 SESSION.LEDGER：本次会话运行时长 + 启动时刻 + 7日小时格 */
    R.winBR = makeWindow('br', '04', 'SESSION.LEDGER')
    var ledger = el('div', 'ledger')
    R.winBR.body.appendChild(ledger)
    var ledgerHead = el('div', 'ledger-head')
    var lhL = el('span', 'ledger-head-l', 'SESSION')
    var lhR = el('span', 'ledger-head-r', 'T+00:00:00')
    append(ledgerHead, lhL, lhR)
    R.ledgerUptime = lhR
    var grid = el('div', 'ledger-grid')
    R.ledgerRows = []
    var nowBoot = new Date()
    for (var di = 6; di >= 0; di--) {
      var d = new Date(nowBoot)
      d.setDate(d.getDate() - di)
      var row = el('div', 'ledger-row')
      var day = el('span', 'ledger-day', DAYS3[d.getDay()])
      var cells = el('div', 'ledger-cells')
      var cellEls = []
      for (var hi = 0; hi < 24; hi++) {
        var cell = el('i', 'ledger-cell')
        cell.__vyHour = hi
        cells.appendChild(cell)
        cellEls.push(cell)
      }
      append(row, day, cells)
      grid.appendChild(row)
      R.ledgerRows.push({ day: DAYS3[d.getDay()], cells: cellEls, isToday: di === 0 })
    }
    ledger.appendChild(grid)
    R.ledgerGrid = grid
    var ledgerFoot = el('div', 'ledger-foot')
    R.ledgerBoot = el('span', 'ledger-boot', 'BOOT ' + bootClock)
    R.ledgerLocal = el('span', 'ledger-local', tzLabel(bootAt))
    append(ledgerFoot, R.ledgerBoot, R.ledgerLocal)
    append(ledger, ledgerHead)
    var brFootL = el('span', 'foot-l', '7 DAYS · 168 H')
    var brFootR = el('span', 'foot-r', 'RECORDING')
    append(R.winBR.foot, brFootL, brFootR)

    /* ── 4. SYNC 读数已在 0c 合并进底部控制带（R.sync = R.band），此处不再另建 ── */

    /* ── 5. 终帧排版（P4）：填进 index.html 的 #vyLockupMeta ────────── */
    var lockMeta = doc.getElementById('vyLockupMeta')
    var hasLockMeta = !!lockMeta
    if (!lockMeta) {
      /* 独立预览/宿主缺元素时的兜底容器：仍然只挂在 HUD 层里 */
      lockMeta = el('div', 'lockup')
      hud.appendChild(lockMeta)
    }
    lockMeta.classList.add('vy-hud-lockup')
    while (lockMeta.firstChild) lockMeta.removeChild(lockMeta.firstChild)
    /* 两行紧凑 meta（P4，design-spec §3）：① 月相 + 日期/时间 ② facts + SYNC。
       字号/行高按验收口径收紧（≤ clamp(8px,1.15vmin,12px)/1.5），单行 ellipsis，
       总高 ≤ 2 行，避免与 #vyLockup 的鱼标/字标叠字。 */
    var lock = el('div', 'lock')
    var lockRow1 = el('div', 'lock-row lock-row1')
    var lockMoon = el('span', 'lock-moon')
    var lockMoonSvg = svgEl('svg', { viewBox: '0 0 40 40', 'aria-hidden': 'true' })
    lockMoonSvg.appendChild(svgEl('circle', { class: 'lock-moon-ring', cx: 20, cy: 20, r: 16 }))
    lockMoonSvg.appendChild(svgEl('circle', { class: 'lock-moon-disc', cx: 20, cy: 20, r: 12 }))
    R.lockMoonLit = svgEl('path', { class: 'lock-moon-lit', d: '' })
    lockMoonSvg.appendChild(R.lockMoonLit)
    R.lockMoonName = el('span', 'lock-moon-name', 'WANING CRESCENT · 022%')
    append(lockMoon, lockMoonSvg, R.lockMoonName)
    var lockDate = el('span', 'lock-date')
    R.lockWD = el('span', 'lock-wd', 'TUESDAY')
    var sep1 = el('span', 'lock-sep', '/')
    R.lockDMY = el('span', 'lock-dmy', '03 NOV 2026')
    var sep2 = el('span', 'lock-sep', '/')
    R.lockClock = el('span', 'lock-clock', '-09:56-')
    append(lockDate, R.lockWD, sep1, R.lockDMY, sep2, R.lockClock)
    append(lockRow1, lockMoon, lockDate)
    var lockRow2 = el('div', 'lock-row lock-row2')
    R.factEls = []
    var FACT_KEYS = [
      ['PROFILE', 'profile'], ['MODEL', 'model'], ['WORKSPACE', 'workspace'],
      ['SANDBOX', 'sandbox'], ['SESSIONS', 'sessions']
    ]
    for (var fi = 0; fi < FACT_KEYS.length; fi++) {
      if (fi > 0) lockRow2.appendChild(el('span', 'lock-dot', '·'))
      var fact = el('span', 'lock-fact')
      var fk = el('b', 'lock-fact-k', FACT_KEYS[fi][0])
      var fv = el('i', 'lock-fact-v', '—')
      append(fact, fk, fv)
      lockRow2.appendChild(fact)
      R.factEls.push({ key: FACT_KEYS[fi][1], node: fv })
    }
    lockRow2.appendChild(el('span', 'lock-dot', '·'))
    var lockSync = el('span', 'lock-sync')
    lockSync.appendChild(el('b', 'lock-sync-k', 'SYNC'))
    lockSync.appendChild(el('i', 'lock-sync-v', '100%'))
    lockRow2.appendChild(lockSync)
    append(lock, lockRow1, lockRow2)
    lockMeta.appendChild(lock)
    R.lockMeta = lockMeta
    R.lock = lock

    /* ── 尺寸测量 / 画布 ─────────────────────────────────────────────── */
    function measurePlates() {
      for (var i = 0; i < R.plates.length; i++) {
        var p = R.plates[i]
        var dpr = Math.min(2, window.devicePixelRatio || 1)
        var rect = p.canvas.getBoundingClientRect()
        var cw = Math.max(40, Math.round(rect.width || 96))
        var ch = Math.max(40, Math.round(rect.height || 88))
        var bw = Math.round(cw * dpr), bh = Math.round(ch * dpr)
        if (p.canvas.width !== bw || p.canvas.height !== bh) {
          p.canvas.width = bw
          p.canvas.height = bh
        }
        p.w = cw
        p.h = ch
        p.dpr = dpr
        p.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }
    }

    function measureWindows() {
      var wins = [R.winTL, R.winTR, R.winBL, R.winBR]
      for (var i = 0; i < wins.length; i++) {
        var w = wins[i]
        var rect = w.el.getBoundingClientRect()
        w.w = rect.width || 300
        w.h = rect.height || 260
      }
    }

    function resize(w, h) {
      state.w = w || window.innerWidth || 1600
      state.h = h || window.innerHeight || 900
      try { measureWindows(); measurePlates() } catch (err) { /* 布局未完成时下次再量 */ }
      /* 改画布尺寸会清空位图；?t= 定格只画一帧，因此这里必须按当前 t 重绘。 */
      try { canvasTick(state.t) } catch (err) { /* noop */ }
    }

    /* ── 日志内容（来自 facts；打字机按 t 推进） ─────────────────────── */
    var LOG_START = 0.88
    var LOG_STAGGER = 0.112
    var LOG_CPS = 460

    function buildLogLines() {
      var f = state.facts
      var ws = shortPath(baseName(f.workspace) || f.workspace, 14)
      var sandbox = f.sandbox.length > 16 ? f.sandbox.slice(0, 15) + '…' : f.sandbox
      var lines = [
        { tag: 'SYS', text: 'DEEPSEEK HARNESS BOOT' },
        { tag: 'KRN', text: 'CMD\\LN CONSOLE V1.03' },
        { tag: 'PRF', text: 'PROFILE ' + f.profile },
        { tag: 'MDL', text: 'MODEL ' + f.model },
        { tag: 'WKS', text: 'WORKSPACE ' + ws },
        { tag: 'SBX', text: 'SANDBOX ' + sandbox },
        { tag: 'SES', text: 'SESSIONS ' + f.sessions + ' · BUNDLES ' + f.bundles },
        { tag: 'BLD', text: 'BUILD v' + f.version },
        { tag: 'RDR', text: 'RADAR SWEEP · LOCK' },
        { tag: 'MON', text: 'LUNA ' + state.moon.name },
        { tag: 'LDG', text: 'LEDGER T+00:00:00' },
        { tag: 'NET', text: 'UPLINK LOCAL ONLY' },
        { tag: 'END', text: 'ALL SYSTEMS NOMINAL' }
      ]
      /* 行文本超长会截断：保持在单窗口 1 行内 */
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].text.length > 30) lines[i].text = lines[i].text.slice(0, 29) + '…'
      }
      return lines
    }

    function rebuildLog() {
      var lines = buildLogLines()
      while (R.log.firstChild) R.log.removeChild(R.log.firstChild)
      R.logLines = []
      state.logChars = []
      for (var i = 0; i < lines.length; i++) {
        var row = el('div', 'log-line')
        row.setAttribute('data-i', String(i))
        var n = el('span', 'log-n', floorStr(i + 1, 4))
        var tm = el('span', 'log-t', bootClock)
        var cat = el('span', 'log-c', lines[i].tag)
        var obj = el('span', 'log-o')
        var txt = el('span', 'log-txt', '')
        var cur = el('i', 'cur')
        append(obj, txt, cur)
        append(row, n, tm, cat, obj)
        R.log.appendChild(row)
        R.logLines.push({ el: row, txt: txt, cur: cur, full: lines[i].text, base: lines[i] })
        state.logChars.push(0)
      }
    }

    /* ── 微图形 canvas 绘制（全部是 t 的纯函数） ─────────────────────── */
    function drawSchema(ctx, w, h, t) {
      ctx.clearRect(0, 0, w, h)
      var ink = 'rgba(232,233,234,0.72)'
      var faint = 'rgba(168,171,175,0.5)'
      ctx.lineWidth = 0.8
      ctx.strokeStyle = faint
      /* 取景角标 */
      var m = 5, c = 5
      ctx.beginPath()
      ctx.moveTo(m, m + c); ctx.lineTo(m, m); ctx.lineTo(m + c, m)
      ctx.moveTo(w - m - c, m); ctx.lineTo(w - m, m); ctx.lineTo(w - m, m + c)
      ctx.moveTo(m, h - m - c); ctx.lineTo(m, h - m); ctx.lineTo(m + c, h - m)
      ctx.moveTo(w - m - c, h - m); ctx.lineTo(w - m, h - m); ctx.lineTo(w - m, h - m - c)
      ctx.stroke()
      /* 中央机械环 */
      var cx = w * 0.5, cy = h * 0.47, r = Math.min(w, h) * 0.21
      ctx.strokeStyle = ink
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2); ctx.stroke()
      /* 转动指针 */
      var a = t * 0.85
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92)
      ctx.lineTo(cx + Math.cos(a) * r * 0.2, cy + Math.sin(a) * r * 0.2)
      ctx.stroke()
      ctx.fillStyle = ink
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92, 1.4, 0, Math.PI * 2); ctx.fill()
      /* 环上节点 + 连线 */
      var NA = [0.6, 2.2, 3.9, 5.1]
      for (var i = 0; i < NA.length; i++) {
        var na = NA[i] + Math.PI * 0.02 * Math.sin(t * 0.6 + i)
        var nx = cx + Math.cos(na) * r, ny = cy + Math.sin(na) * r
        ctx.strokeStyle = faint
        ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(cx + (nx - cx) * 0.56, cy + (ny - cy) * 0.56); ctx.stroke()
        ctx.strokeStyle = ink
        ctx.strokeRect(nx - 2.2, ny - 2.2, 4.4, 4.4)
      }
      /* 尺寸线 */
      var dy = h - 14
      ctx.strokeStyle = faint
      ctx.beginPath()
      ctx.moveTo(w * 0.14, dy); ctx.lineTo(w * 0.86, dy)
      ctx.moveTo(w * 0.14, dy - 3); ctx.lineTo(w * 0.14, dy + 3)
      ctx.moveTo(w * 0.86, dy - 3); ctx.lineTo(w * 0.86, dy + 3)
      ctx.stroke()
      ctx.fillStyle = 'rgba(232,233,234,0.5)'
      for (var k = 0; k < 7; k++) ctx.fillRect(w * 0.14 + (k + 0.5) * (w * 0.72 / 7), dy - 1, 1, 2)
      /* 垂直扫描线 */
      var sy = (t * 26) % (h + 20) - 10
      ctx.fillStyle = 'rgba(232,233,234,0.16)'
      ctx.fillRect(4, sy, w - 8, 1)
    }

    var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

    function drawDither(ctx, w, h, t) {
      ctx.clearRect(0, 0, w, h)
      var cols = 11, rows = 9
      var pad = 6
      var cw = (w - pad * 2) / cols, chh = (h - pad * 2 - 12) / rows
      var cell = Math.min(cw, chh)
      var ox = (w - cell * cols) / 2
      var oy = (h - 12 - cell * rows) / 2
      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
          var u = x / (cols - 1), v = y / (rows - 1)
          var wave = 0.5 + 0.34 * Math.sin(u * 5.2 + t * 1.6) * Math.cos(v * 4.1 - t * 1.15)
            + 0.16 * Math.sin((u + v) * 4.4 + t * 0.9)
          var thr = (BAYER[(y % 4) * 4 + (x % 4)] + 0.5) / 16
          var lit = wave - (thr - 0.5) * 0.62
          if (lit <= 0.12) continue
          var r = cell * (0.09 + 0.28 * clamp01(lit))
          ctx.fillStyle = 'rgba(232,233,234,' + (0.22 + 0.68 * clamp01(lit)).toFixed(3) + ')'
          ctx.beginPath()
          ctx.arc(ox + x * cell + cell / 2, oy + y * cell + cell / 2, r, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      /* 权重阶梯（line ramp） */
      var rampY = h - 9
      ctx.fillStyle = 'rgba(232,233,234,0.5)'
      for (var i = 0; i < 10; i++) {
        var wgt = 0.5 + i * 0.5
        ctx.fillRect(6 + i * 6, rampY - wgt, 4, wgt)
      }
      ctx.fillStyle = 'rgba(168,171,175,0.55)'
      ctx.fillRect(w - 26, rampY - 12, 20, 1)
    }

    function canvasTick(t) {
      for (var i = 0; i < R.plates.length; i++) {
        var p = R.plates[i]
        if (!p.w) continue
        if (p.key === 'schema') drawSchema(p.ctx, p.w, p.h, t)
        else if (p.key === 'dither') drawDither(p.ctx, p.w, p.h, t)
      }
    }

    /* ── 账本 / 日轨 / 时钟（真实本地时间） ─────────────────────────── */
    function renderLedger(now) {
      var hour = now.getHours(), day = now.getDate()
      var uptime = Math.max(0, Math.floor((Date.now() - bootAt.getTime()) / 1000))
      if (uptime !== state.lastUptime) {
        state.lastUptime = uptime
        text(R.ledgerUptime, 'T+' + floorStr(Math.floor(uptime / 3600) % 100, 2) + ':' + pad2(Math.floor(uptime / 60) % 60) + ':' + pad2(uptime % 60))
      }
      if (state.ledgerHour !== hour || state.ledgerDay !== day) {
        state.ledgerHour = hour
        state.ledgerDay = day
        for (var r = 0; r < R.ledgerRows.length; r++) {
          var row = R.ledgerRows[r]
          for (var c = 0; c < row.cells.length; c++) {
            var cell = row.cells[c]
            var on = false, current = false
            if (row.isToday) {
              if (c < hour) on = true
              else if (c === hour) current = true
            }
            cell.classList.toggle('is-on', on)
            cell.classList.toggle('is-now', current)
          }
        }
      }
    }

    function renderDaybar(now) {
      var minutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60
      var pct = minutes / 1440
      var pctLabel = (pct * 100).toFixed(1)
      if (state.dayPct !== pctLabel) {
        state.dayPct = pctLabel
        text(R.dayPct, 'DAY · ' + (pct * 100).toFixed(1).padStart(5, '0') + '%')
      }
      cssVar(R.dayFill, '--vy-day', pct.toFixed(4))
      cssVar(R.dayCaret, '--vy-day', pct.toFixed(4))
      if (state.dayTime !== hhmm(now)) {
        state.dayTime = hhmm(now)
        text(R.dayTime, hhmm(now))
      }
    }

    function renderMoonLabels() {
      var m = state.moon
      text(R.moonName, 'LUNA · ' + m.name)
      text(R.moonIllum, 'ILLUM ' + floorStr(Math.round(m.illum * 100), 3) + '%')
      text(R.moonAge, 'AGE ' + m.age.toFixed(1).padStart(4, '0') + ' D')
      text(R.moonFull, m.fullIn < 1 ? 'FULL TODAY' : 'FULL IN ' + floorStr(Math.round(m.fullIn), 2) + ' D')
      var lit = moonPath(32, 32, 15, m.phase)
      R.moonLit.setAttribute('d', lit)
      var a = -2 * Math.PI * m.phase
      R.moonMark.setAttribute('cx', (32 + 27 * Math.cos(a)).toFixed(1))
      R.moonMark.setAttribute('cy', (32 + 9 * Math.sin(a)).toFixed(1))
      /* 终帧月盘 */
      R.lockMoonLit.setAttribute('d', moonPath(20, 20, 12, m.phase))
      text(R.lockMoonName, m.name + ' · ' + floorStr(Math.round(m.illum * 100), 3) + '%')
      /* P1 轨道上的月相标记（椭圆 rx310/ry150，整体 -16°；用真实相位角） */
      if (R.coreMoon) {
        var ma = -2 * Math.PI * m.phase
        var omx = 310 * Math.cos(ma), omy = 150 * Math.sin(ma)
        var orot = -16 * Math.PI / 180
        var crx = 400 + omx * Math.cos(orot) - omy * Math.sin(orot)
        var cry = 400 + omx * Math.sin(orot) + omy * Math.cos(orot)
        R.coreMoon.setAttribute('cx', crx.toFixed(1))
        R.coreMoon.setAttribute('cy', cry.toFixed(1))
      }
    }

    function renderLockupClock(now) {
      var st = DAYS[now.getDay()] + '|' + pad2(now.getDate()) + ' ' + MONTHS[now.getMonth()] + ' ' + now.getFullYear() + '|' + hhmm(now)
      if (state.lockStamp === st) return
      state.lockStamp = st
      text(R.lockWD, DAYS[now.getDay()])
      text(R.lockDMY, pad2(now.getDate()) + ' ' + MONTHS[now.getMonth()] + ' ' + now.getFullYear())
      text(R.lockClock, '-' + hhmm(now) + '-')
    }

    function renderFacts() {
      var f = state.facts
      for (var i = 0; i < R.factEls.length; i++) {
        var key = R.factEls[i].key
        var v = f[key]
        if (key === 'workspace') v = shortPath(baseName(v) || v, 16)
        text(R.factEls[i].node, v || '—')
      }
    }

    /* ── setFacts：真实 DSH facts 注入（宿主或离线预览） ─────────────── */
    function setFacts(facts) {
      if (state.disposed) return
      state.factsRaw = facts || null
      state.facts = normaliseFacts(facts)
      rebuildLog()
      renderFacts()
      if (state.t >= 0.65) updateLog(state.t)
    }

    /* ── 打字机：第 i 行在 LOG_START + i*LOG_STAGGER 开始，逐字符展开 ── */
    function updateLog(t) {
      var started = 0
      var cursorLine = -1
      for (var i = 0; i < R.logLines.length; i++) {
        var line = R.logLines[i]
        var start = LOG_START + i * LOG_STAGGER
        if (t < start) break
        started = i + 1
        var chars = Math.min(line.full.length, Math.floor((t - start) * LOG_CPS))
        if (chars > state.logChars[i] || state.logChars[i] === 0) {
          state.logChars[i] = chars
          text(line.txt, line.full.slice(0, chars))
        }
        if (chars < line.full.length) cursorLine = i
        line.el.classList.add('is-on')
      }
      if (cursorLine < 0 && started > 0) cursorLine = started - 1
      for (var j = 0; j < R.logLines.length; j++) {
        var cur = R.logLines[j].cur
        var show = j === cursorLine
        if (show) {
          cur.classList.add('is-on')
          op(cur, Math.floor(t * 2.4) % 2 === 0 ? 1 : 0.12)
        } else {
          cur.classList.remove('is-on')
          op(cur, 0)
        }
      }
      if (state.logStarted !== started) {
        state.logStarted = started
        text(R.logCount, started + 'L')
      }
    }

    /* ── 每帧主渲染 ─────────────────────────────────────────────────── */
    function update(t, ctx) {
      if (state.disposed) return
      t = clamp(t, 0, TOTAL + 0.6)
      state.t = t
      if (ctx && ctx.facts && ctx.facts !== state.factsRaw) setFacts(ctx.facts)
      var phase = ctx && ctx.phase ? ctx.phase : phaseAt(t).key
      if (phase !== state.phase) {
        state.phase = phase
        hud.setAttribute('data-phase', phase)
      }
      var now = new Date()
      var minute = Math.floor(now.getTime() / 60000)
      var newMinute = minute !== state.lastMinute
      if (newMinute) {
        state.lastMinute = minute
        state.moon = moonState(now.getTime())
        renderMoonLabels()
      }
      renderLedger(now)
      renderDaybar(now)
      renderFacts()
      renderLockupClock(now)
      if (reduced) { renderReduced(t); return }

      /* 相位进度 */
      var pGrid = smooth(progress(t, 0.62, 1.02)) * (1 - smooth(progress(t, 3.10, 3.72)))
      var pEdge = smooth(progress(t, 3.42, 4.46))
      var pOut = smooth(progress(t, 3.10, 4.34))
      var outFade = 1 - smooth(progress(t, 3.34, 4.16))
      var pDay = smooth(progress(t, 1.22, 1.84)) * (1 - smooth(progress(t, 3.02, 3.52)))
      var pSync = smooth(progress(t, 0.96, 1.42)) * (1 - smooth(progress(t, 3.02, 3.56)))
      var pLock = smooth(progress(t, 7.62, 8.58))

      /* 网格 */
      op(R.grid, pGrid * 0.9)

      /* P1 中央 ORBIT CORE / 底部控制带 / 两侧遥测 / P4 环回归 */
      updateOrbit(t, pSync)

      /* 边缘框：四窗滑出时由四角“展开”成整屏细框 */
      op(R.edge, pEdge)
      cssVar(R.railT, '--vy-edge', pEdge.toFixed(3))
      cssVar(R.railB, '--vy-edge', pEdge.toFixed(3))
      cssVar(R.railL, '--vy-edge', pEdge.toFixed(3))
      cssVar(R.railR, '--vy-edge', pEdge.toFixed(3))

      /* 四窗：推入（P1）→ 外滑（P2） */
      var winDef = [
        { ref: R.winTL, inAt: 0.78, inX: -34, inY: -18, outX: -1, outY: 0 },
        { ref: R.winTR, inAt: 1.02, inX: 34, inY: -18, outX: 1, outY: 0 },
        { ref: R.winBL, inAt: 1.28, inX: -34, inY: 18, outX: -1, outY: 1 },
        { ref: R.winBR, inAt: 1.52, inX: 34, inY: 18, outX: 1, outY: 1 }
      ]
      for (var wi = 0; wi < winDef.length; wi++) {
        var wd = winDef[wi]
        var win = wd.ref
        var pIn = smooth(progress(t, wd.inAt, wd.inAt + 0.42))
        var inOffX = wd.inX * (1 - pIn)
        var inOffY = wd.inY * (1 - pIn)
        var outOffX = wd.outX * pOut * (win.w + 60)
        var outOffY = wd.outY * pOut * (win.h + 90)
        tf(win.el, 'translate3d(' + (inOffX + outOffX).toFixed(1) + 'px,' + (inOffY + outOffY).toFixed(1) + 'px,0)')
        op(win.el, pIn * outFade)
        if (pIn > 0.05) win.el.classList.add('is-on')
        else win.el.classList.remove('is-on')
      }

      /* 日轨条 / SYNC */
      op(R.daybar, pDay * 0.95)
      renderSync(t, pSync)
      updateLog(t)
      updateRadar(t)
      updateKanji(t)
      if (R.winBL.el.classList.contains('is-on') && outFade > 0.02) canvasTick(t)

      /* 边缘扫描条（P3）：两次掠过（vw 单位，跨整屏） */
      if (t >= 5.20 && t < 7.55) {
        var sweepP = progress(t, 5.30, 7.35)
        var pass = (sweepP * 2.35) % 1
        var xVw = -26 + pass * 156
        tf(R.scan, 'translate3d(' + xVw.toFixed(2) + 'vw,0,0)')
        op(R.scan, Math.sin(Math.PI * sweepP) * 0.85)
      } else {
        op(R.scan, 0)
      }

      /* 终帧排版（P4）：#vyLockupMeta 的淡入/位移由 splash.css 的
         .vy-lockup.is-on 统一管；独立预览缺该元素时退回 hud 自己的 pLock 渐入。 */
      if (hasLockMeta) {
        op(R.lock, 1)
        tf(R.lock, 'translate3d(0,0,0)')
      } else {
        op(R.lock, pLock)
        tf(R.lock, 'translate3d(0,' + ((1 - pLock) * 12).toFixed(2) + 'px,0)')
      }
    }

    /* ── P1 中央 ORBIT CORE / 底部控制带 / 两侧遥测 / P4 环回归 ────────
     * 纯 t 函数：P1 0.95–1.45 环系淡入、1.08–1.68 鱼标点亮（Lead 的 P0 信号层
     * 0.66–0.94 完全退场之后，从同一圆心长出来，避免双鱼标重影）、
     * P2 3.05–3.60 充能（环加速 / 鱼标增亮 / 进度 100%）、3.10–4.20 放大 1.35× 淡出。 */
    function updateOrbit(t, pUi) {
      var pIn = smooth(progress(t, 0.95, 1.45))
      var pFade = 1 - smooth(progress(t, 3.26, 4.16))
      var charge = smooth(progress(t, 3.05, 3.60))
      var scale = 1 + 0.35 * easeInOutCubic(progress(t, 3.10, 4.20))
      op(R.core, pIn * pFade)
      tf(R.core, 'translate3d(-50%,-50%,0) scale(' + scale.toFixed(3) + ')')
      if (pIn > 0.001) {
        /* 鱼标呼吸光 + P2 充能增亮 */
        var glow = 0.30 + 0.28 * (0.5 + 0.5 * Math.sin(t * 1.85)) + 0.55 * charge
        cssVar(R.core, '--vy-glow', glow.toFixed(3))
        cssVar(R.core, '--vy-charge', charge.toFixed(3))
        /* 扫掠 8s/圈；充能时额外加速（累计 +900°），虚线环同步加速 */
        var sweepDeg = (t / 8) * 360 + charge * 900
        tf(R.coreSweep, 'rotate(' + ((sweepDeg % 360)).toFixed(2) + 'deg)')
        tf(R.coreDashOut, 'rotate(' + (t * 7 + charge * 540).toFixed(1) + 'deg)')
        tf(R.coreDashIn, 'rotate(' + (-t * 11 - charge * 720).toFixed(1) + 'deg)')
        var sweepMod = ((sweepDeg % 360) + 360) % 360
        for (var oi = 0; oi < R.coreContacts.length; oi++) {
          var oc = R.coreContacts[oi]
          var odist = Math.abs(((sweepMod - oc.__vyAngle + 540) % 360) - 180)
          var ohit = clamp01(1 - odist / 46)
          var obl = 0.5 + 0.5 * Math.sin(t * 2.2 + oi * 2.1)
          op(oc, 0.14 + 0.5 * obl + 0.36 * ohit)
        }
        if (state.coreSweepDeg !== Math.round(sweepMod)) state.coreSweepDeg = Math.round(sweepMod)
        /* 两侧竖向遥测：低对比、缓慢上移（52s 一轮） */
        var railVis = pUi
        op(R.sideL.el, railVis)
        op(R.sideR.el, railVis)
        if (railVis > 0.01) {
          var railOff = ((t / 52) % 1) * 50
          tf(R.sideL.track, 'translate3d(0,' + (-railOff).toFixed(2) + '%,0)')
          tf(R.sideR.track, 'translate3d(0,' + (-railOff).toFixed(2) + '%,0)')
          for (var rp = 0; rp < 2; rp++) {
            var rlp = R.sideL.packets[rp], rrp = R.sideR.packets[rp]
            var rlpct = (((t * 0.045) + rp * 0.47) % 1) * 100
            if (rlp) { rlp.style.top = rlpct.toFixed(2) + '%' }
            if (rrp) { rrp.style.top = rlpct.toFixed(2) + '%' }
          }
          updateSpectrum(t)
        }
      }
      /* 核心鱼标 / 字标：1.08–1.68 点亮 */
      op(R.coreCenter, smooth(progress(t, 1.08, 1.68)) * pFade)
      /* P2 舷窗打开后地球亮部顶到容器后面时的暗色镜片（只在充能段出现） */
      cssVar(R.coreCenter, '--vy-veil', smooth(progress(t, 2.92, 3.28)).toFixed(3))
      /* 底部控制带显隐由 renderSync(pSync) 统一驱动 */
      /* P4：环以 ~7% 透明度在字标后方回归一次，8.6 后淡出 */
      var pEcho = smooth(progress(t, 7.28, 7.98)) * (1 - smooth(progress(t, 8.58, 8.95)))
      op(R.echo, 0.075 * pEcho)
      if (pEcho > 0.001) {
        tf(R.echoDash, 'rotate(' + (t * 5).toFixed(1) + 'deg)')
        tf(R.echoSvg, 'scale(' + (1.10 - 0.10 * smooth(progress(t, 7.28, 7.98))).toFixed(3) + ')')
      }
    }

    /* 频谱条：确定性函数（L/R 错相），24fps 更新即可（?t= 定格时只更新一次）。 */
    function spectrumAt(i, t, ch) {
      var u = i / 31
      var tilt = Math.pow(1 - u, 1.5)
      var base = 0.18 + 0.62 * tilt * (0.58 + 0.42 * Math.sin(t * 2.05 - u * 7.4 + ch * 1.9))
      var beat = 0.20 * Math.pow(Math.max(0, Math.sin(t * 3.1 + i * 0.42 + ch * 2.1)), 8)
      var hiss = 0.10 * Math.sin(t * 5.9 + i * 1.37 + ch * 0.7)
      return clamp01(base + beat + hiss)
    }
    function updateSpectrum(t) {
      var tick = Math.round(t * 24)
      if (tick === state.spectrumTick) return
      state.spectrumTick = tick
      var tt = tick / 24
      var peak = 0
      for (var i = 0; i < R.bars.length; i++) {
        var ch = i < 32 ? 0 : 1
        var v = spectrumAt(i % 32, tt, ch)
        if (v > peak) peak = v
        tf(R.bars[i], 'scaleY(' + (0.12 + 0.88 * v).toFixed(3) + ')')
      }
      text(R.bandPeak, 'PEAK ' + peak.toFixed(2))
    }

    function renderSync(t, vis) {
      var syncP = clamp01((t - 1.0) / 1.95)
      cssVar(R.sync, '--vy-sync', String(syncP))
      cssVar(R.core, '--vy-sync', syncP.toFixed(4))
      var pct = Math.round(100 * easeInOutCubic(progress(t, 1.0, 2.95)))
      if (pct !== state.syncPct) {
        state.syncPct = pct
        text(R.syncVal, floorStr(pct, 3) + '%')
      }
      text(R.coreSigVal, syncP.toFixed(2))
      cssVar(R.syncFill, '--vy-sync', (pct / 100).toFixed(4))
      /* 控制带底部坐标：慢速漂移，定格可复现 */
      var ct = Math.round(t * 8)
      if (ct !== state.coordsTick) {
        state.coordsTick = ct
        text(R.coords, 'X ' + floorStr(Math.floor((t * 37) % 10000), 4) +
          ' · Y ' + floorStr(Math.floor((t * 23) % 10000), 4) + ' · CMD\\LN')
      }
      op(R.sync, vis)
    }

    function updateRadar(t) {
      var deg = (t * 66) % 360
      var rounded = Math.round(deg)
      if (rounded !== state.radarDeg) {
        state.radarDeg = rounded
        cssVar(R.radarWrap, '--vy-radar-a', deg.toFixed(2) + 'deg')
        text(R.telSweep, floorStr(rounded % 360, 3) + '°')
        var lit = 0
        for (var i = 0; i < R.contacts.length; i++) {
          var ca = R.contacts[i].__vyAngle
          var d = Math.abs(((deg - ca) % 360 + 540) % 360 - 180)
          var hi = clamp01(1 - d / 34)
          var pulse = 0.28 + 0.52 * hi
          op(R.contacts[i], pulse)
          if (hi > 0.25) lit++
        }
        text(R.telContact, floorStr(lit, 2))
      }
    }

    function updateKanji(t) {
      if (!R.kanjiScan) return
      var y = (t * 34) % 120 - 10
      tf(R.kanjiScan, 'translate3d(0,' + y.toFixed(2) + '%,0)')
      op(R.kanjiScan, 0.55)
    }

    /* ── reduced：静态终帧（不播动画；日期/时间仍是真实本地时间） ─────── */
    function renderReduced(t) {
      if (!state.reducedDone) {
        state.reducedDone = true
        op(R.grid, 0)
        op(R.daybar, 0)
        op(R.sync, 0)
        op(R.scan, 0)
        op(R.core, 0)
        op(R.coreCenter, 0)
        op(R.sideL.el, 0)
        op(R.sideR.el, 0)
        op(R.echo, 0)
        op(R.edge, 0.55)
        cssVar(R.railT, '--vy-edge', '1')
        cssVar(R.railB, '--vy-edge', '1')
        cssVar(R.railL, '--vy-edge', '1')
        cssVar(R.railR, '--vy-edge', '1')
        var wins = [R.winTL, R.winTR, R.winBL, R.winBR]
        for (var i = 0; i < wins.length; i++) op(wins[i].el, 0)
        op(R.lock, 1)
        tf(R.lock, 'translate3d(0,0,0)')
        R.lockMeta.classList.add('is-on')
        renderMoonLabels()
        renderFacts()
      }
      renderLockupClock(new Date())
    }

    /* ── 生命周期 ───────────────────────────────────────────────────── */
    function dispose() {
      if (state.disposed) return
      state.disposed = true
      if (hud.parentNode) hud.parentNode.removeChild(hud)
      if (R.lockMeta) {
        R.lockMeta.classList.remove('vy-hud-lockup')
        while (R.lockMeta.firstChild) R.lockMeta.removeChild(R.lockMeta.firstChild)
      }
    }

    /* 初始：建日志、量尺寸、填月相/facts */
    rebuildLog()
    renderFacts()
    renderMoonLabels()
    resize(window.innerWidth || 1600, window.innerHeight || 900)
    if (reduced) renderReduced(0.35)

    return {
      ready: Promise.resolve(),
      update: update,
      resize: resize,
      dispose: dispose,
      setFacts: setFacts
    }
  }

  window.VYRON_HUD = { create: create }
})()
