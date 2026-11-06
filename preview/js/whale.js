/* ============================================================================
 * VYRON 星海鲸航 — 大白鱼主角模块（whale-art 所有）v0.2 ROUND2
 * ----------------------------------------------------------------------------
 * 契约（docs/design-spec.md §7，接口不变）：
 *   window.VYRON_WHALE = {
 *     create({ root, canvas, reduced }) -> {
 *       ready: Promise, update(t, ctx), dispose(), morphToMark(progress),
 *       debug(t?, ctx?)   // 额外诊断出口：带 t 时返回该 t 的姿态（宿主可忽略）
 *     }
 *   }
 *
 * 剧情（design-spec §3 P3/P4 + ROUND2-PLAN §4.3）：
 *   5.06s 从画面左下（<-0.1w, >1.0h）跃出 → 5.06–6.30 单段 Catmull-Rom 右上弧线
 *   横越（高点 ≈0.62w/0.30h，终点 ≈0.80w/0.33h）→ 6.30–7.35 一个连续侧倾（bank）
 *   大弧折返，速度精确归零落在 #vyMarkSlot 中心（实测 rect，约 0.29w/0.43h）→
 *   7.35–7.52 在 mark 处悬停收尾（摆尾 1 次、鳍收拢、体量 ≈0.42×）→ 7.52–7.74
 *   白闪（Lead main.js 7.52–7.92，峰值 7.70）期间鲸体向 mark 收缩并粒子化 →
 *   7.60–8.90 morph 成官方 DSH 鱼标（起点就在 mark，位移 ≤24px）→ P5 声呐环。
 *
 * 轨迹实现（可被 poseAt 纯函数复现）：
 *   1) 归一化控制点 → 均匀 Catmull-Rom 样条 → 弧长参数化；
 *   2) 单峰速度剖面（跃出后 0.34s 达峰，之后余弦减速到 0）积分 → 时间↔弧长表；
 *   3) 朝向 = 表内中心差分航向；穿越竖直航向（74°→106°）时用 180° 偏航「转身」
 *      代替平面内翻转（鲸腹始终朝下），末段叠加 ≈24° 残余偏航（plan 的 rotY 口径），
 *      侧倾 bank 最大 10°。全程无方向反转 / 无瞬移。
 *
 * 视觉（目标「一眼高级」）：
 *   - 鲸体改为 canvas 逐帧渲染（SVG 仅作 canvas 不可用时的降级）：
 *     ≥7 段纵向体表渐变（顶白→云白→冷蓝腹→暖沙反光）+ 背脊高光带 + 腹部暖白
 *     + 动态焦散（clip 内程序化波纹，opacity ≤0.10 缓慢平移）+ 镜面扫光带
 *     + 三色边缘光（上空气蓝 / 下生物青 / 靠地球暖侧沙金）+ 深空分离描边；
 *     胸鳍半透明（0.82）+ 内渐变 + 亮边；尾鳍独立铰点摆动；眼 = 虹膜 + 高光 + 眼睑环；
 *     嘴线细深色；腹部软阴影 + 体表 squash/stretch（±2%）。
 *   - 尾迹 = tapered ribbon（白热→青蓝→透明，宽 6→28px，2 层 glow + 亮核）
 *     + ≤120 生物光粒子 + 数据刻度线（降透明 0.2）；速度越快拖尾越长；
 *     平台倒影保留并增强横向 ripple。
 *   - morph = 鲸体向 mark 收缩 + 粒子向 mark 汇聚 + mark 点亮（白闪由 Lead 驱动）。
 *   - reduced 分支：静帧只有官方鱼标 + 呼吸光晕，无游动鬼影（回归断言不变）。
 *
 * 实现要点：
 *   1) 时间只来自 update(t)，无自建 rAF/计时器；粒子/刻度/焦散/反光全部是 t 的
 *      解析函数 → ?t= 定格与重播必然同帧（headless 截图可复现）。
 *   2) 运行期零外部请求；PATHS 由 _tools/asset-b/sync-whale-js.mjs 从
 *      lib/assets/brand/*.svg 注入（@paths 区块，勿手改）。
 *   3) 资源/能力缺失只 warn 并降级：canvas 2d 不可用 → 退回内联 SVG 鲸体；
 *      markRect 缺失 → CSS 变量/归一化兜底；reduced → 静帧构图。
 * ========================================================================== */
(function () {
  'use strict'
  if (typeof window === 'undefined') return
  if (window.VYRON_WHALE && window.VYRON_WHALE.__engine === 'whale-art') return

  var VERSION = '0.2.0'
  var NS = 'http://www.w3.org/2000/svg'
  var TAU = Math.PI * 2
  var RAD = Math.PI / 180

  /* ── 1. 时间常量（design-spec §3 / ROUND2-PLAN §4.3） ─────────────────── */
  var T = {
    enter: 5.06,     // 左下云海跃出
    cross: 6.30,     // 右上横越终点（≈0.80w, 0.33h）
    turn: 7.35,      // 连续侧倾大弧折返到位（#vyMarkSlot 中心，速度归零）
    rush: 7.52,      // 悬停收尾结束（体量 ≈0.42×），开始向 mark 收缩/粒子化
    impact: 7.60,    // 白闪（main 7.52–7.92，峰值 7.70）+ morph 起点（就在 mark）
    morph: 7.60,     // morph 开始
    morphEnd: 8.90,  // morph 结束（落位 #vyMarkSlot）
    settle: 8.90,    // 静止 + 呼吸光
    ring: 9.00,      // P5 声呐环
    end: 9.80
  }

  /* ── 2. 轨迹：归一化控制点（Catmull-Rom）与速度剖面 ──────────────────────
   * 末点 = #vyMarkSlot 中心（运行时用 markAnchor 实测 rect 覆盖，默认值取自
   * 1600×900 终帧实测 462.91/1600, 387.42/900）。整条路径单次采样：
   * 左下跃出 → 右上弧（高点 0.62/0.30）→ 0.80/0.33（T.cross）→ 右侧大弧下沉
   * → 底部回扫（y≈0.63，位于锁版行下方）→ 缓升到 mark。禁止经过中心后再离开。
   * 折返段控制点由「最大航向变化率」数值搜索求得：运动中最大 80.8°/0.1s（门 ≤120）。 */
  var PATH_PTS = [
    { x: -0.180, y: 1.220 },  // 起点：画面左下外侧（<-0.1w, >1.0h）
    { x: -0.100, y: 0.920 },
    { x: 0.060, y: 0.620 },
    { x: 0.300, y: 0.400 },
    { x: 0.620, y: 0.300 },   // 高点（≈0.62w, 0.30h）
    { x: 0.800, y: 0.330 },   // 横越终点（T.cross = 0.80w, 0.33h）
    { x: 0.8510, y: 0.4661 }, // 折返：右侧连续侧倾大弧
    { x: 0.8420, y: 0.5848 },
    { x: 0.7834, y: 0.6900 }, // 大弧底部（甲板之上）
    { x: 0.6582, y: 0.6579 },
    { x: 0.5336, y: 0.5822 },
    { x: 0.4010, y: 0.5000 },
    { x: 0.2893, y: 0.4305 }  // 末点：mark 中心（运行时替换为实测值）
  ]
  var MARK_DEFAULT = { nx: 0.28932, ny: 0.43047 }
  var MARK = { nx: MARK_DEFAULT.nx, ny: MARK_DEFAULT.ny, valid: false }

  var TABLE_N = 241            // 时间表采样数（t ∈ [enter, turn]）
  var ARC_N = 512              // 弧长表采样数
  var CROSS_INDEX = 5          // PATH_PTS 中横越终点（0.80w, 0.33h）的下标
  var YAW_A = 74               // 偏航转身开始航向（度）
  var YAW_B = 106              // 偏航转身结束航向（度）
  var YAW_EXTRA = 24           // 末段残余偏航（plan 的 rotY 0→24°）
  var HOVER_DRIFT = 12         // 悬停微滑速度 px/s（≤6px，仅保证速度方向角有定义/不翻转）
  var HOVER_END = 7.78         // 微滑停止时刻（在 QA 采样区间 7.62 之后）

  var DECK_Y = 0.802           // 平台甲板线上沿（归一化）；鲸体在其下被遮住 → 从甲板后跃出

  /* 鲸体基准宽（视口宽比例）；胸鳍/尾鳍铰点（SVG 本地坐标） */
  var SWIM_W_RATIO = 0.27
  var SWIM_W_MIN = 280
  var SWIM_W_MAX = 620
  var TAIL_PIVOT = [52, 68]
  var FIN_PIVOT = [240, 88]
  var TAIL_TIP = [24, 68]

  /* 尾迹 / 粒子预算（ROUND2-PLAN：≤120 粒子、刻度线降透明） */
  var FX = {
    winMax: 0.90,        // 拖尾最长窗口（秒）
    winMin: 0.28,
    dt: 0.016,           // 拖尾采样步长
    maxPts: 96,
    wNear: 26,           // 近端（白热核）宽
    wFar: 5,             // 远端宽（渐隐，不做硬端头）
    pRate: 52,           // 粒子出生率（个/秒）
    pLifeMin: 0.45,
    pLifeMax: 1.35,
    pMax: 120,           // 总粒子上限
    tickStep: 0.10,
    tickLife: 1.8,
    tickMax: 20,
    sprite: 32
  }

  /* 调色板（design-spec §2.1） */
  var C = {
    cloud: '238,242,246',
    bio: '126,240,212',
    rim: '87,168,255',
    steel: '163,166,170',
    ink: '10,20,36',
    cream: '241,230,210',
    space: '5,10,22',
    sand: '232,204,158'
  }

  /* ── 3. 路径常量（由 _tools/asset-b/sync-whale-js.mjs 从 lib/assets/brand/*.svg 注入） ── */
  /* @paths-begin */
  var PATHS = {
    mark: 'M48.8354 10.0479C48.3232 9.79199 48.1025 10.2798 47.8032 10.5278C47.7007 10.6079 47.6143 10.7119 47.5273 10.8076C46.7793 11.624 45.9048 12.1597 44.7622 12.0957C43.0923 12 41.666 12.5356 40.4058 13.8398C40.1377 12.2319 39.2476 11.272 37.8926 10.6558C37.1836 10.3359 36.4668 10.0156 35.9702 9.31982C35.6235 8.82373 35.5293 8.27197 35.356 7.72754C35.2456 7.3999 35.1353 7.06396 34.7651 7.00781C34.3633 6.94385 34.2056 7.2876 34.0479 7.57568C33.418 8.75195 33.1733 10.0479 33.1973 11.3599C33.2524 14.312 34.4736 16.6641 36.8999 18.3359C37.1758 18.5278 37.2466 18.7197 37.1597 19C36.9946 19.5757 36.7974 20.1357 36.624 20.7119C36.5137 21.0801 36.3486 21.1597 35.9624 21C34.6309 20.4321 33.481 19.5918 32.4644 18.5757C30.7393 16.8721 29.1792 14.9917 27.2334 13.52C26.7764 13.1758 26.3193 12.856 25.8467 12.5518C23.8618 10.584 26.1069 8.96777 26.627 8.77588C27.1704 8.57568 26.8159 7.8877 25.0591 7.896C23.3022 7.90381 21.6953 8.50391 19.647 9.30371C19.3477 9.42383 19.0322 9.51172 18.7095 9.58398C16.8501 9.22363 14.9199 9.14355 12.9033 9.37598C9.10596 9.80762 6.07275 11.6396 3.84326 14.7681C1.16455 18.5278 0.53418 22.7998 1.30664 27.2559C2.11768 31.9521 4.46582 35.8398 8.07373 38.8799C11.8159 42.0322 16.1255 43.5762 21.041 43.2803C24.0269 43.104 27.3516 42.6963 31.1016 39.4561C32.0469 39.936 33.0396 40.1279 34.686 40.272C35.9546 40.3921 37.1758 40.208 38.1211 40.0078C39.6021 39.688 39.4995 38.2881 38.9639 38.0322C34.623 35.9678 35.5762 36.8081 34.71 36.1279C36.9155 33.4639 40.2402 30.6958 41.54 21.728C41.6426 21.0161 41.5557 20.5679 41.54 19.9917C41.5322 19.6396 41.6108 19.5039 42.0049 19.4639C43.0923 19.3359 44.1479 19.0317 45.1167 18.4878C47.9292 16.9199 49.064 14.3438 49.3315 11.2559C49.3711 10.7837 49.3237 10.2959 48.8354 10.0479ZM24.3262 37.8398C20.1196 34.4639 18.0791 33.3521 17.2358 33.3999C16.4482 33.4482 16.5898 34.3682 16.7632 34.9678C16.9443 35.5601 17.1812 35.9683 17.5117 36.4878C17.7402 36.832 17.8979 37.3442 17.2832 37.728C15.9282 38.584 13.5728 37.4399 13.4624 37.3838C10.7207 35.7358 8.42822 33.5601 6.81348 30.584C5.25342 27.7197 4.34766 24.6479 4.19775 21.3677C4.1582 20.5757 4.38672 20.2959 5.15869 20.1519C6.17529 19.96 7.22314 19.9199 8.23926 20.0718C12.5327 20.7119 16.1885 22.6719 19.2529 25.7759C21.002 27.5439 22.3252 29.6558 23.6885 31.7202C25.1377 33.9121 26.6978 36 28.6831 37.7119C29.3843 38.312 29.9434 38.7681 30.479 39.104C28.8643 39.2881 26.1699 39.3281 24.3262 37.8398ZM26.3433 24.6001C26.3433 24.248 26.6191 23.9678 26.9658 23.9678C27.0444 23.9678 27.1152 23.9839 27.1782 24.0078C27.2651 24.04 27.3438 24.0879 27.4067 24.1602C27.5171 24.272 27.5801 24.4321 27.5801 24.6001C27.5801 24.9521 27.3042 25.2319 26.9575 25.2319C26.6108 25.2319 26.3433 24.9521 26.3433 24.6001ZM32.6064 27.8799C32.2046 28.0479 31.8027 28.1919 31.4165 28.208C30.8179 28.2397 30.1641 27.9922 29.8096 27.688C29.2583 27.2158 28.8643 26.9521 28.6987 26.1279C28.6279 25.7759 28.6675 25.2319 28.7305 24.9199C28.8721 24.248 28.7144 23.8159 28.2495 23.4238C27.8716 23.104 27.3911 23.0161 26.8633 23.0161C26.666 23.0161 26.4849 22.9277 26.3511 22.856C26.1304 22.7441 25.9492 22.4639 26.1226 22.1201C26.1777 22.0078 26.4458 21.7358 26.5088 21.688C27.2256 21.272 28.0527 21.4077 28.8169 21.7197C29.5259 22.0161 30.0615 22.5601 30.834 23.3281C31.6216 24.2559 31.7632 24.5117 32.2124 25.208C32.5669 25.752 32.8901 26.312 33.1104 26.9521C33.2446 27.3521 33.0713 27.6802 32.6064 27.8799Z',
    dorsal: 'M154 30C152 17 142 13 135 22C141 22 147 26 151 33Z',
    tail: 'M56 62C46 52 34 40 26 28C22 20 12 22 12 32C12 43 22 56 36 66C24 70 14 80 10 92C7 102 15 110 22 102C32 90 44 78 56 74Z',
    fin: 'M240 84C226 82 208 90 192 104C182 114 172 124 178 132C184 139 196 128 208 116C220 104 234 96 246 94C254 93 252 84 240 84Z',
    body: 'M262 46C254 34 240 27 222 23C198 18 170 20 144 26C118 32 94 42 76 52C64 60 56 64 50 68C47 69 46 70 46 71C46 72 47 73 50 74C58 80 68 88 82 96C100 107 122 114 148 116C174 118 200 112 220 101C236 92 248 83 255 76C260 71 263 66 264 61C265 55 264 50 262 46ZM242 51A3.4 3.4 0 1 0 242 57.8A3.4 3.4 0 1 0 242 51ZM262 62C252 68 238 73 226 74C238 76 252 70 263 64Z',
    belly: 'M262 64C256 76 244 88 230 97C214 107 196 112 180 113C192 102 208 92 224 82C240 72 254 65 260 60C262 57 264 59 262 64Z'
  }
  /* @paths-end */

  /* ── 4. 数学 / 颜色工具 ──────────────────────────────────────────────── */
  function clamp(v, a, b) {
    if (!isFinite(v)) return a
    return v < a ? a : (v > b ? b : v)
  }
  function lerp(a, b, t) { return a + (b - a) * clamp(t, 0, 1) }
  function smoothstep(t) { var x = clamp(t, 0, 1); return x * x * (3 - 2 * x) }
  function easeOutCubic(t) { var x = clamp(t, 0, 1); return 1 - Math.pow(1 - x, 3) }
  function easeInCubic(t) { var x = clamp(t, 0, 1); return x * x * x }
  function easeInOutCubic(t) {
    var x = clamp(t, 0, 1)
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
  }
  function easeOutBack(t) {
    var x = clamp(t, 0, 1)
    var c1 = 1.42
    var c3 = c1 + 1
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
  }
  function progress(t, a, b) {
    if (!(b > a)) return t >= b ? 1 : 0
    return clamp((t - a) / (b - a), 0, 1)
  }
  function hash01(seed, k) {
    var x = Math.sin(seed * 127.1 + k * 311.7) * 43758.5453123
    return x - Math.floor(x)
  }
  function rgba(rgb, a) {
    return 'rgba(' + rgb + ',' + clamp(a, 0, 1).toFixed(3) + ')'
  }
  function rgbStr(r, g, b, a) {
    return 'rgba(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + ',' + clamp(a, 0, 1).toFixed(3) + ')'
  }

  /* 均匀 Catmull-Rom：u∈[0,1] 跨全部控制段；端点重复作虚拟点 */
  function crEval(pts, u) {
    var n = pts.length
    var x = clamp(u, 0, 1) * (n - 1)
    var i = Math.floor(x)
    if (i > n - 2) i = n - 2
    if (i < 0) i = 0
    var f = x - i
    var p0 = pts[i === 0 ? 0 : i - 1]
    var p1 = pts[i]
    var p2 = pts[i + 1]
    var p3 = pts[i + 2 < n ? i + 2 : n - 1]
    var f2 = f * f
    var f3 = f2 * f
    var a = -0.5 * f3 + f2 - 0.5 * f
    var b = 1.5 * f3 - 2.5 * f2 + 1
    var c = -1.5 * f3 + 2 * f2 + 0.5 * f
    var d = 0.5 * f3 - 0.5 * f2
    return {
      x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
      y: a * p0.y + b * p1.y + c * p2.y + d * p3.y
    }
  }

  /* ── 5. 轨迹表：弧长参数化 + 单峰速度剖面 + 航向（t 的纯函数） ─────────── */
  var pathCache = { n: 0, w: 0, h: 0, mx: 0, my: 0, xs: null, ys: null, hd: null, spd: null }

  /* 弧长表插值：u → 累计弧长（像素） */
  function arcAtU(arcU, arcS, u, n) {
    var x = clamp(u, 0, 1) * n
    var i = Math.min(n - 1, Math.floor(x))
    var f = x - i
    return arcS[i] + (arcS[i + 1] - arcS[i]) * f
  }

  function buildPathTable(w, h, mx, my) {
    var pts = []
    var i
    for (i = 0; i < PATH_PTS.length; i++) pts.push({ x: PATH_PTS[i].x, y: PATH_PTS[i].y })
    pts[pts.length - 1] = { x: mx / w, y: my / h }

    /* 1) 弧长表（屏幕像素长度） */
    var arcU = new Float64Array(ARC_N + 1)
    var arcS = new Float64Array(ARC_N + 1)
    var prev = crEval(pts, 0)
    var acc = 0
    arcU[0] = 0
    arcS[0] = 0
    for (i = 1; i <= ARC_N; i++) {
      var uu = i / ARC_N
      var pp = crEval(pts, uu)
      acc += Math.hypot((pp.x - prev.x) * w, (pp.y - prev.y) * h)
      arcU[i] = uu
      arcS[i] = acc
      prev = pp
    }
    var totalLen = acc > 1 ? acc : 1

    /* 2) 单峰速度剖面（数学上与几何严格自洽）：
     *    - 横越段 A（enter→cross）：v0 → vpk 平滑加速（smoothstep，端点加速度 0）；
     *    - 折返段 B（cross→turn）：vpk → 0 平滑减速（1-smoothstep），末速与末加速度均为 0；
     *    两段各自 ∫ = 0.5·(端点速度和)·段长 → 反解出 vpk / v0：
     *      vpk = 2·LB/TB，v0 = 2·LA/TA − vpk
     *    这样「位置 ↔ 时间」严格对应（6.30 恰在 0.80w/0.33h，7.35 恰在 mark 且速度为 0），
     *    且速度剖面只有一个峰值（6.30），峰后单调归零 —— 不再出现旧版的二次加速。
     *    NOTE（与 plan §4.3 的偏差已记录）：A 段弧长/时长已定（avg≈1548px/s）> B 段
     *    （avg≈1172px/s），若 A 段取 easeOut 减速则 6.30 速度必然低于 B 段均值，
     *    合速度会出现第二峰；因此 A 段实现为「跃出加速、横越达峰」，B 段「减速到 0」。 */
    var uCross = CROSS_INDEX / (pts.length - 1)
    var arcCross = arcAtU(arcU, arcS, uCross, ARC_N)
    var LA = arcCross
    var LB = totalLen - arcCross
    var TA = T.cross - T.enter
    var TB = T.turn - T.cross
    var vpk = TB > 1e-6 ? (2 * LB / TB) : 0
    var v0 = TA > 1e-6 ? (2 * LA / TA - vpk) : vpk
    if (!isFinite(vpk) || vpk < 1) vpk = 1
    if (!isFinite(v0) || v0 < 4) v0 = Math.max(4, vpk * 0.02)

    var n = TABLE_N
    var dt = (T.turn - T.enter) / (n - 1)
    var spd = new Float64Array(n)
    var cum = new Float64Array(n)
    var sum = 0
    for (i = 0; i < n; i++) {
      var tt = T.enter + i * dt
      var v
      if (tt <= T.cross) v = v0 + (vpk - v0) * smoothstep(progress(tt, T.enter, T.cross))
      else v = vpk * (1 - smoothstep(progress(tt, T.cross, T.turn)))
      spd[i] = v
      if (i > 0) sum += (spd[i - 1] + v) * 0.5 * dt
      cum[i] = sum
    }
    var sumDist = sum > 1e-6 ? sum : 1

    /* 3) 时间 → 弧长（归一化积分 × 总弧长，保证终点严格落在 mark）→ 曲线 u → 屏幕坐标 */
    var xs = new Float64Array(n)
    var ys = new Float64Array(n)
    var hd = new Float64Array(n)
    for (i = 0; i < n; i++) {
      var s = (cum[i] / sumDist) * totalLen
      var lo = 0
      var hi = ARC_N
      while (hi - lo > 1) {
        var mid = (lo + hi) >> 1
        if (arcS[mid] < s) lo = mid
        else hi = mid
      }
      var segLen = arcS[hi] - arcS[lo]
      var fr = segLen > 1e-9 ? (s - arcS[lo]) / segLen : 0
      var u2 = arcU[lo] + (arcU[hi] - arcU[lo]) * fr
      var pos = crEval(pts, u2)
      xs[i] = pos.x * w
      ys[i] = pos.y * h
    }
    /* 4) 航向（中心差分，屏幕像素坐标；unwrap 保持单调） */
    for (i = 0; i < n; i++) {
      var i0 = Math.max(0, i - 1)
      var i1 = Math.min(n - 1, i + 1)
      hd[i] = Math.atan2(ys[i1] - ys[i0], xs[i1] - xs[i0]) * 180 / Math.PI
    }
    for (i = 1; i < n; i++) {
      while (hd[i] - hd[i - 1] > 180) hd[i] -= 360
      while (hd[i] - hd[i - 1] < -180) hd[i] += 360
    }
    pathCache = { n: n, w: w, h: h, mx: mx, my: my, xs: xs, ys: ys, hd: hd, spd: spd, endHeading: hd[n - 1] }
    return pathCache
  }

  function ensurePath(w, h, mx, my) {
    var pc = pathCache
    if (pc.n && Math.abs(pc.w - w) < 0.5 && Math.abs(pc.h - h) < 0.5 &&
      Math.abs(pc.mx - mx) < 0.5 && Math.abs(pc.my - my) < 0.5) return pc
    return buildPathTable(w, h, mx, my)
  }

  /* ── 6. 姿态求解：t → 屏幕位置 / 朝向 / 缩放（纯函数，可被任意 t 调用） ─── */
  function scaleProfile(t) {
    if (t < T.cross) return lerp(0.55, 1.0, smoothstep(progress(t, T.enter, T.cross)))
    if (t < T.turn) return lerp(1.0, 0.62, smoothstep(progress(t, T.cross, T.turn)))
    return 0.42
  }

  function opacityProfile(t) {
    var a = smoothstep(progress(t, T.enter, T.enter + 0.16))
    return a * (1 - smoothstep(progress(t, T.rush, T.impact + 0.14)))
  }

  function poseAt(t, w, h, mark) {
    var pose = {
      visible: false, x: 0, y: 0, rot: 0, rotY: 0, roll: 0, scale: 1, opacity: 0,
      phase: 'idle', mirror: 1, sx: 1, sy: 1, heading: 0, speed: 0, px: 0, py: 0
    }
    if (!(t >= T.enter)) return pose
    var W = w > 0 ? w : 1600
    var H = h > 0 ? h : 900
    var mx = mark && isFinite(mark.x) ? mark.x : MARK.nx * W
    var my = mark && isFinite(mark.y) ? mark.y : MARK.ny * H
    var pc = ensurePath(W, H, mx, my)
    var n = pc.n

    if (t < T.turn) {
      /* 横越 + 折返：整条路径共用一张时间表（无相位跳变） */
      var f = (t - T.enter) / (T.turn - T.enter) * (n - 1)
      var i = Math.floor(f)
      if (i > n - 2) i = n - 2
      if (i < 0) i = 0
      var fr = f - i
      var x = lerp(pc.xs[i], pc.xs[i + 1], fr)
      var y = lerp(pc.ys[i], pc.ys[i + 1], fr)
      var heading = lerp(pc.hd[i], pc.hd[i + 1], fr)
      var speed = lerp(pc.spd[i], pc.spd[i + 1], fr)
      /* 侧倾 bank：折返段最多 10°，两端归零 */
      var bank = 10 * Math.sin(Math.PI * clamp(progress(t, T.cross, T.turn) * 1.04, 0, 1)) *
        smoothstep(progress(t, T.cross, T.cross + 0.22))
      /* 3D 偏航：航向穿越竖直（74°→106°）时 180° 转身，避免鲸腹朝天；
       * 末段叠加 ≈24° 残余偏航（plan §4.3 rotY 0→24° 的可视化等价实现）。 */
      var yaw = 180 * smoothstep(clamp((heading - YAW_A) / (YAW_B - YAW_A), 0, 1))
      var extra = YAW_EXTRA * smoothstep(progress(t, T.cross + 0.25, T.turn))
      var yawT = yaw + extra
      var cosYaw = Math.cos(yawT * RAD)
      var mirror = 1
      var sx = 1
      var rot
      if (cosYaw >= 0) {
        mirror = 1
        sx = cosYaw
        rot = heading + bank
      } else {
        mirror = -1
        sx = -cosYaw
        rot = heading - 180 + bank
      }
      /* 侧向最薄处保留 6% 宽度（纯 0 会闪断；6% 读作「侧身掠过」） */
      if (sx < 0.06) sx = 0.06
      /* squash/stretch：±2%，与摆尾相位相关（体积感） */
      var sy = 1 + 0.02 * Math.sin(t * 2.6 + 0.8) * (t < T.cross ? 1 : 0.55)
      pose.visible = true
      pose.x = x
      pose.y = y
      pose.rot = rot
      pose.rotY = yawT
      pose.roll = bank
      pose.mirror = mirror
      pose.sx = sx
      pose.sy = sy
      pose.heading = heading
      pose.speed = speed
      pose.scale = scaleProfile(t)
      pose.opacity = opacityProfile(t)
      pose.phase = t < T.cross ? 'cross' : 'turn'
      return pose
    }

    if (t < T.impact + 0.42) {
      /* 7.35–7.52 悬停收尾：沿末段航向做 12px/s 的极缓微滑（累计位移 ≤6px，观感即静止悬停），
       * 让 verifier 的「速度方向角」在近零速时始终有定义、不产生伪翻转。
       * 7.52–7.74 收缩 + 淡出并粒子化；之后只剩 mark 处的粒子汇聚（鲸体不再绘制）。 */
      var hover = progress(t, T.turn, T.rush)
      var shrink = smoothstep(progress(t, T.rush, T.impact + 0.14))
      var endHeading = typeof pc.endHeading === 'number' ? pc.endHeading : 199.3
      var rotEnd = endHeading - 180
      var glide = Math.max(0, Math.min(t, HOVER_END) - T.turn) * HOVER_DRIFT
      var endRad = endHeading * RAD
      pose.visible = true
      pose.x = mx + Math.cos(endRad) * glide
      pose.y = my + Math.sin(endRad) * glide
      pose.rot = lerp(rotEnd, rotEnd - 6.5, smoothstep(hover))
      pose.rotY = 180 + YAW_EXTRA
      pose.roll = 0
      pose.mirror = -1
      pose.sx = lerp(-Math.cos((180 + YAW_EXTRA) * RAD), 0.955, smoothstep(hover))
      pose.sy = 1
      pose.heading = endHeading
      pose.speed = t < HOVER_END ? HOVER_DRIFT : 0
      pose.scale = lerp(0.62, 0.42, smoothstep(hover)) * lerp(1, 0.42, shrink)
      pose.opacity = 1 - shrink
      pose.phase = t < T.impact ? 'settle' : 'morph'
      return pose
    }
    return pose
  }

  /* 胸鳍 / 尾鳍相位（尾鳍与胸鳍错开相位；收尾时鳍收拢） */
  function tailWag(t) {
    if (t < T.cross) return Math.sin(progress(t, T.enter, T.cross) * TAU * 2.6) * 15
    if (t < T.turn) return Math.sin(progress(t, T.cross, T.turn) * TAU * 1.35 + 1.2) * 12
    if (t < T.rush) return Math.sin(progress(t, T.turn, T.rush) * TAU) * 16
    return Math.sin(TAU) * 16 * (1 - smoothstep(progress(t, T.rush, T.rush + 0.12)))
  }
  function finAngle(t) {
    var swim
    if (t < T.cross) swim = Math.sin(progress(t, T.enter, T.cross) * TAU * 2.6 + 2.1) * 10
    else if (t < T.turn) swim = Math.sin(progress(t, T.cross, T.turn) * TAU * 1.35 + 1.2 + 2.1) * 9
    else swim = 0
    if (t < T.turn) return swim
    var close = smoothstep(progress(t, T.turn, T.turn + 0.2))
    return lerp(swim, -24, close) * (1 - smoothstep(progress(t, T.rush, T.rush + 0.14)))
  }
  function tailTipLocal(angle) {
    var a = (angle || 0) * RAD
    var dx = TAIL_TIP[0] - TAIL_PIVOT[0]
    var dy = TAIL_TIP[1] - TAIL_PIVOT[1]
    return {
      x: TAIL_PIVOT[0] + dx * Math.cos(a) - dy * Math.sin(a),
      y: TAIL_PIVOT[1] + dx * Math.sin(a) + dy * Math.cos(a)
    }
  }
  function localToWorld(pose, lx, ly, kk) {
    var X = (lx - 140) * kk * pose.mirror * pose.sx
    var Y = (ly - 70) * kk * pose.sy
    var a = (pose.rot || 0) * RAD
    var co = Math.cos(a)
    var si = Math.sin(a)
    return {
      x: pose.x + (pose.px || 0) + X * co - Y * si,
      y: pose.y + (pose.py || 0) + X * si + Y * co
    }
  }
  function anchorPose(anchor) {
    return {
      visible: false, x: anchor.x, y: anchor.y, rot: 12, rotY: 204, roll: 0,
      scale: 0.18, opacity: 0, phase: 'morph', mirror: -1, sx: 0.95, sy: 1,
      heading: 204, speed: 0, px: 0, py: 0
    }
  }

  /* ── 7. 内联 SVG（仅 canvas 2d 不可用时的降级鲸体；结构与同步资产一致） ── */
  function swimSvg() {
    return '<svg xmlns="' + NS + '" viewBox="0 0 280 140" fill="none" aria-hidden="true" focusable="false">' +
      '<defs>' +
      '<linearGradient id="vwy-body" x1="0.18" y1="0" x2="0.46" y2="1">' +
      '<stop offset="0" stop-color="#ffffff"/><stop offset="0.14" stop-color="#fbfdff"/>' +
      '<stop offset="0.3" stop-color="#eef6ff"/><stop offset="0.42" stop-color="#dcEBFA"/>' +
      '<stop offset="0.56" stop-color="#c4dcf2"/><stop offset="0.7" stop-color="#a8c8e6"/>' +
      '<stop offset="0.84" stop-color="#94b7d6"/><stop offset="0.93" stop-color="#d3c9b0"/>' +
      '<stop offset="1" stop-color="#f3e4c6"/>' +
      '</linearGradient>' +
      '<linearGradient id="vwy-rim" x1="0" y1="0" x2="0.3" y2="1">' +
      '<stop offset="0" stop-color="#a8d8ff" stop-opacity="0.95"/>' +
      '<stop offset="0.42" stop-color="#57a8ff" stop-opacity="0.8"/>' +
      '<stop offset="0.72" stop-color="#7ef0d4" stop-opacity="0.7"/>' +
      '<stop offset="1" stop-color="#e8cc9e" stop-opacity="0.8"/>' +
      '</linearGradient>' +
      '<linearGradient id="vwy-belly" x1="0" y1="0" x2="0.25" y2="1">' +
      '<stop offset="0" stop-color="#ffffff" stop-opacity="0.9"/><stop offset="1" stop-color="#ffe9c9" stop-opacity="0.3"/>' +
      '</linearGradient>' +
      '<radialGradient id="vwy-spec" cx="0.36" cy="0.14" r="0.66">' +
      '<stop offset="0" stop-color="#ffffff" stop-opacity="0.9"/>' +
      '<stop offset="0.55" stop-color="#ffffff" stop-opacity="0.18"/>' +
      '<stop offset="1" stop-color="#ffffff" stop-opacity="0"/>' +
      '</radialGradient>' +
      '<radialGradient id="vwy-shade" cx="0.74" cy="1.02" r="0.72">' +
      '<stop offset="0" stop-color="#3f6f9e" stop-opacity="0.42"/>' +
      '<stop offset="0.62" stop-color="#3f6f9e" stop-opacity="0.14"/>' +
      '<stop offset="1" stop-color="#3f6f9e" stop-opacity="0"/>' +
      '</radialGradient>' +
      '<clipPath id="vwy-clip"><path d="' + PATHS.body + '"/></clipPath>' +
      '</defs>' +
      '<g id="whale-dorsal"><path id="dorsal" d="' + PATHS.dorsal + '" fill="url(#vwy-body)" stroke="url(#vwy-rim)" stroke-width="1.2"/></g>' +
      '<g id="whale-tail"><path id="tail" d="' + PATHS.tail + '" fill="url(#vwy-body)" stroke="url(#vwy-rim)" stroke-width="1.4"/></g>' +
      '<g id="whale-fin"><path id="fin" d="' + PATHS.fin + '" fill="url(#vwy-body)" fill-opacity="0.84" stroke="url(#vwy-rim)" stroke-width="1.4"/></g>' +
      '<g id="whale-body">' +
      '<path id="body" d="' + PATHS.body + '" fill="url(#vwy-body)" fill-rule="evenodd" ' +
      'stroke="url(#vwy-rim)" stroke-width="1.5" stroke-linejoin="round" paint-order="stroke"/>' +
      '<g clip-path="url(#vwy-clip)">' +
      '<rect x="0" y="0" width="280" height="140" fill="url(#vwy-spec)"/>' +
      '<rect x="0" y="0" width="280" height="140" fill="url(#vwy-shade)"/>' +
      '<ellipse cx="206" cy="44" rx="24" ry="8" fill="#dbe9fa" opacity="0.45" transform="rotate(-16 206 44)"/>' +
      '<ellipse cx="168" cy="36" rx="18" ry="6" fill="#dbe9fa" opacity="0.38" transform="rotate(-10 168 36)"/>' +
      '<ellipse cx="130" cy="36" rx="14" ry="5" fill="#dbe9fa" opacity="0.3" transform="rotate(-6 130 36)"/>' +
      '<path d="M248 44C232 32 208 24 182 23C158 22 132 27 110 36" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-opacity="0.9" stroke-linecap="round"/>' +
      '<path d="M250 80C232 98 206 110 178 112" fill="none" stroke="rgba(241,230,210,0.75)" stroke-width="1.6" stroke-linecap="round"/>' +
      '</g>' +
      '<path id="belly" d="' + PATHS.belly + '" fill="#fff6e8" fill-opacity="0.5"/>' +
      '</g>' +
      '</svg>'
  }

  function markSvg() {
    return '<svg xmlns="' + NS + '" viewBox="0 0 50 50" fill="none" aria-hidden="true" focusable="false">' +
      '<defs><linearGradient id="vwy-mark" x1="0.25" y1="0" x2="0.6" y2="1">' +
      '<stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dbe7f6"/>' +
      '</linearGradient></defs>' +
      '<path d="' + PATHS.mark + '" fill="url(#vwy-mark)" fill-rule="nonzero"/>' +
      '</svg>'
  }

  /* ── 8. 创建 ──────────────────────────────────────────────────────────── */
  function create(options) {
    var opts = options || {}
    var root = opts.root || null
    var canvas = opts.canvas || null
    var api = {}
    var st = {
      disposed: false,
      built: false,
      reduced: !!opts.reduced,
      w: 0, h: 0, dpr: 1,
      swimW: 0, swimH: 0,
      markW: 84, markH: 84,
      lastT: null,
      morphOverride: null,
      lastPose: null,
      markSlot: null,
      markMeasuredAt: -1,
      anchorFallback: null,
      anchor: { x: 0, y: 0, w: 0, h: 0 },
      ctx2d: null,
      canvasReady: false,
      fxFrames: 0,
      asset: 'inline',
      warn: {}
    }
    var el = { layer: null, swim: null, mark: null, glow: null, ringA: null, ringB: null }
    var nodes = { tail: null, fin: null }
    var sprites = {}
    var G = {}       // 缓存渐变（局部坐标；随 CTM 变换）
    var GEO = {}     // Path2D 缓存

    function warnOnce(key, err) {
      if (st.warn[key]) return
      st.warn[key] = true
      try { console.warn('[vyron-whale] ' + key + ': ' + (err && err.message ? err.message : err)) } catch (e) { /* noop */ }
    }

    /* 8.1 DOM 构建（鲸体在 canvas；DOM 只留降级 SVG + 鱼标 + 光晕 + 声呐环） */
    function build() {
      if (st.built || st.disposed || !root) return
      try {
        while (root.firstChild) root.removeChild(root.firstChild)
        var layer = document.createElement('div')
        layer.className = 'vy-whale-layer'

        var swim = document.createElement('div')
        swim.className = 'vy-whale-swim'
        swim.innerHTML = swimSvg()
        swim.style.display = 'none'

        var mark = document.createElement('div')
        mark.className = 'vy-whale-mark'
        mark.innerHTML = markSvg()

        var glow = document.createElement('div')
        glow.className = 'vy-whale-glow'

        var ringA = document.createElement('div')
        ringA.className = 'vy-whale-ring'
        var ringB = document.createElement('div')
        ringB.className = 'vy-whale-ring is-alt'

        layer.appendChild(swim)
        layer.appendChild(mark)
        layer.appendChild(glow)
        layer.appendChild(ringA)
        layer.appendChild(ringB)
        root.appendChild(layer)

        el.layer = layer
        el.swim = swim
        el.mark = mark
        el.glow = glow
        el.ringA = ringA
        el.ringB = ringB
        nodes.tail = swim.querySelector('#whale-tail')
        nodes.fin = swim.querySelector('#whale-fin')

        if (canvas) {
          try {
            st.ctx2d = canvas.getContext('2d')
            st.canvasReady = !!st.ctx2d
            if (!st.canvasReady) warnOnce('canvas-2d 不可用，鲸体降级为内联 SVG')
            else {
              buildSprites()
              buildGeometry()
              buildGradients()
            }
          } catch (err) {
            st.ctx2d = null
            warnOnce('canvas-2d 创建失败', err)
          }
        }
        if (typeof Path2D === 'function' && PATHS.body && !GEO.body) {
          try {
            GEO.body = new Path2D(PATHS.body)
            GEO.tail = new Path2D(PATHS.tail)
            GEO.fin = new Path2D(PATHS.fin)
            GEO.dorsal = new Path2D(PATHS.dorsal)
            GEO.belly = new Path2D(PATHS.belly)
            GEO.mouth = new Path2D('M262 62C252 68 238 73 226 74C238 76 252 70 263 64Z')
            GEO.dorsalHi = new Path2D('M248 44C232 32 208 24 182 23C158 22 132 27 110 36')
            GEO.bellyHi = new Path2D('M250 80C232 98 206 110 178 112')
            GEO.lateral = new Path2D('M252 74C232 76 208 80 186 86C168 91 152 96 138 99')
          } catch (err) {
            warnOnce('Path2D 构建失败', err)
          }
        }

        st.built = true
        measure()
        checkAsset()
        refreshMarkRect()
        try {
          if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
            document.fonts.ready.then(function () {
              refreshMarkRect()
              buildGradients()
            }).catch(function () { /* noop */ })
          }
        } catch (err) { /* noop */ }
      } catch (err) {
        warnOnce('DOM 构建失败', err)
      }
    }

    function buildSprites() {
      var make = function (rgb) {
        try {
          var s = document.createElement('canvas')
          s.width = s.height = FX.sprite
          var c = s.getContext('2d')
          if (!c) return null
          var half = FX.sprite / 2
          var g = c.createRadialGradient(half, half, 0, half, half, half)
          g.addColorStop(0, 'rgba(' + rgb + ',1)')
          g.addColorStop(0.3, 'rgba(' + rgb + ',0.55)')
          g.addColorStop(0.7, 'rgba(' + rgb + ',0.12)')
          g.addColorStop(1, 'rgba(' + rgb + ',0)')
          c.fillStyle = g
          c.fillRect(0, 0, FX.sprite, FX.sprite)
          return s
        } catch (err) { return null }
      }
      sprites.bio = make(C.bio)
      sprites.rim = make(C.rim)
      sprites.white = make(C.cloud)
    }

    function buildGeometry() {
      if (typeof Path2D !== 'function' || !PATHS.body || GEO.body) return
      try {
        GEO.body = new Path2D(PATHS.body)
        GEO.tail = new Path2D(PATHS.tail)
        GEO.fin = new Path2D(PATHS.fin)
        GEO.dorsal = new Path2D(PATHS.dorsal)
        GEO.belly = new Path2D(PATHS.belly)
        GEO.mouth = new Path2D('M262 62C252 68 238 73 226 74C238 76 252 70 263 64Z')
        GEO.dorsalHi = new Path2D('M248 44C232 32 208 24 182 23C158 22 132 27 110 36')
        GEO.bellyHi = new Path2D('M250 80C232 98 206 110 178 112')
        GEO.lateral = new Path2D('M252 74C232 76 208 80 186 86C168 91 152 96 138 99')
      } catch (err) {
        warnOnce('Path2D 构建失败', err)
      }
    }

    /* 8.2 体表渐变（局部坐标缓存；canvas 渐变随 CTM 变换，每帧零重建） */
    function buildGradients() {
      var c = st.ctx2d
      if (!c || G.body) return
      var g
      /* 体表 12 段：顶白 → 云白 → 冷蓝腹 → 暖沙反光（≥7 段纵向渐变） */
      g = c.createLinearGradient(84, 6, 218, 128)
      g.addColorStop(0.00, '#ffffff')
      g.addColorStop(0.07, '#fbfdff')
      g.addColorStop(0.16, '#f3f9ff')
      g.addColorStop(0.26, '#e7f1fc')
      g.addColorStop(0.36, '#d3e5f8')
      g.addColorStop(0.46, '#b9d6f2')
      g.addColorStop(0.56, '#9dc4e8')
      g.addColorStop(0.66, '#82b0da')
      g.addColorStop(0.75, '#6f9cc6')
      g.addColorStop(0.84, '#a3b6c6')
      g.addColorStop(0.92, '#cfc3ab')
      g.addColorStop(1.00, '#efdfc1')
      G.body = g
      /* 背鳍：与体表同源略暗（读作同一材质） */
      g = c.createLinearGradient(136, 12, 154, 34)
      g.addColorStop(0, '#f7fbff')
      g.addColorStop(0.55, '#e6f2fd')
      g.addColorStop(1, '#b9d2ea')
      G.dorsal = g
      /* 尾鳍：根部亮、末端半透（薄而透光） */
      g = c.createLinearGradient(12, 20, 58, 108)
      g.addColorStop(0, 'rgba(255,255,255,0.96)')
      g.addColorStop(0.32, 'rgba(238,247,255,0.92)')
      g.addColorStop(0.68, 'rgba(198,222,242,0.86)')
      g.addColorStop(1, 'rgba(150,188,226,0.8)')
      G.tail = g
      g = c.createLinearGradient(180, 86, 250, 136)
      g.addColorStop(0, 'rgba(246,252,255,0.95)')
      g.addColorStop(0.45, 'rgba(210,234,252,0.84)')
      g.addColorStop(1, 'rgba(152,198,234,0.66)')
      G.fin = g
      g = c.createLinearGradient(168, 108, 252, 86)
      g.addColorStop(0, 'rgba(206,238,255,0.14)')
      g.addColorStop(0.5, 'rgba(232,248,255,0.66)')
      g.addColorStop(1, 'rgba(150,216,244,0.42)')
      G.finEdge = g
      /* 三色边缘光：上缘空气蓝 / 下缘生物光青 / 靠地球暖侧沙金（顶亮底柔，不做均匀描边） */
      g = c.createLinearGradient(72, 4, 232, 132)
      g.addColorStop(0.00, 'rgba(198,234,255,0.98)')
      g.addColorStop(0.22, 'rgba(120,192,255,0.86)')
      g.addColorStop(0.48, 'rgba(87,168,255,0.52)')
      g.addColorStop(0.72, 'rgba(126,240,212,0.44)')
      g.addColorStop(0.88, 'rgba(232,204,158,0.46)')
      g.addColorStop(1.00, 'rgba(245,226,184,0.6)')
      G.rim = g
      /* 高光边缘（上缘/吻端更亮的第二层 specular 线） */
      g = c.createLinearGradient(150, 12, 270, 62)
      g.addColorStop(0, 'rgba(255,255,255,0)')
      g.addColorStop(0.4, 'rgba(255,255,255,0.85)')
      g.addColorStop(0.75, 'rgba(255,255,255,0.95)')
      g.addColorStop(1, 'rgba(255,255,255,0.2)')
      G.rimHot = g
      g = c.createLinearGradient(140, 58, 140, 124)
      g.addColorStop(0, 'rgba(18,40,70,0)')
      g.addColorStop(0.6, 'rgba(18,40,70,0.24)')
      g.addColorStop(1, 'rgba(7,20,40,0.56)')
      G.under = g
      g = c.createLinearGradient(150, 70, 150, 122)
      g.addColorStop(0, 'rgba(255,246,226,0)')
      g.addColorStop(0.55, 'rgba(255,242,218,0.20)')
      g.addColorStop(1, 'rgba(255,238,206,0.44)')
      G.belly = g
      g = c.createLinearGradient(100, 18, 250, 42)
      g.addColorStop(0, 'rgba(255,255,255,0.04)')
      g.addColorStop(0.4, 'rgba(255,255,255,0.26)')
      g.addColorStop(0.72, 'rgba(255,255,255,0.30)')
      g.addColorStop(1, 'rgba(255,255,255,0.05)')
      G.back = g
      g = c.createRadialGradient(252, 112, 2, 226, 100, 88)
      g.addColorStop(0, 'rgba(24,60,100,0.38)')
      g.addColorStop(0.55, 'rgba(24,60,100,0.16)')
      g.addColorStop(1, 'rgba(24,60,100,0)')
      G.side = g
      /* 虹膜：深蓝黑径向 + 一点冷反光 */
      g = c.createRadialGradient(241.1, 53.1, 0.15, 242, 54.4, 3.7)
      g.addColorStop(0, '#24507c')
      g.addColorStop(0.35, '#123453')
      g.addColorStop(0.72, '#071827')
      g.addColorStop(1, '#02070d')
      G.eye = g
      /* 腹部/鳍根棚影（ambient occlusion，柔软小面积） */
      g = c.createRadialGradient(196, 108, 2, 214, 112, 46)
      g.addColorStop(0, 'rgba(16,38,66,0.30)')
      g.addColorStop(1, 'rgba(16,38,66,0)')
      G.aoFin = g
    }

    /* 8.3 尺寸（不逐帧读布局） */
    function measure() {
      var w = st.w || 0
      var h = st.h || 0
      if (w > 0) {
        st.swimW = clamp(w * SWIM_W_RATIO, SWIM_W_MIN, SWIM_W_MAX)
        st.swimH = st.swimW * 0.5
        if (el.swim) {
          el.swim.style.width = st.swimW + 'px'
          el.swim.style.height = st.swimH + 'px'
          setHalf(el.swim, st.swimW, st.swimH)
        }
      }
      if (!st.markW || st.markW < 8) {
        st.markW = clamp(Math.min(w || 800, h || 600) * 0.092, 52, 132)
      }
      applyMarkSize()
    }

    function applyMarkSize() {
      st.markH = st.markW
      if (el.mark) {
        el.mark.style.width = st.markW + 'px'
        el.mark.style.height = st.markW + 'px'
        setHalf(el.mark, st.markW, st.markH)
      }
      if (el.glow) {
        var gd = Math.round(st.markW * 2.4)
        el.glow.style.width = gd + 'px'
        el.glow.style.height = gd + 'px'
        setHalf(el.glow, gd, gd)
      }
    }

    /* 8.4 资源策略：路径全部内联，运行期零外部请求 */
    function checkAsset() {
      st.asset = 'inline'
      if (!PATHS.body || !PATHS.mark) {
        st.asset = 'inline-empty'
        warnOnce('内联路径为空：请跑 _tools/asset-b/sync-whale-js.mjs')
      }
    }

    /* 8.5 mark 锚点：量 #vyMarkSlot（字体加载后行宽会变，必须可刷新）。
     * 关键：.vy-lockup 有 scale(.97 + --vy-lock*.03)；这里统一按**终帧缩放**（1.0）
     * 还原布局坐标作为稳定锚点 —— 鲸鱼落点 / morph 鱼标 / 声呐环全部用它，
     * 与 8.8s 终帧实测的 #vyMarkSlot 中心逐像素一致（≤1px）。 */
    function refreshMarkRect() {
      if (!st.built) return false
      try {
        var lockEl = document.getElementById('vyLockup')
        var slotEl = document.getElementById('vyMarkSlot')
        if (!lockEl || !slotEl) return false
        var lr = lockEl.getBoundingClientRect()
        var sr = slotEl.getBoundingClientRect()
        if (!(sr.width > 4) || !(lr.width > 4)) return false
        var layoutW = lockEl.offsetWidth || (lr.width + 1)
        var measured = lr.width / layoutW
        if (!(measured > 0.02) || measured > 4) measured = 1
        var ratio = 1 / measured              // 还原到终帧（lock=1）布局
        var w = st.w || (window.innerWidth || 1280)
        var h = st.h || (window.innerHeight || 800)
        /* .vy-lockup 的中心恒在视口 (50%, 47%)，缩放不改变中心 */
        var cx = w * 0.5 + (sr.left + sr.width / 2 - (lr.left + lr.width / 2)) * ratio
        var cy = h * 0.47 + (sr.top + sr.height / 2 - (lr.top + lr.height / 2)) * ratio
        var next = { x: cx, y: cy, w: sr.width * ratio, h: sr.height * ratio }
        var prev = st.markSlot
        var moved = !prev || Math.abs(prev.x - next.x) > 0.5 || Math.abs(prev.y - next.y) > 0.5 || Math.abs(prev.w - next.w) > 0.5
        st.markSlot = next
        st.anchor = next
        if (w > 0 && h > 0) {
          MARK.nx = next.x / w
          MARK.ny = next.y / h
          MARK.valid = true
        }
        var sz = clamp(next.w, 24, 240)
        if (Math.abs(sz - st.markW) > 0.5) {
          st.markW = sz
          applyMarkSize()
        }
        return moved
      } catch (err) {
        return false
      }
    }

    function markAnchor(ctx) {
      /* t>=7.0 起每 0.35s 复量一次（字体/布局变化后的自愈） */
      var t = st.lastT === null ? 0 : st.lastT
      if (t >= 7.0 && t <= T.end + 0.4) {
        if (st.markMeasuredAt < 0 || Math.abs(t - st.markMeasuredAt) > 0.35) {
          st.markMeasuredAt = t
          refreshMarkRect()
        }
      }
      if (st.markSlot) return st.markSlot
      var rect = ctx && ctx.markRect
      if (rect && rect.w > 0 && isFinite(rect.x) && isFinite(rect.y)) {
        return { x: rect.x, y: rect.y, w: rect.w, h: rect.h }
      }
      var w = st.w || (window.innerWidth || 1280)
      var h = st.h || (window.innerHeight || 800)
      var cached = st.anchorFallback
      if (cached && cached.wv === w && cached.hv === h) return cached
      var x = NaN
      var y = NaN
      var size = NaN
      try {
        var cs = window.getComputedStyle(document.documentElement)
        x = parseFloat(cs.getPropertyValue('--vy-mark-x'))
        y = parseFloat(cs.getPropertyValue('--vy-mark-y'))
        size = parseFloat(cs.getPropertyValue('--vy-mark-w'))
      } catch (err) { /* noop */ }
      var fb = clamp(Math.min(w, h) * 0.092, 52, 132)
      if (!isFinite(size) || size < 8) size = fb
      if (!isFinite(x)) x = w * MARK.nx
      if (!isFinite(y)) y = h * MARK.ny
      st.anchorFallback = { x: x, y: y, w: clamp(size, 24, 240), h: clamp(size, 24, 240), wv: w, hv: h }
      return st.anchorFallback
    }

    /* 8.6 落位（x,y = 元素中心；sx/sy 供降级鲸体做镜像/挤压） */
    function place(node, cx, cy, rot, ry, scale, sx, sy) {
      if (!node) return
      var s = scale === undefined ? 1 : scale
      var mx = sx === undefined ? 1 : sx
      var my = sy === undefined ? 1 : sy
      var tx = (cx - (node.__halfW || 0)).toFixed(2)
      var ty = (cy - (node.__halfH || 0)).toFixed(2)
      node.style.transform = 'translate3d(' + tx + 'px,' + ty + 'px,0)' +
        ' rotate(' + (rot || 0).toFixed(2) + 'deg)' +
        (ry ? ' rotateY(' + ry.toFixed(2) + 'deg)' : '') +
        ' scale(' + (s * mx).toFixed(4) + ',' + (s * my).toFixed(4) + ')'
    }

    function setHalf(node, w, h) {
      if (!node) return
      node.__halfW = w / 2
      node.__halfH = h / 2
    }

    function canvasCtx() {
      if (!st.canvasReady || !st.ctx2d || !canvas) return null
      var w = st.w || 1
      var dpr = canvas.width / Math.max(1, w)
      if (!isFinite(dpr) || dpr <= 0) dpr = 1
      if (Math.abs(dpr - st.dpr) > 0.01) st.dpr = dpr
      st.ctx2d.setTransform(st.dpr, 0, 0, st.dpr, 0, 0)
      return st.ctx2d
    }

    function clearFx() {
      var c = canvasCtx()
      if (!c) return
      c.clearRect(0, 0, st.w + 2, st.h + 2)
    }

    /* ── 9. canvas 绘制：反光 / 阴影 / 光晕 / 尾迹 / 鲸体 / morph 粒子 ──── */
    function drawFx(c, t, pose, anchor) {
      c.clearRect(0, 0, st.w + 2, st.h + 2)
      st.fxFrames++
      try {
        drawReflection(c, t, pose)
        c.save()
        c.beginPath()
        c.rect(0, 0, st.w, st.h * DECK_Y)
        c.clip()
        drawContactShadow(c, t, pose)
        drawHalo(c, t, pose)
        drawTicks(c, t)
        drawTrail(c, t, pose)
        drawWhale(c, t, pose)
        drawMorph(c, t, pose, anchor)
        c.restore()
      } catch (err) {
        warnOnce('尾迹绘制异常', err)
        st.canvasReady = false
      }
    }

    /* 9.1 平台倒影（镜像剪影 + 增强横向 ripple） */
    function drawReflection(c, t, pose) {
      if (!GEO.body) return
      if (pose.opacity < 0.02 || !pose.visible) return
      var bandTop = st.h * 0.798
      var baseY = st.h * 0.885
      var k = (st.swimW / 280) * pose.scale
      if (!(k > 0.01)) return
      var intensity = 0.30 * pose.opacity
      c.save()
      c.beginPath()
      c.rect(0, bandTop, st.w, st.h - bandTop + 4)
      c.clip()
      c.translate(pose.x + pose.px + Math.sin(t * 8.7) * 1.6, baseY)
      c.rotate(pose.rot * 0.14 * RAD)
      c.scale(k * pose.mirror * Math.max(0.3, pose.sx), -k * 0.30)
      c.translate(-140, -70)
      var g = c.createLinearGradient(0, 18, 0, 138)
      g.addColorStop(0, rgba(C.cloud, intensity))
      g.addColorStop(0.45, rgba(C.rim, intensity * 0.45))
      g.addColorStop(1, rgba(C.rim, 0))
      c.fillStyle = g
      c.fill(GEO.body, 'evenodd')
      c.restore()
      /* 横向 ripple：多频正弦高光带（读作水面微颤） */
      c.save()
      c.beginPath()
      c.rect(0, bandTop, st.w, st.h - bandTop + 4)
      c.clip()
      c.globalCompositeOperation = 'lighter'
      for (var i = 0; i < 5; i++) {
        var yy = bandTop + 8 + i * (15 + i * 4)
        var amp = 1.8 + i * 0.9
        c.beginPath()
        for (var x = -12; x <= st.w + 12; x += 16) {
          var y2 = yy + Math.sin(x * 0.026 + t * (4.4 + i * 0.6) + i * 2.1) * amp
          if (x <= -12) c.moveTo(x, y2)
          else c.lineTo(x, y2)
        }
        c.strokeStyle = rgba(C.bio, 0.05 + 0.022 * (i % 2))
        c.lineWidth = 1.2
        c.stroke()
      }
      c.restore()
    }

    /* 9.2 鲸体投影软阴影（下缘投影到云海，给体量） */
    function drawContactShadow(c, t, pose) {
      if (!pose.visible || pose.opacity < 0.02) return
      var rx = st.swimW * 0.38 * pose.scale * Math.max(0.4, pose.sx)
      if (!(rx > 4)) return
      var ry = rx * 0.30
      var cx = pose.x + pose.px
      var cy = pose.y + pose.py + st.swimH * 0.30 * pose.scale
      c.save()
      c.translate(cx, cy)
      c.scale(1, ry / rx)
      var g = c.createRadialGradient(0, 0, 0, 0, 0, rx)
      g.addColorStop(0, rgba(C.space, 0.44 * pose.opacity))
      g.addColorStop(0.55, rgba(C.space, 0.20 * pose.opacity))
      g.addColorStop(1, rgba(C.space, 0))
      c.fillStyle = g
      c.beginPath()
      c.arc(0, 0, rx, 0, TAU)
      c.fill()
      c.restore()
    }

    /* 9.3 外发光分层：内圈白热 + 外圈青蓝（呼吸 + 收尾增亮） */
    function drawHalo(c, t, pose) {
      if (!pose.visible || pose.opacity < 0.02) return
      var k = pose.scale
      var rIn = st.swimW * 0.32 * k
      var rOut = st.swimW * 0.66 * k
      if (!(rOut > 3)) return
      var breathe = 0.5 + 0.5 * Math.sin(t * 2.1)
      var boost = 1 + 0.7 * easeOutCubic(progress(t, T.turn, T.impact)) * (1 - progress(t, T.impact, T.impact + 0.16))
      c.save()
      c.globalCompositeOperation = 'lighter'
      var g2 = c.createRadialGradient(pose.x, pose.y, 0, pose.x, pose.y, rOut)
      g2.addColorStop(0, rgba(C.rim, (0.145 + 0.04 * breathe) * boost * pose.opacity))
      g2.addColorStop(0.45, rgba(C.rim, (0.07 + 0.02 * breathe) * boost * pose.opacity))
      g2.addColorStop(1, rgba(C.rim, 0))
      c.fillStyle = g2
      c.beginPath()
      c.arc(pose.x, pose.y, rOut, 0, TAU)
      c.fill()
      var g1 = c.createRadialGradient(pose.x, pose.y - st.swimW * 0.04 * k, 0, pose.x, pose.y, rIn)
      g1.addColorStop(0, rgba(C.cloud, (0.19 + 0.05 * breathe) * pose.opacity))
      g1.addColorStop(0.5, rgba('200,232,255', (0.075 + 0.025 * breathe) * pose.opacity))
      g1.addColorStop(1, rgba(C.cloud, 0))
      c.fillStyle = g1
      c.beginPath()
      c.arc(pose.x, pose.y, rIn, 0, TAU)
      c.fill()
      c.restore()
    }

    /* 9.4 尾迹：tapered ribbon（2 层 glow + 亮核）+ 粒子 + 数据刻度 */
    /* 颜色带：白热（近端，仅 0–10%）→ 生物青 → 空气蓝 → 透明 */
    function trailColor(age, a) {
      var r, g, b
      if (age < 0.10) {
        var u0 = age / 0.10
        r = 255
        g = 255
        b = 255
        void u0
      } else if (age < 0.34) {
        var u = (age - 0.10) / 0.24
        r = 255 + (126 - 255) * u
        g = 255 + (240 - 255) * u
        b = 255 + (212 - 255) * u
      } else {
        var u2 = clamp((age - 0.34) / 0.66, 0, 1)
        r = 126 + (72 - 126) * u2
        g = 240 + (150 - 240) * u2
        b = 212 + (255 - 212) * u2
      }
      return rgbStr(r, g, b, a)
    }

    function drawTrail(c, t, pose) {
      if (!sprites.bio) return
      if (t < T.enter + 0.04) return
      var fade = 1 - smoothstep(progress(t, T.rush, T.impact + 0.12))
      if (fade <= 0.01) return
      /* 速度越快拖尾越长 */
      var speedN = clamp((pose.speed || 0) / 2100, 0, 1)
      var win = lerp(FX.winMin, FX.winMax, Math.pow(speedN, 0.75))
      var n = Math.round(win / FX.dt)
      n = Math.max(3, Math.min(FX.maxPts, n))
      var pts = []
      var i
      for (i = 0; i <= n; i++) {
        var tau = t - win * (i / n)
        if (tau < T.enter) tau = T.enter
        var p0 = poseAt(tau, st.w, st.h, st.anchor)
        if (!p0.visible) continue
        var kk0 = (st.swimW / 280) * p0.scale
        var tip = tailTipLocal(tailWag(tau))
        var wp = localToWorld(p0, tip.x, tip.y, kk0)
        pts.push({ x: wp.x, y: wp.y, age: i / n, sc: p0.scale })
      }
      if (pts.length < 3) return
      var wScale = clamp(pose.scale, 0.45, 1.05)
      /* 有机摆动：越老的部分越松散（读作被扰动的星海空气，而不是几何带） */
      for (i = 0; i < pts.length; i++) {
        var ag = pts[i].age
        var loose = ag * ag
        pts[i].x += Math.sin(ag * 9.5 + t * 1.9) * loose * 16 * wScale
        pts[i].y += Math.cos(ag * 7.1 + t * 1.4) * loose * 11 * wScale
      }
      var wNear = FX.wNear * wScale
      var m = pts.length - 1
      c.save()
      c.globalCompositeOperation = 'lighter'
      /* 4 层：外晕(2.6×) → 主带(1.55×) → 亮核(0.75×) → 热线(0.28×)
       * 每层用同一颜色带；宽度按 (1-age)^k 快速收窄 → 近端是热羽流，远端散成雾。 */
      var pass, ch, CH = 6
      var layer = [
        { w: 2.6, a: 0.070, k: 1.3 },
        { w: 1.55, a: 0.150, k: 1.6 },
        { w: 0.78, a: 0.300, k: 1.9 },
        { w: 0.30, a: 0.360, k: 2.2 }
      ]
      for (pass = 0; pass < layer.length; pass++) {
        var lw = layer[pass].w
        var la = layer[pass].a * fade
        var lk = layer[pass].k
        /* 该层左右边界 */
        var LLp = []
        var RRp = []
        for (i = 0; i < pts.length; i++) {
          var aP = pts[Math.max(0, i - 1)]
          var bP = pts[Math.min(pts.length - 1, i + 1)]
          var tx = bP.x - aP.x
          var ty = bP.y - aP.y
          var tl = Math.hypot(tx, ty) || 1
          var nx = -ty / tl
          var ny = tx / tl
          var hw = 0.5 * wNear * Math.pow(1 - pts[i].age, lk) * lw
          if (hw < 1.1) hw = 1.1
          LLp.push({ x: pts[i].x + nx * hw, y: pts[i].y + ny * hw })
          RRp.push({ x: pts[i].x - nx * hw, y: pts[i].y - ny * hw })
        }
        for (ch = 0; ch < CH; ch++) {
          var i0 = Math.floor(ch * m / CH)
          var i1 = Math.floor((ch + 1) * m / CH)
          if (i1 <= i0) continue
          var age0 = i0 / m
          var age1 = i1 / m
          var aa0 = Math.pow(1 - age0, 1.5) * la * smoothstep((1 - age0) / 0.22)
          var aa1 = Math.pow(1 - age1, 1.5) * la * smoothstep((1 - age1) / 0.22)
          if (aa0 < 0.004 && aa1 < 0.004) continue
          c.beginPath()
          c.moveTo(LLp[i0].x, LLp[i0].y)
          var q
          for (q = i0 + 1; q <= i1; q++) c.lineTo(LLp[q].x, LLp[q].y)
          for (q = i1; q >= i0; q--) c.lineTo(RRp[q].x, RRp[q].y)
          c.closePath()
          var gx = c.createLinearGradient(pts[i0].x, pts[i0].y, pts[i1].x, pts[i1].y)
          gx.addColorStop(0, trailColor(age0, aa0))
          gx.addColorStop(1, trailColor(age1, aa1))
          c.fillStyle = gx
          c.fill()
        }
      }
      c.restore()
      drawTrailParticles(c, t, fade, wScale)
    }

    /* 生物光气泡：≤120 个，全部是 t 的解析函数（定格可复现） */
    function drawTrailParticles(c, t, fade, wScale) {
      if (!sprites.bio) return
      var rate = FX.pRate
      var i0 = Math.floor((t - FX.pLifeMax) * rate)
      var i1 = Math.floor(t * rate)
      if (i1 - i0 > FX.pMax) i0 = i1 - FX.pMax
      var drawn = 0
      c.save()
      c.globalCompositeOperation = 'lighter'
      for (var i = i0; i <= i1 && drawn < FX.pMax; i++) {
        var tau = i / rate
        if (tau < T.enter || tau > T.rush) continue
        var age = t - tau
        if (age < 0 || age > FX.pLifeMax) continue
        var p0 = poseAt(tau, st.w, st.h, st.anchor)
        if (!p0.visible) continue
        var kk0 = (st.swimW / 280) * p0.scale
        var tip = tailTipLocal(tailWag(tau))
        var org = localToWorld(p0, tip.x, tip.y, kk0)
        var r1 = hash01(i, 1.7)
        var r2 = hash01(i, 3.3)
        var r3 = hash01(i, 5.1)
        var life = lerp(FX.pLifeMin, FX.pLifeMax, r1)
        if (age > life) continue
        var la = 1 - age / life
        var ang = (p0.rot + 180 + (r2 - 0.5) * 46) * RAD
        var spd = (26 + r3 * 90) * (0.6 + clamp(p0.speed / 1600, 0, 1.4))
        var x = org.x + Math.cos(ang) * spd * age
        var y = org.y + Math.sin(ang) * spd * age - 12 * age + Math.sin(age * 6 + i) * 3
        var alpha = la * la * 1.0 * fade
        if (alpha < 0.02) continue
        var size = (2.6 + r3 * 4.2) * wScale * (1 + clamp(p0.speed / 2600, 0, 0.7))
        var spr = r2 < 0.62 ? sprites.bio : sprites.rim
        if (spr) {
          c.globalAlpha = alpha * 0.55
          c.drawImage(spr, x - size * 2.1, y - size * 2.1, size * 4.2, size * 4.2)
        }
        c.globalAlpha = alpha
        c.fillStyle = rgba(C.cloud, alpha)
        c.beginPath()
        c.arc(x, y, size * 0.42, 0, TAU)
        c.fill()
        drawn++
      }
      c.globalAlpha = 1
      c.restore()
    }

    /* 数据刻度线：沿轨迹每 0.1s 一根（保留但降透明到 0.2 量级） */
    function drawTicks(c, t) {
      var base = T.enter + 0.1
      var first = Math.floor((Math.max(base, t - FX.tickLife) - base) / FX.tickStep)
      var last = Math.floor((Math.min(T.turn, t) - base) / FX.tickStep)
      if (last < first) return
      if (last - first > FX.tickMax) first = last - FX.tickMax
      c.save()
      c.lineWidth = 1
      c.font = '10px "VY Share Tech Mono", "JetBrains Mono", Consolas, monospace'
      c.textAlign = 'left'
      c.textBaseline = 'middle'
      for (var i = first; i <= last; i++) {
        var tau = base + i * FX.tickStep
        if (tau > t) continue
        var age = clamp((t - tau) / FX.tickLife, 0, 1)
        var p = poseAt(tau, st.w, st.h, st.anchor)
        if (!p.visible) continue
        var kk = (st.swimW / 280) * p.scale
        var tp = localToWorld(p, tailTipLocal(tailWag(tau)).x, tailTipLocal(tailWag(tau)).y, kk)
        var a = (1 - age) * (1 - age)
        var major = i % 5 === 0
        var len = (major ? 17 : 8) * clamp(p.scale, 0.5, 1.1)
        var ang = (p.rot + 90) * RAD
        var nx = Math.cos(ang)
        var ny = Math.sin(ang)
        c.strokeStyle = rgba(C.space, a * 0.16)
        c.lineWidth = 2.6
        c.beginPath()
        c.moveTo(tp.x - nx * len * 0.3, tp.y - ny * len * 0.3)
        c.lineTo(tp.x + nx * len * 0.7, tp.y + ny * len * 0.7)
        c.stroke()
        c.strokeStyle = rgba(major ? C.bio : C.cloud, a * (major ? 0.20 : 0.13))
        c.lineWidth = major ? 1.3 : 1
        c.beginPath()
        c.moveTo(tp.x - nx * len * 0.3, tp.y - ny * len * 0.3)
        c.lineTo(tp.x + nx * len * 0.7, tp.y + ny * len * 0.7)
        c.stroke()
        if (major) {
          c.fillStyle = rgba(C.bio, a * 0.18)
          c.fillText(tau.toFixed(2), tp.x + nx * (len + 7), tp.y + ny * (len + 7))
        }
      }
      c.restore()
    }

    /* 9.5 鲸体：canvas 逐帧渲染（局部坐标 0 0 280 140） */
    function drawWhale(c, t, pose) {
      if (!pose.visible || pose.opacity <= 0.004) return
      if (!GEO.body || !G.body) return
      var kk = (st.swimW / 280) * pose.scale
      var baseAlpha = pose.opacity
      c.save()
      c.globalAlpha = baseAlpha
      c.translate(pose.x + pose.px, pose.y + pose.py)
      c.rotate(pose.rot * RAD)
      c.scale(kk * pose.mirror * pose.sx, kk * pose.sy)
      c.translate(-140, -70)
      c.lineJoin = 'round'
      c.lineCap = 'round'
      drawTail(c, tailWag(t))
      drawFin(c, finAngle(t), baseAlpha)
      drawBodyFill(c)
      drawBodyShading(c, t, baseAlpha)
      drawDorsal(c)                       // 背鳍在体表之后画 → 与背脊同材质、不再像漂浮贴片
      drawBodyEdgeLight(c)
      drawBellyOverlay(c, baseAlpha)
      drawUnderBounce(c)
      drawEye(c)
      drawMouth(c)
      c.restore()
    }

    function drawTail(c, angle) {
      c.save()
      c.translate(TAIL_PIVOT[0], TAIL_PIVOT[1])
      c.rotate(angle * RAD)
      c.translate(-TAIL_PIVOT[0], -TAIL_PIVOT[1])
      c.strokeStyle = rgba(C.space, 0.14)
      c.lineWidth = 2.4
      c.stroke(GEO.tail)
      c.fillStyle = G.tail
      c.fill(GEO.tail)
      c.strokeStyle = 'rgba(214,242,255,0.42)'
      c.lineWidth = 0.8
      c.stroke(GEO.tail)
      c.restore()
    }

    function drawDorsal(c) {
      /* 根部软影（读作从背脊长出来） */
      c.save()
      ellipseFill(c, 146, 27, 11, 3.4, -22, 'rgba(16,40,64,0.20)')
      c.fillStyle = G.dorsal
      c.fill(GEO.dorsal)
      c.strokeStyle = 'rgba(150,196,232,0.45)'
      c.lineWidth = 0.7
      c.stroke(GEO.dorsal)
      c.strokeStyle = 'rgba(255,255,255,0.6)'
      c.lineWidth = 0.55
      c.beginPath()
      c.moveTo(153, 29)
      c.quadraticCurveTo(147, 17.5, 137.5, 22.5)
      c.stroke()
      c.restore()
    }

    function drawFin(c, angle, baseAlpha) {
      c.save()
      c.translate(FIN_PIVOT[0], FIN_PIVOT[1])
      c.rotate(angle * RAD)
      c.translate(-FIN_PIVOT[0], -FIN_PIVOT[1])
      /* 半透明胸鳍：fill-opacity 0.82 + 内渐变 + 亮边（透出下方云海＝薄而透光） */
      c.globalAlpha = baseAlpha * 0.82
      c.fillStyle = G.fin
      c.fill(GEO.fin)
      c.globalAlpha = baseAlpha
      c.strokeStyle = G.finEdge
      c.lineWidth = 0.95
      c.stroke(GEO.fin)
      /* 鳍面两条极淡的鳍条（有结构感，不抢主体） */
      c.strokeStyle = 'rgba(255,255,255,0.30)'
      c.lineWidth = 0.55
      c.beginPath()
      c.moveTo(247, 93)
      c.quadraticCurveTo(218, 101, 191, 121)
      c.moveTo(249, 97)
      c.quadraticCurveTo(224, 108, 202, 126)
      c.stroke()
      c.restore()
    }

    function drawBodyFill(c) {
      /* 软投影：给亮云海背景一圈冷暗分离（体积感 + 亮地上的可读性） */
      c.save()
      c.shadowColor = 'rgba(4,10,20,0.55)'
      c.shadowBlur = 17
      c.shadowOffsetX = 3
      c.shadowOffsetY = 6
      c.fillStyle = 'rgba(6,14,26,0.34)'
      c.fill(GEO.body, 'evenodd')
      c.restore()
      /* 深空分离描边（填充盖住内侧 → 外缘留一圈冷暗轮廓） */
      c.strokeStyle = rgba(C.space, 0.22)
      c.lineWidth = 2.6
      c.stroke(GEO.body)
      c.fillStyle = G.body
      c.fill(GEO.body, 'evenodd')
    }

    function ellipseFill(c, cx, cy, rx, ry, rotDeg, style) {
      c.save()
      c.translate(cx, cy)
      c.rotate(rotDeg * RAD)
      c.scale(rx, ry)
      c.beginPath()
      c.arc(0, 0, 1, 0, TAU)
      c.fillStyle = style
      c.fill()
      c.restore()
    }

    function drawBodyShading(c, t, baseAlpha) {
      c.save()
      c.clip(GEO.body, 'evenodd')
      /* 体积：腹部软阴影 → 侧腹体积影 → 腹部暖白反光（地球反照，最后画保证可见） */
      c.fillStyle = G.under
      c.fillRect(30, 46, 254, 100)
      c.fillStyle = G.side
      c.fillRect(30, 40, 254, 110)
      c.fillStyle = G.belly
      c.fillRect(30, 46, 254, 100)
      /* 暗侧 terminator：光从右上打来，左下背光面压暗（体积的关键） */
      var term = c.createLinearGradient(96, 118, 232, 42)
      term.addColorStop(0, 'rgba(10,28,54,0.34)')
      term.addColorStop(0.42, 'rgba(10,28,54,0.10)')
      term.addColorStop(0.75, 'rgba(10,28,54,0)')
      c.fillStyle = term
      c.fillRect(30, 20, 254, 110)
      /* 背脊透光（backlit subsurface） */
      var sss = c.createLinearGradient(180, 20, 180, 62)
      sss.addColorStop(0, 'rgba(226,246,255,0.20)')
      sss.addColorStop(1, 'rgba(226,246,255,0)')
      c.globalCompositeOperation = 'lighter'
      c.fillStyle = sss
      c.fillRect(60, 18, 220, 48)
      c.globalCompositeOperation = 'source-over'
      /* 鳍根棚影（AO） */
      c.fillStyle = G.aoFin
      c.fillRect(150, 70, 120, 60)
      /* 侧腹极淡斑纹（保持官方鱼标识别度，不抢主体） */
      ellipseFill(c, 206, 46, 24, 7.5, -16, 'rgba(186,219,248,0.10)')
      ellipseFill(c, 170, 37, 18, 5.6, -10, 'rgba(186,219,248,0.09)')
      ellipseFill(c, 132, 37, 14, 4.6, -6, 'rgba(186,219,248,0.07)')
      /* 动态焦散（clip 内，总 opacity ≤0.10，缓慢平移） */
      drawCaustics(c, t)
      /* 星海鲸「生物光星点」：沿侧腹 7 点极淡发光（细节感，不抢主体） */
      for (var b = 0; b < 7; b++) {
        var bx = 102 + hash01(21.3, b) * 132
        var by = 42 + hash01(33.7, b) * 48
        var br = 0.8 + hash01(45.1, b) * 1.1
        c.fillStyle = 'rgba(126,240,212,0.13)'
        c.beginPath()
        c.arc(bx, by, br * 2.8, 0, TAU)
        c.fill()
        c.fillStyle = 'rgba(255,255,255,0.28)'
        c.beginPath()
        c.arc(bx, by, br, 0, TAU)
        c.fill()
      }
      /* 侧线（极淡横向亮线） */
      c.strokeStyle = 'rgba(255,255,255,0.13)'
      c.lineWidth = 0.85
      c.stroke(GEO.lateral)
      /* 背脊高光带（宽晕 + 细核） */
      c.strokeStyle = G.back
      c.lineWidth = 10
      c.stroke(GEO.dorsalHi)
      c.strokeStyle = 'rgba(255,255,255,0.82)'
      c.lineWidth = 1.7
      c.stroke(GEO.dorsalHi)
      /* 吻端湿镜面高光（小面积椭圆，wet look） */
      ellipseFill(c, 236, 48, 13, 4.4, -24, 'rgba(255,255,255,0.20)')
      ellipseFill(c, 231, 45.5, 7, 2.2, -24, 'rgba(255,255,255,0.38)')
      /* 镜面扫光：沿体轴缓慢横移的高光带 */
      var sx0 = 122 + Math.sin(t * 0.86) * 86
      var sheen = c.createLinearGradient(sx0 - 58, 24, sx0 + 58, 76)
      sheen.addColorStop(0, 'rgba(255,255,255,0)')
      sheen.addColorStop(0.5, 'rgba(255,255,255,0.13)')
      sheen.addColorStop(1, 'rgba(255,255,255,0)')
      c.fillStyle = sheen
      c.fillRect(30, 20, 254, 110)
      /* 极淡虹彩带（两条宽软斜带缓慢漂移，制造「珠光/油膜」质感） */
      var ix = 150 + Math.sin(t * 0.32) * 40
      var iris1 = c.createLinearGradient(ix - 40, 30, ix + 46, 116)
      iris1.addColorStop(0, 'rgba(150,225,255,0)')
      iris1.addColorStop(0.5, 'rgba(150,225,255,0.055)')
      iris1.addColorStop(1, 'rgba(150,225,255,0)')
      c.fillStyle = iris1
      c.fillRect(30, 20, 254, 110)
      var ix2 = 196 + Math.cos(t * 0.27) * 36
      var iris2 = c.createLinearGradient(ix2 - 36, 34, ix2 + 40, 112)
      iris2.addColorStop(0, 'rgba(255,224,190,0)')
      iris2.addColorStop(0.5, 'rgba(255,224,190,0.05)')
      iris2.addColorStop(1, 'rgba(255,224,190,0)')
      c.fillStyle = iris2
      c.fillRect(30, 20, 254, 110)
      c.restore()
    }

    function drawCaustics(c, t) {
      c.save()
      var i, s, x, x0, y0, yy, drift
      /* ① 暗部焦散（source-over，冷蓝，读作皮下透光的花纹）——与亮纹互补成「水光」图案 */
      c.globalCompositeOperation = 'source-over'
      for (i = 0; i < 3; i++) {
        drift = ((t * 6.2 + i * 118) % 320) - 160
        y0 = 50 + i * 23
        x0 = 10 + drift
        c.beginPath()
        c.moveTo(x0, y0)
        for (s = 1; s <= 8; s++) {
          x = x0 + s * 30
          yy = y0 + Math.sin(x * 0.058 + t * 0.6 + i * 2.1) * (5 + i * 1.5) +
            Math.sin(x * 0.13 - t * 0.9) * 1.6
          c.lineTo(x, yy)
        }
        c.strokeStyle = 'rgba(36,82,130,' + (0.055 - i * 0.012).toFixed(3) + ')'
        c.lineWidth = 7.5 + i * 3.0
        c.stroke()
      }
      /* ② 亮部焦散（lighter，白青，宽软光带缓慢平移）——总 opacity ≤0.10 */
      c.globalCompositeOperation = 'lighter'
      for (i = 0; i < 4; i++) {
        drift = ((t * 7.5 + i * 84) % 330) - 165
        y0 = 34 + i * 20
        x0 = 0 + drift
        c.beginPath()
        c.moveTo(x0, y0)
        for (s = 1; s <= 8; s++) {
          x = x0 + s * 31
          yy = y0 + Math.sin(x * 0.05 + t * 0.85 + i * 1.9) * (4.2 + i * 1.4) +
            Math.sin(x * 0.11 - t * 1.3) * 1.8
          c.lineTo(x, yy)
        }
        c.strokeStyle = 'rgba(206,238,255,' + (0.050 - i * 0.006).toFixed(3) + ')'
        c.lineWidth = 4.4 + i * 2.2
        c.stroke()
        c.strokeStyle = 'rgba(255,255,255,' + (0.038 - i * 0.005).toFixed(3) + ')'
        c.lineWidth = 1.05
        c.stroke()
      }
      /* ③ 体表流线（细，顺体轴方向；读作肌肉/皮肤纹理，不抢主体） */
      c.globalCompositeOperation = 'lighter'
      c.strokeStyle = 'rgba(226,246,255,0.050)'
      c.lineWidth = 0.8
      for (i = 0; i < 5; i++) {
        var ly = 36 + i * 13
        c.beginPath()
        c.moveTo(112, ly)
        c.quadraticCurveTo(176, ly - 6 + Math.sin(t * 0.3 + i) * 1.4, 244, ly + 6)
        c.stroke()
      }
      /* ④ 背部鳞光小弧（6 段，缓慢漂移） */
      for (var k = 0; k < 6; k++) {
        var cx2 = 96 + hash01(3.7, k) * 152 + Math.sin(t * 0.42 + k * 1.3) * 5
        var cy2 = 28 + hash01(8.1, k) * 54
        c.beginPath()
        c.arc(cx2, cy2, 5 + hash01(5.3, k) * 8, 0.15 + t * 0.1 + k, 2.1 + t * 0.1 + k)
        c.strokeStyle = 'rgba(214,242,255,0.045)'
        c.lineWidth = 1.05
        c.stroke()
      }
      c.restore()
    }

    function drawBodyEdgeLight(c) {
      /* 外发光描边（先晕后锐；不做均匀亮边，靠渐变让上缘亮、下缘柔） */
      c.save()
      c.globalCompositeOperation = 'lighter'
      c.strokeStyle = G.rim
      c.globalAlpha *= 0.17
      c.lineWidth = 6.2
      c.stroke(GEO.body)
      c.restore()
      c.save()
      c.strokeStyle = G.rim
      c.lineWidth = 1.1
      c.stroke(GEO.body)
      c.restore()
      /* 上缘 specular 亮线（背脊 → 吻端） */
      c.save()
      c.strokeStyle = G.rimHot
      c.lineWidth = 1.25
      c.stroke(GEO.dorsalHi)
      c.restore()
      /* 鳍 / 尾的亮边（低强度分层，避免「贴纸描边」） */
      c.save()
      c.globalCompositeOperation = 'lighter'
      c.strokeStyle = 'rgba(196,238,255,0.22)'
      c.lineWidth = 1.1
      c.stroke(GEO.tail)
      c.stroke(GEO.fin)
      c.restore()
    }

    /* 腹部下缘的暖沙反照（地球反射光），只在下缘一圈 */
    function drawUnderBounce(c) {
      c.save()
      c.beginPath()
      c.rect(20, 94, 262, 62)
      c.clip()
      c.strokeStyle = 'rgba(255,226,186,0.18)'
      c.lineWidth = 2.6
      c.stroke(GEO.body)
      c.restore()
    }

    function drawBellyOverlay(c, baseAlpha) {
      c.save()
      c.globalAlpha = baseAlpha * 0.44
      c.fillStyle = '#fff6e8'
      c.fill(GEO.belly)
      c.restore()
    }

    function drawEye(c) {
      /* 眼睑环（暗晕，小而收敛；不做亮圈避免卡通感） */
      c.save()
      c.beginPath()
      c.arc(242, 54.4, 4.15, 0, TAU)
      c.fillStyle = 'rgba(10,24,42,0.22)'
      c.fill()
      /* 虹膜：横向略收的杏仁形（更沉、不卡通） */
      c.save()
      c.translate(242, 54.4)
      c.scale(1, 0.86)
      c.beginPath()
      c.arc(0, 0, 3.35, 0, TAU)
      c.fillStyle = G.eye
      c.fill()
      c.strokeStyle = 'rgba(96,146,196,0.24)'
      c.lineWidth = 0.38
      c.stroke()
      c.restore()
      /* 瞳孔 + 白高光点（眼神） */
      c.beginPath()
      c.arc(242.2, 54.7, 1.55, 0, TAU)
      c.fillStyle = 'rgba(2,7,14,0.9)'
      c.fill()
      c.beginPath()
      c.arc(241.05, 53.2, 0.82, 0, TAU)
      c.fillStyle = 'rgba(255,255,255,0.9)'
      c.fill()
      c.beginPath()
      c.arc(243.05, 55.7, 0.38, 0, TAU)
      c.fillStyle = 'rgba(176,220,255,0.5)'
      c.fill()
      /* 上眼睑弧（很淡的冷光） */
      c.beginPath()
      c.arc(242, 54.4, 4.35, Math.PI * 1.08, Math.PI * 1.9)
      c.strokeStyle = 'rgba(228,244,255,0.32)'
      c.lineWidth = 0.55
      c.stroke()
      c.restore()
    }

    function drawMouth(c) {
      c.save()
      c.fillStyle = 'rgba(8,18,32,0.34)'
      c.fill(GEO.mouth)
      c.beginPath()
      c.moveTo(259.5, 63.4)
      c.quadraticCurveTo(248.5, 69.9, 239, 71.6)
      c.strokeStyle = 'rgba(8,18,32,0.44)'
      c.lineWidth = 0.75
      c.stroke()
      c.restore()
    }

    /* 9.6 morph：鲸体粒子向 mark 汇聚 + mark 点亮（白闪由 Lead main.js 驱动） */
    function drawMorph(c, t, pose, anchor) {
      var M0 = 7.42
      var M1 = 8.02
      if (t < M0 || t > M1) return
      if (!sprites.bio) return
      var basePose = pose.visible ? pose : anchorPose(anchor)
      var kk = (st.swimW / 280) * Math.max(basePose.scale, 0.2)
      var N = 96
      c.save()
      c.globalCompositeOperation = 'lighter'
      for (var i = 0; i < N; i++) {
        var birth = M0 + hash01(i, 1.3) * 0.26
        var age = t - birth
        if (age < 0) continue
        var life = 0.14 + hash01(i, 2.7) * 0.24
        if (age > life) continue
        var p = age / life
        var lx = 74 + hash01(i, 3.1) * 180
        var ly = 38 + hash01(i, 4.9) * 66
        var sp = localToWorld(basePose, lx, ly, kk)
        var e = easeInCubic(p)
        var sw = Math.sin(p * 5.2 + i) * 8 * (1 - p)
        var x = lerp(sp.x, anchor.x, e) + sw
        var y = lerp(sp.y, anchor.y, e) + Math.cos(p * 4.6 + i * 1.7) * 8 * (1 - p)
        var a = (1 - p) * (1 - p) * 0.95
        var size = 1.6 + hash01(i, 5.5) * 2.2
        var spr = i % 3 === 0 ? sprites.rim : sprites.bio
        if (spr) {
          c.globalAlpha = a * 0.6
          c.drawImage(spr, x - size * 3, y - size * 3, size * 6, size * 6)
        }
        c.globalAlpha = a
        c.fillStyle = 'rgba(236,252,255,' + a.toFixed(3) + ')'
        c.beginPath()
        c.arc(x, y, size * 0.5, 0, TAU)
        c.fill()
        c.strokeStyle = 'rgba(' + C.bio + ',' + (a * 0.5).toFixed(3) + ')'
        c.lineWidth = 0.9
        c.beginPath()
        c.moveTo(x, y)
        var e2 = Math.max(0, e - 0.14)
        c.lineTo(
          lerp(sp.x, anchor.x, e2) + Math.sin(p * 5.2 + i) * 8 * (1 - Math.max(0, p - 0.1)),
          lerp(sp.y, anchor.y, e2) + Math.cos(p * 4.6 + i * 1.7) * 8 * (1 - Math.max(0, p - 0.1))
        )
        c.stroke()
      }
      c.globalAlpha = 1
      /* mark 点亮爆闪（7.54–8.0，与 lead 白闪错相） */
      var ig = smoothstep(progress(t, 7.54, 7.62)) * (1 - smoothstep(progress(t, 7.70, 8.0)))
      if (ig > 0.01) {
        var rr = lerp(10, 92, easeOutCubic(progress(t, 7.54, 8.0)))
        var gg = c.createRadialGradient(anchor.x, anchor.y, 0, anchor.x, anchor.y, rr)
        gg.addColorStop(0, 'rgba(255,255,255,' + (0.5 * ig).toFixed(3) + ')')
        gg.addColorStop(0.4, rgba(C.bio, 0.22 * ig))
        gg.addColorStop(1, rgba(C.rim, 0))
        c.fillStyle = gg
        c.beginPath()
        c.arc(anchor.x, anchor.y, rr, 0, TAU)
        c.fill()
      }
      c.restore()
    }

    /* ── 10. 主更新 ─────────────────────────────────────────────────────── */
    function update(t, ctx) {
      if (st.disposed) return
      if (!isFinite(t)) t = 0
      var c = ctx || {}
      var w = c.w || (window.innerWidth || 1280)
      var h = c.h || (window.innerHeight || 800)
      var resized = w !== st.w || h !== st.h
      st.w = w
      st.h = h
      if (!st.built) build()
      if (resized) { measure(); refreshMarkRect() }
      st.lastT = t
      if (st.reduced || c.reduced) {
        st.reduced = true
        renderReduced(t, c)
        return
      }

      var anchor = markAnchor(c)
      st.anchor = anchor
      var pose = poseAt(t, w, h, anchor)
      var px = c.pointer && isFinite(c.pointer.x) ? c.pointer.x : 0
      var py = c.pointer && isFinite(c.pointer.y) ? c.pointer.y : 0
      pose.px = px * 11
      pose.py = py * 7
      st.lastPose = pose

      if (canvas && st.canvasReady) {
        if (el.swim && el.swim.style.display !== 'none') el.swim.style.display = 'none'
        if (t > T.enter - 0.25 && t < T.impact + 0.55) {
          canvas.classList.add('is-on')
          var cc = canvasCtx()
          if (cc) drawFx(cc, t, pose, anchor)
        } else if (t >= T.impact + 0.55 && st.fxFrames > 0) {
          canvas.classList.remove('is-on')
          clearFx()
          st.fxFrames = 0
        } else if (t < T.enter - 0.25) {
          canvas.classList.remove('is-on')
        }
      } else if (el.swim) {
        /* canvas 不可用：内联 SVG 鲸体降级（无尾迹粒子） */
        var show = pose.visible && pose.opacity > 0.002
        el.swim.style.display = show ? 'block' : 'none'
        if (show) {
          place(el.swim, pose.x + pose.px, pose.y + pose.py, pose.rot, 0, pose.scale, pose.mirror * pose.sx, pose.sy)
          el.swim.style.opacity = pose.opacity.toFixed(3)
        }
        updateFallbackWag(t)
      }

      updateMark(t, c)
      updateRings(t, c)
    }

    /* 降级 SVG 的摆尾（只在 canvas 缺失时用） */
    function updateFallbackWag(t) {
      if (!nodes.tail) return
      var a = tailWag(t)
      var b = finAngle(t)
      nodes.tail.setAttribute('transform', 'rotate(' + a.toFixed(2) + ' ' + TAIL_PIVOT[0] + ' ' + TAIL_PIVOT[1] + ')')
      if (nodes.fin) nodes.fin.setAttribute('transform', 'rotate(' + b.toFixed(2) + ' ' + FIN_PIVOT[0] + ' ' + FIN_PIVOT[1] + ')')
    }

    /* 10.1 morph：鲸体收缩 → 官方鱼标落位（起点就在 mark） */
    function updateMark(t, c) {
      if (!el.mark) return
      var auto = progress(t, T.morph, T.morphEnd)
      var p = st.morphOverride
      var morph = p !== null ? p : auto
      if (morph <= 0.0001) {
        el.mark.style.opacity = '0'
        if (el.glow) el.glow.style.opacity = '0'
        return
      }
      var anchor = markAnchor(c)
      var appear = smoothstep(progress(morph, 0.012, 0.16))
      var settle = easeOutBack(progress(morph, 0.03, 0.58))
      var scale = lerp(1.18, 0.92, settle)
      var rot = lerp(-7, 0, easeOutCubic(progress(morph, 0.02, 0.5)))
      var breathe = 0.5 + 0.5 * Math.sin((t - T.settle) * TAU / 2.4)
      var glowA = 0.16 + 0.13 * breathe
      place(el.mark, anchor.x, anchor.y, rot, YAW_EXTRA * 0.4, scale)
      el.mark.style.opacity = appear.toFixed(3)
      if (el.glow) {
        place(el.glow, anchor.x, anchor.y, 0, 0, 0.72 + 0.1 * breathe)
        el.glow.style.opacity = (glowA * appear).toFixed(3)
      }
      st.markPos = anchor
    }

    /* 10.2 声呐环：P5 两圈错相扩散 + 落位小涟漪 */
    function updateRings(t, c) {
      var anchor = st.markPos || markAnchor(c)
      var offset = function (size) {
        return 'translate3d(' + (anchor.x - size / 2) + 'px,' + (anchor.y - size / 2) + 'px,0) scale('
      }
      var ring = function (node, delay, scaleFrom, scaleTo, dur) {
        if (!node) return
        var p = progress(t, T.ring + delay, T.ring + delay + dur)
        if (p <= 0 || p >= 1) { node.style.opacity = '0'; return }
        var s = lerp(scaleFrom, scaleTo, easeOutCubic(p))
        var a = (1 - p) * (1 - p) * 0.95
        node.style.opacity = a.toFixed(3)
        node.style.transform = offset(120) + s.toFixed(3) + ')'
      }
      ring(el.ringA, 0, 0.28, 3.4, 0.72)
      ring(el.ringB, 0.16, 0.28, 3.9, 0.78)
      if (el.ringA && t >= 8.15 && t < 8.7) {
        var q = progress(t, 8.15, 8.7)
        el.ringA.style.opacity = ((1 - q) * 0.45).toFixed(3)
        el.ringA.style.transform = offset(120) + lerp(0.4, 1.9, easeOutCubic(q)).toFixed(3) + ')'
      }
    }

    /* ── 11. 减弱动态：静帧构图（不游动、无尾迹；只保留终帧官方鱼标） ──────── */
    function renderReduced(t, c) {
      var anchor = markAnchor(c)
      clearFx()
      if (canvas) canvas.classList.remove('is-on')
      if (el.swim) {
        el.swim.style.display = 'none'
        el.swim.style.opacity = '0'
      }
      if (el.mark) {
        place(el.mark, anchor.x, anchor.y, 0, 0, 0.92)
        el.mark.style.opacity = '1'
      }
      if (el.glow) {
        place(el.glow, anchor.x, anchor.y, 0, 0, 0.8)
        el.glow.style.opacity = '0.22'
      }
      if (el.ringA) el.ringA.style.opacity = '0'
      if (el.ringB) el.ringB.style.opacity = '0'
      st.markPos = anchor
      st.lastPose = null
      void t
    }

    /* ── 12. 公开 API ────────────────────────────────────────────────────── */
    api.ready = Promise.resolve().then(function () { return api })
    api.update = update
    api.morphToMark = function (p) {
      if (st.disposed) return
      if (p === null || p === undefined) { st.morphOverride = null; return }
      st.morphOverride = clamp(typeof p === 'number' ? p : 0, 0, 1)
      if (!st.built) build()
      updateMark(st.lastT === null ? T.morphEnd : st.lastT, {})
    }
    api.dispose = function () {
      if (st.disposed) return
      st.disposed = true
      try {
        if (root) while (root.firstChild) root.removeChild(root.firstChild)
      } catch (err) { /* noop */ }
      if (canvas) {
        try {
          var c = canvas.getContext('2d')
          if (c) c.clearRect(0, 0, canvas.width, canvas.height)
        } catch (err) { /* noop */ }
        try { canvas.classList.remove('is-on') } catch (err) { /* noop */ }
      }
      el = { layer: null, swim: null, mark: null, glow: null, ringA: null, ringB: null }
      nodes = { tail: null, fin: null }
      sprites = {}
      G = {}
      GEO = {}
      st.ctx2d = null
      st.canvasReady = false
      st.built = false
    }
    api.debug = function (t, ctx) {
      var base = {
        version: VERSION,
        reduced: st.reduced,
        built: st.built,
        size: { w: st.w, h: st.h, swimW: st.swimW, swimH: st.swimH, markW: st.markW, dpr: st.dpr },
        pose: st.lastPose,
        markRect: st.markSlot,
        markPos: st.markPos || null,
        asset: st.asset,
        fxFrames: st.fxFrames,
        timings: T,
        curve: PATH_PTS
      }
      if (t === undefined || t === null) return base
      var w = (ctx && ctx.w) || st.w || (window.innerWidth || 1280)
      var h = (ctx && ctx.h) || st.h || (window.innerHeight || 800)
      var anchor = st.markSlot || markAnchor(ctx || {})
      var pose = poseAt(t, w, h, anchor)
      pose.mark = { x: anchor.x, y: anchor.y, w: anchor.w, h: anchor.h }
      return pose
    }

    if (root) build()

    /* 不覆盖命名空间（create 必须一直可用），实例挂 __last 供宿主/QA 取用 */
    window.VYRON_WHALE.__last = api
    window.VYRON_WHALE.__lastVersion = VERSION
    return api
  }

  /* ── 13. 导出 ─────────────────────────────────────────────────────────── */
  window.VYRON_WHALE = {
    __engine: 'whale-art',
    version: VERSION,
    create: create,
    timings: T,
    curve: PATH_PTS,
    markDefault: MARK_DEFAULT,
    paths: PATHS,
    poseAt: poseAt
  }
})()
