# VYRON · 星海鲸航 — 星海动效引擎规格（engine.js）

> Owner：cloud-motion ｜ 契约来源：`docs/design-spec.md` §2、§3（P2–P5）、§7
> 文件：`preview/js/engine.js`（`window.VYRON_ENGINE`）、`preview/css/engine.css`
> 版本：v0.2.0（2026-11-03 ROUND2）｜engine.js sha256 前缀 `3fa36cfbdcce4719`｜engine.css 前缀 `ea6da7bd3ddd940e`（本轮未改）
> ROUND2 新增（用户反馈「让地球动起来」）：云层/地表相对视差、limb 8.4s 呼吸、两段大气光扫、
> 相机横移 + 星点视差、平台反射增强；新增量全部只依赖 t（`?t=` 定格逐帧可复现）。详见 §14。
> 渲染：Canvas 2D（零依赖、无 WebGL、无外部字体/库、不 fetch/XHR），`file://` 与宿主 iframe 双端可跑。

---

## 0. 一句话

在 4K 轨道地球底板上叠一层「活」的星海：**镜头 1.00→1.08→1.12→P5 微爆推近 + 鼠标 ±8px 微视差 + 双层星点闪烁 + 9 团程序化云右→左漂移 + 平台反射扫描 + 大气边缘光呼吸**；所有元素离线生成 sprite、逐帧只做合成，缺素材时降级为程序化深空渐变，reduced 时定格终帧构图。

---

## 1. 对外契约（不变）

```js
const eng = window.VYRON_ENGINE.create({ canvas, hiSrc, midSrc, posterSrc, reduced, quality })
// 返回：
{
  ready: Promise,          // 底板（或兜底）就绪；main.js 在 Promise.all 里等它
  render(t, ctx),          // t = 动画秒（0..9.8，已按 SPEED 缩放）
  resize(w, h),            // CSS 像素尺寸；engine 内部乘 DPR 并做像素预算
  dispose(),
  stats()
}
// ctx（main.js frameCtx）：{ t, phase, phaseProgress, speed, reduced, w, h,
//                            pointer:{x,y,tx,ty}, reveal, bloom, lockup, markRect, ... }
```

- `phase` 用 string（`signal|console|breach|whale|lockup|bloom`）；缺失时 engine 用 t 自推。
- `pointer.x/y` 归一化 [-1,1]；也兼容像素值（|v|>1.5 时按半宽/半高归一化）。
- `speed` 用于把循环氛围动效换成 1x 墙钟：`ambientT = t / clamp(speed, 0.5, 1.5)`，镜头仍走动画秒。
- `reveal` 由 main.js 传入（= CSS `--vy-iris` 进度），**engine 不使用它做遮罩**：开场 iris 由
  `preview/css/splash.css` 的 `.vy-iris`（`--vy-iris` 变量）独立完成，engine 只负责画 plate，
  避免双重遮罩（design-spec §7 口径）。engine 只在 `t < 3.08`（P0/P1）清空画布，把黑场交给
  splash.css / hud.js。
- `quality`：`'auto' | 'high' | 'balanced' | 'low' | 'minimal'`；main.js 当前策略是
  `devicePixelRatio > 1.5 ? 'auto' : 'high'`。除 quality 自适应外还有 **safety 降级**（见 §7.3）。

---

## 2. 视觉分层与绘制顺序

每帧 `render(t, ctx)` 的绘制顺序（全部在一张 canvas 内，HUD/鲸鱼在其上层 DOM）：

| # | 层 | 实现 | 备注 |
|---|---|---|---|
| 1 | 底板 plate | 底板缓存 canvas + 单次 `drawImage` 带 zoom/位移 | cover 裁切；缓存超采样 1.14×（见 §7.2） |
| 2 | 星云呼吸 | 复用 `glowViolet` 径向 sprite，additive | 左上 u=0.13 v=0.05，α≈0.03 |
| 3 | 星点双层 | 400 个程序化星点（far 320 + near 80），固定种子 | 只画在地平线以上的太空区（多边形裁剪+边缘淡出） |
| 4 | 太阳闪光 | `glowWarm` 径向 sprite ×2，additive | u=0.72 v=0.20 / u=0.86 v=0.50，呼吸 α |
| 5 | 云层漂移 | 9 团大尺度噪声 sprite，右→左漂移 | 裁剪在地平线以下、平台以上（§4） |
| 6 | 大气边缘光 | 沿地平线曲线的 3 层描边 + P2 扫过亮段 | `lighter`，青蓝 #57A8FF / 高光 #BFE2FF |
| 7 | 平台反射 | 竖向反光柱 + 低透明度扫描带 + 水平线高光 | 裁剪在画面下 1/4 平台区，不重绘整图 |
| 8 | P5 bloom / P2 冲击 | 全屏 additive 渐变 + 中央光缝 | 只在 P2 前 0.9s、P5 亮白期画 |
| — | 开场 iris | **不画**（splash.css 负责） | `t<3.08` 时 `clearRect` 留黑板 |

`engine.css` 只放可选覆盖层（`.vy-engine__vignette/__rim/__scan` 等）与 QA 定格兼容规则，不改
splash.css 的 `.vy-fx` 布局；preview 页当前不依赖 engine.css 也能出画。

---

## 3. 镜头曲线（P2–P5）

**焦点** `(focusU, focusV) = (0.5, 0.52)`（略低于画面中心，让地球与平台一起压向观众）。
**映射**：屏幕像素 = `f + (plate_uv_px - f) * zoom + parallax`；`zoom` 从 1.00 起，cover 后的
底板始终铺满画布（16:9 时全幅）。

| 区间（动画秒） | 相位 | zoom 曲线 | 公式 |
|---|---|---|---|
| < 3.10 | signal/console | 1.000（不推） | — |
| 3.10–5.10 | breach | 1.000 → 1.080 | `easeInOutSine(u)`，u=(t-3.10)/2.0 |
| 5.10–9.00 | whale/lockup | 1.080 → 1.120 | `smoothstep(5.10, 9.00, t)`（极慢匀速段） |
| 9.00–9.80 | bloom | 1.120 → 1.138 | `easeOutCubic(u)` + 亮度升白（P5 微爆） |

**鼠标微视差**：`pointer ±8px × infl × room`；
- `infl`：3.10→3.65 线性起效，9.55→9.80 收束；
- `room = clamp((zoom-1)/0.08, 0, 1)`：z=1.00 时零位移，防止露边；
- 低频阻尼：`pointerSm ≈ pointer`（τ=0.34s，按每帧逼近）；
- 叠加极轻手持漂移 ±0.55px/±0.35px（sin 0.23/0.19Hz×ambientT）。
- `reduced`：zoom 固定 1.06、无视差、无漂移（静态终帧构图）。

**实测（1600×900，engine-only，CDP 真实时间）**：用平台顶缘亮线反推 zoom
（`y_platform = 468 + 232.2·z`，H=900）：

| t | 平台线 y（实测） | zoom 实测 | zoom 曲线预测 | 误差 |
|---|---|---|---|---|
| 3.4 | 702 | 1.0078 | 1.0044 | +0.0034 |
| 4.4 | 715 | 1.0637 | 1.0582 | +0.0055 |
| 6.0 | 719 | 1.0810 | 1.0854 | -0.0044 |

- Δy(3.4→4.4) 实测 **13px**，曲线预测 **12.49px**；Δy(4.4→6.0) 实测 **4px**，预测 **6.33px**
  （偏差 ≤2.3px，含 engine 高光线自身 ±1.6px 呼吸位移与 1px 行检测粒度）。
- **结论：镜头推近已实测成立**，与曲线误差 <0.006 zoom。

---

## 4. 云层漂移（模拟 blobsSM40 模糊云 + Gusts_of_wind 风雾）

**离线 sprite**（init 时一次生成，逐帧零噪声计算）：3 张 256×112 云 sprite，**5 倍频 value noise**
（`fbm`，固定 seed 11/29/57）× 横向扁椭圆衰减 × `smoothstep` 阈值，冷白偏蓝（236,242,248），
近似原素材 `blurprecise`（scale 1.28/0.43 竖向 mask）的大尺度模糊云团语言。

**逐帧**：每团云按 (u,v) 定位到底板 UV → 经 zoom/视差映射到屏幕，`globalCompositeOperation='lighter'`
叠加，裁剪区域 = 地平线曲线以下 ~2px 至平台线上方。**9 团云参数**（固定种子 `0x57494E44`）：

| 参数 | 范围 | 说明 |
|---|---|---|
| u 初始 | -0.15 … 1.15 | 环绕一屏 |
| v 初始 | 0.20 … 0.72 | 地球云海带内 |
| 宽度（占底板宽） | 0.24 … 0.68 | 大尺度团絮 |
| 压扁比 h/w | 0.16 … 0.28 | 风成层云（横向拉伸） |
| 透明度 | 0.050 … 0.145 | additive 叠在亮地球上 |
| 漂移速度 u/s | **0.006 … 0.022** | **右→左**（负方向），周期环绕 |
| 透明度呼吸 | 0.045 … 0.12 ×6 rad/s | 错相，9 团不同频 |
| v 微浮动 | ±0.014 × sin | 极缓上下呼吸 |

**v 模型**：ambientT = t/speed；`u = mod(u0 - drift·ambientT, 1.30) - 0.15`。
在 1600×900、speed=0.85 下屏幕位移速率 ≈ **9.6–35 px/s**（随 zoom 放大到 1.08 约 +8%）。

**实测（engine 分层差值）**：`cloud = full - noClouds`（都是 additive 层，差值即云层贡献）：
- 云层带内平均能量 t34 1.829 / t44 1.745 / t60 1.595（层存在且可见）；
- **t=4.4 → 6.0**（ambient Δ=1.882s，模型预测 19.2–70.5px）：
  - 全局最佳平移 **dx = -28px, dy = -8px**（负 = 向左，右→左成立）；
  - 4×3 分块匹配：**100% 的块 dx<0**，块中位 dx = **-55px**；最亮 3 块 dx = -48/-26/-30；
  - 残差 1.078 → 0.940（-12.8%；单一位移无法同时对齐 9 团不同速云 + 各自呼吸，故残差仍存，属预期）；
- **t=3.4 → 4.4**（模型 12.0–44.1px）：块中位 dx = -33px，66.7% 块为负；全局 dx=0（该时段 zoom 变化最大、补偿误差也最大，故以分块为准）。
- **同 t 对照**：整帧 meanAbs = **0.000**（逐像素完全一致），云层对照残差 0.142/0.143（仅重采样噪声）→ 差值确实来自时间推进，不是渲染抖动。

---

## 5. 星点（程序化星场 + 双层视差）

- **数量**：400（far 320 + near 80；按档位 110–400 缩放），`mulberry32(0x53544152)` 固定种子 →
  每帧/每次运行同一 t 完全一致。
- **位置**：屏幕归一化坐标；**不随镜头缩放**（星空在无穷远），只跟随鼠标视差（far 0.22×、
  near 0.75×）与极轻漂移；靠近地平线 2%H 范围线性淡出，并用「地平线以上」多边形裁剪。
- **大小**：far 半径 0.9‰–1.6‰H，near 2.2‰–3.9‰H；画在 32px 径向 sprite 上缩放。
- **闪烁**：`α = base · (0.30+0.70·t²)`，`t=0.5+0.5·sin(ambientT·freq·2π+phase)`；
  far freq 0.055–0.215Hz、near 0.20–0.75Hz；base far 0.14–0.50、near 0.30–0.80；
  near 层 22% 带暖色温、far 10%。
- **实测**：`star = full - noStars`；星点掩膜（两帧任一 >3）83 像素：
  t44 vs t60 掩膜上平均差 **8.59**，26.5% 掩膜像素差 >8，峰值差 77；
  **同 t 对照 = 0.000** → 闪烁成立。

---

## 6. 平台反射与大气边缘光

**平台反射**（只裁剪在平台区，不重绘整图）：
1. **竖向反光柱**：4 条（u=0.036/0.283/0.716/0.905，取自 4K 底板实测反光位置），预生成
   64×128 横向 gaussian sprite，α 0.045–0.095 × 0.72–1.0 呼吸，纵向微颤 ±0.0025H；
2. **低透明度扫描带**：7.5s 周期从平台下方向上缓慢游走，单次线性渐变填充（α 0.10–0.13），
   `lighter`；
3. **水平线高光**：平台顶缘 1px 青白线，α 0.16±0.06 呼吸 + ±0.0018H 上下偏移。

**大气边缘光**：沿 `horizonV(u)=0.145+0.52·(u-0.5)²` 的地平线路径画 3 层描边
（宽度 0.020H/0.0075H/0.0022H，α 0.042/0.109/0.21），整体呼吸 `0.78+0.22·sin(0.55·ambientT)`；
P2 期间（3.10–5.10）额外一条高亮短弧从左向右扫过（bell 包络，青白 0.32/0.40 α）；
P5 boost×1.5。

**实测（ROI 平均值差，engine-only 1600×900）**：
- 平台 ROI：t34→t44 meanAbs **13.32**（49.6% 像素 >8）；t44→t60 **8.91**（31.1% >8）；
- 边缘光 ROI：t34→t44 **86.58**（90.8% >8）；t44→t60 **58.97**（91.7% >8）；
- 平台线实测 y：702→715→719（见 §3），反射/扫描的位移与呼吸均有像素级证据。
- 这三项差值里包含镜头缩放带来的整体位移（平台/边缘光随 plate 缩放），属预期（平台是 plate
  的一部分）；同 t 对照为 0，可排除抖动。

---

## 7. 性能预算与降级策略

### 7.1 实测环境与方法

- Chrome `--headless=new --disable-gpu`（**SwiftShader/软件光栅**，无 GPU 加速；是"最坏情形"，
  真实 GPU 会显著更快）；CDP 真实时间（`_tools/cdp-shot.mjs` / 临时 `qa.mjs`），deviceScaleFactor=1。
- 两种测量口径：
  - `engine.stats().draw.*`：**engine 侧命令提交耗时**（Canvas2D 光栅化发生在合成器侧，
    提交耗时只有 0.1–0.7ms，**不能代表真实光栅成本**）；
  - `engine.stats().interval.*` / `main.stats().avgMs`：**rAF 帧间隔**（含合成器光栅 + HUD/鲸鱼/CSS
    的全部页面成本）——性能预算以它为准。
- 引擎单独 harness（只有 engine canvas，无 HUD/鲸鱼/CSS 覆盖层）用于归因。

### 7.2 结果（2026-11-03 实测）

**引擎单独（只有 engine.js 的 harness）**

| 视口 | 档位/backing | 帧间隔 mean | p50 | p95 | >16.7ms 帧占比 |
|---|---|---|---|---|---|
| 1600×900 | high / 1600×900 | 24.33ms | **16.7ms** | 33.4ms | 61.7% |
| 2560×1440 | high / 2560×1440 | 51.87ms | **50.0ms** | 66.7ms | 100% |
| 2560×1440 | balanced / 2150×1209 | 41.96ms | 33.4ms | 50.1ms | 100% |
| 2560×1440 | low / 1687×949 | 17.59ms | **16.7ms** | 33.3ms | 27.4% |

**1440p 分层归因**（engine-only，p50）：全开 50.0ms → 关云层 33.3ms（云 ≈17ms）→
关平台/边缘光/闪光/星云 33.4ms（这组 ≈17ms）→ 只留底板 16.7ms（底板 blit 本身可 60fps）；
关星点无变化（星点成本可忽略）。

**完整 preview 页（engine + hud + whale + CSS 覆盖层）**

| 视口/时刻 | main avgMs | main maxMs | engine interval p50 / p95 | engine draw p95 |
|---|---|---|---|---|
| 1600×900 @t=4.56（P2） | 23.79 | 140.1 | 17.0 / 62.4ms | 0.70ms |
| 1600×900 @t=9.44（P5） | 30.04 | 138.6 | 41.1 / 64.5ms | 0.60ms |
| 2560×1440 @t=4.45（P2） | 38.60 | 163.2 | 26.3 / 111.7ms | 0.70ms |
| 2560×1440 @t=9.39（P5） | 54.09 | 151.7 | 28.9 / 109.5ms | 0.50ms |

> 注：main 的 `p95Ms` 实为「最大帧间隔」，非统计 p95（main.js 实现如此）；统计分位用 engine 的
> interval 采样（最近 180 帧环形缓冲）。

### 7.3 结论与降级路径

- **1440p「p95 ≤ 16.7ms」目标：软件光栅下未达成**（engine-only 全开 p50 50ms）。这是 headless
  软件光栅 + Canvas2D 全屏合成的最坏情况；真实 GPU 合成预期显著更好，但**本机未实测（未验证项）**。
- **保守降级已实现且实测生效**（engine.js `maybeDegrade`）：
  - 触发：`rAF interval p95 > 30ms 且 mean > 22ms`（任何 quality 都生效的 safety net），或
    `quality='auto'` 时 `drawP95 > 档位预算`；每 30 帧评估、连续 2 次超阈值才降一档，只降不升。
  - 档位阶梯：high(maxPixels 3.9M/云9/星400) → balanced(2.6M/7/300) → low(1.6M/5/210) → minimal(0.9M/3/136)；
    降档会重算 backing 分辨率（≤ 预算像素）+ 减少云/星数量。
  - **实测**（1440p engine-only 20s）：日志 `p95=73.6ms mean=58.5ms → balanced` →
    `p95=60.7ms mean=40.8ms → low`，最终 backing 1687×949（66%），p50 由 50ms 回到 **16.7ms** 量级。
  - **实测**（1600×900 完整页 5s 播放）：触发一次 `p95=66.2ms mean=28.6ms → balanced`；该分辨率下
    backing 已是 1600×900（maxPixels 2.6M > 1.44M），只减少云/星数量，分辨率不变。
  - 真实 GPU 上若稳定 60fps（p95≈17ms），不会触发降级；**降级在 `?t=` 定格截图时不触发**
    （单帧渲染，阈值需要 ≥60 帧样本）。
- 若宿主明确知道设备弱（≤4 线程 / 软件渲染），建议 main.js 传 `quality:'auto'`（当前 main.js 只在
  dpr>1.5 时传 auto；这是 Lead/main.js 的决定，本文只给数据与建议）。
- 1080p（1600×900）目标更宽松：软件光栅下 engine-only p50 16.7ms / 完整页 avg 23.8ms（P2），
  可接受；真实 GPU 未测。

---

## 8. 与素材 B（`_extract-b/scene.json`）的对应

| 素材 B / 原壁纸 | 本引擎的处理 |
|---|---|
| 4K 底板 `mip00_0x5.png` 3840×2160（正交相机 `orthogonalprojection 3840×2160`，`zoom=1.0`，无推镜） | `hiSrc`（`lib/assets/hero-4k.webp`，3840×2160）cover 绘制；几何常量取自底板像素分析：地平线 `horizonV(u)=0.145+0.52(u-0.5)²`、平台线 v=0.778、反光柱 u=0.036/0.283/0.716/0.905、太阳闪光 u≈0.72 v≈0.20 |
| `cameraparallax=false`、`cameraparallaxamount=0.5`、`cameraparallaxmouseinfluence=0.5` | 原壁纸不视差；本插件**新增**叙事性鼠标微视差 ±8px（低频阻尼 τ=0.34s），幅度远小于原素材的可选值，避免露边（z=1.00 时不出位移） |
| `general.bloom=false`，但 `bloomthreshold=0.65 / bloomstrength=2.0 / bloomhdriterations=8` | 原场景 bloom 关闭；本插件在 P5 用 additive 全屏渐变 + 中央光缝做「亮部升白」模拟，不是真实 HDR bloom |
| `effects/workshop/2981960200/blurprecise`（scale 1.28/0.43，VERTICAL+ENABLEMASK） | 用于原场景文字层的竖向模糊；本引擎用 **5 倍频噪声 + 椭圆衰减 + 横向拉伸 sprite** 复刻「大尺度模糊云团」语言，逐帧只做合成 |
| `particles/workshop/2991402338/Gusts_of_wind.json`：sphererandom emitter rate 10、maxcount 100、lifetime 1–7s、size 15–50、velocity (100–500, 0–40, 0–20)、gravity (0.4,1,0)、drag 1、alphafade、oscillateposition mask (0,0,2)、starttime 2；材质 `fog1_1_1`（`particle/debris/debris1`，overbright 1.8，translucent） | 云层 9 团（≈ 原 100 粒子中的雾团数量级），右→左漂移 0.006–0.022 u/s（≈9.6–35px/s @1600），α 0.05–0.145，呼吸周期 9–23s；保留「缓慢横移 + 淡入淡出 + 轻微上下浮动」的雾语言，但改成预生成 sprite 以控制帧成本 |
| `Clock` / `Day` / `Date` 文本对象（Quicksand/Anurati、blur 特效） | 终帧日期/时间排版由 `hud.js` 负责（不在 engine 范围） |
| 操作员剪影 / 平台金属质感 / 原图星空 | 保持原样不动；engine 只叠加 additive 微光（星点、云、边缘光、平台反光），不覆盖剪影主体 |

---

## 9. 资源加载与兜底

- 加载链：`hiSrc`（hero-4k.webp，超时 4.2s）→ `midSrc`（hero-2k，2.6s）→ `posterSrc`（poster，1.8s）
  → **程序化深空渐变兜底**；每个失败 `console.warn` 一次，不抛错。
- 兜底画面：深空渐变 `#04070f→#081226→#0a1424` + 左上紫色星云 + 程序化地球圆弧（径向渐变+青蓝
  大气带）+ 金属平台；随后星点/云层/边缘光/平台反射照常叠加，reduced 也同样可定格。
- **已验证**：临时把 hiSrc/midSrc/posterSrc 指向不存在路径（`__missing-*.webp`）的 harness：
  `mode='fallback'`, `plateSrc=''`, 星点 400/云 9，`exceptions=0`，截图 `_shots/engine-fallback.png`；
  控制台仅有 3 条预期 404 资源报错（不是 engine 异常）。
- 底板图片加载成功时：`mode='plate'`, `plateSrc='hi'`（实测）。

## 10. reduced（减弱动态）

`create({reduced:true})` 时 `render()` 只画 **一帧静帧**（`zoom=1.06`、无视差/漂移/闪烁/推镜），
之后直接 return（不再重绘）。静帧构图 = 终帧构图（地球+平台+星点+云+边缘光均在），reduced 的
4 帧淡入与 2.2s 停留由 main/splash.css 负责。`resize` 后重置为未绘制，需再 render 一次。

---

## 11. QA 方法与动效自证（可复现）

### 11.1 工具与手法

1. **截图**：`_tools/cdp-shot.mjs`（CDP 真实时间；避免 `--virtual-time-budget` 下 CSS 过渡不推进导致
   `.vy-fx` 停在 opacity≈0.3 的问题）；`?t=` 定格单帧。
2. **分层隔离**：engine 支持只读全局开关（在 `create` 前注入，正式契约不变）：

   ```js
   window.__VYRON_ENGINE_DEBUG__ = { noClouds:true }   // 可选 noStars/noNebula/noGlint/noRim/noPlatform/noBloom
   ```
   CDP 用 `Page.addScriptToEvaluateOnNewDocument` 注入；Layer 名称见 `stats().debug`。
3. **QA 隐藏非 engine 层**：注入 CSS 隐藏 `#vyIris/.vy-aperture-ring/#vyHudRoot/#vyWhaleRoot/#vyWhaleFx/
   #vyLockup/#vySignal/.vy-frame/.vy-header/.vy-footer/.vy-hint-wrap/#vyFlash/#vySeam/.vy-probe/.vy-fallback`，
   截图即为纯 engine 层（grain/scanlines/vignette 是静态 CSS，不影响差值）。
4. **差值计算**：Pillow/numpy，`mean|Δ|`（三通道最大差）、`pct(Δ>8)` 等；ROI：
   `sky_stars (80,24,1520,100)`、`rim_glow (300,100,1300,180)`、`cloud_band (150,220,1450,600)`、
   `platform (150,730,1450,870)`。
5. **确定性对照**：同一 `?t=` 拍两次，整帧逐像素 **全 0 差**（本次实测 4 个 ROI 均 0.000）——
   证明 engine 渲染完全确定（固定种子 + 无 wall-clock 依赖），差值只来自 t 不同。
6. **镜头反推**：平台顶缘亮线行 y（3 段 x 各取中值）→ `zoom=(y-468)/232.2`，与 §3 曲线对比。
7. **云/星分层**：`cloud = full - noClouds`、`star = full - noStars`（'lighter' 叠加，差值为该层贡献），
   再做镜头缩放补偿 + 2D 平移搜索（分块 4×3）测漂移方向/幅度。

### 11.2 证据清单（`_shots/`）

| 文件 | 内容 |
|---|---|
| `engine-diff-t34.png` / `engine-diff-t44.png` / `engine-diff-t60.png` | engine-only 三帧（隐藏非 engine 层），QA 对比基图 |
| `engine-diff-t44-b.png` | t=4.4 二次拍摄（确定性对照，与 t44 字节级一致） |
| `engine-layer-t{34,44,60}-nocloud.png` / `-nostars.png` | 分层隔离帧（noClouds / noStars） |
| `engine-cloudlayer-t{34,44,60}.png` | 云层差值（×4 增强） |
| `engine-cloudlayer-compare.png` | 云层三联：t44 云层 / t60 云层 / 差异热区 |
| `engine-starlayer-t{34,44,60}.png` / `engine-starlayer-compare.png` | 星点层差值（×6）与三联对比 |
| `engine-diffmap-t34-t44.png` / `engine-diffmap-t44-t60.png` | 差值热图（×8 增强，标出 ROI） |
| `engine-motion-montage.png` | 三帧 800×450 并排 |
| `engine-live-t44.png` | 完整页面（含 HUD/鲸鱼/iris）t=4.4 |
| `engine-fallback.png` | 资源缺失 → 程序化兜底（mode=fallback） |
| `perf-p2-1600x900.png` / `perf-bloom-1600x900.png` / `perf-p2-2560x1440.png` / `perf-bloom-2560x1440.png` | 性能测量时刻截图 |
| `pause-t6.6.png` / `pause-t8.8.png`（Lead） | 融合后的 P3/P4 实拍，供整体观感参考 |

### 11.3 断言结果（12/12 通过）

```
sameT_identical                     := 同 t 两帧逐像素 meanAbs=0（4 ROI 均 0.000）
camera_zoom_moves_platform_line     := t34→t44 平台线 Δy=13px（预测 12.49）
camera_zoom_matches_curve_within_0.012 := |zoom_measured-zoom_curve| ≤ 0.0055
cloud_band_moves_t44_t60            := ROI meanAbs=26.65（pct>8 71.4%）
cloud_layer_global_dx_negative      := 云层最佳平移 dx=-28px（右→左）
cloud_layer_block_median_dx_negative:= 分块中位 dx=-55px
cloud_layer_most_blocks_negative    := 100% 分块 dx<0
cloud_drift_within_model_range      := 28px ∈ 模型 19.2–70.5px
star_sky_twinkle_t44_t60            := sky ROI meanAbs=8.06
star_layer_twinkle_on_mask          := 星点掩膜 meanAbs=8.59（26.5% >8）
platform_reflection_moves_t44_t60   := 平台 ROI meanAbs=8.91
rim_glow_breathes_t44_t60           := 边缘光 ROI meanAbs=58.97
```

### 11.4 全帧 ROI 差值表（engine-only，1600×900，meanAbs / pct>8%）

| ROI | t=3.4 → 4.4 | t=4.4 → 6.0 |
|---|---|---|
| sky_stars 星点/星云 | 7.46 / 21.5% | 8.06 / 22.0% |
| rim_glow 大气边缘光 | 86.58 / 90.8% | 58.97 / 91.7% |
| cloud_band 云海 | 39.11 / 91.5% | 26.65 / 71.4% |
| platform 平台 | 13.32 / 49.6% | 8.91 / 31.1% |

> 说明：全帧差值包含镜头缩放引起的整体位移（plate 内容随 zoom 放大），因此 rim/cloud/platform
> 数值较大属预期；「云层是否自身在动」由 §4 的分层补偿结果证明（dx=-28px / 100% 分块为负），
> 「星点是否在闪」由 §5 的星点掩膜结果证明（同 t 对照为 0）。

---

## 12. 已知限制 / 未验证项

1. **真实 GPU 下 1440p p95 未实测**：本机 headless 只能软件光栅（`--disable-gpu`）；软件光栅下 1440p
   全开 p50≈50ms，靠 safety 降级回落到 16.7ms 量级。真实桌面 GPU（用户机器）预期远好，但**未验证**。
2. **本机无法验证真实 DSH 启动窗口内的观感与帧率**：需用户重启 DSH 后确认（与 PAUSE-STATE §11 一致）。
3. 平台/边缘光 ROI 的全帧差值混合了镜头缩放位移与自身动效，已用同 t 对照 + 分层差值拆开，但未做
   逐层"去除相机位移后"的完整残差分解（云层做了补偿，平台/边缘光未单独做补偿后分解）。
4. 云层补偿后残差只下降 12.8%（9 团云不同速 + 各自呼吸，单一全局位移无法完全对齐），因此漂移
   证据以「分块 dx 全为负」+「全局 dx=-28px」为主，未做逐团光流（成本/收益不划算）。
5. `quality='auto'` 的自适应入口未在 main.js 启用（main.js 传 `'high'`），仅 safety 降级兜底；是否
   改为 auto 由 Lead 决定。
6. `reveal` 参数 engine 不消费（iris 由 splash.css 做）；如后续改为 engine 内做 iris，需重新验证
   定格截图（`?t=` 单帧下 main 的 `stageState.reveal` 会落后一帧）。
7. `engine.css` 里的 `.vy-frozen .vy-fx {opacity:1}` 是 QA 兼容补丁（见 §13），若 splash.css 后续
   在 `.vy-frozen` 下自行处理过渡，可删除本规则。

---

## 13. 维护备注

- 改镜头/云/星参数时，先改本文件 §3–§6 的数值表，再改 engine.js 顶部常量（`CAM`/`PLATE`/`LEVELS`），
  最后重跑 §11 的 4 张 engine-only 截图 + 差值脚本（脚本在临时目录，命令见 §11.1；如需入库可移到
  `_tools/`，由 Lead 决定）。
- QA 调试开关只读全局 `__VYRON_ENGINE_DEBUG__`，必须在 `create` 前注入，正式契约不暴露该参数。
- 定格截图 `?t=` 时，main.js 只画一帧就停 rAF，CSS opacity 过渡不会被推进 → `.vy-fx` 会停在中间态；
  本插件的 workaround 是 engine.css 的 `.vy-frozen .vy-fx { opacity:1 !important; transition:none !important }`。
  更彻底的修法是在 `splash.css` 里对 `html.vy-frozen .vy-fx` 直接给终态（Lead owner）。
- 变更记录：
  - 2026-11-03 v0.1.0：初版 engine（4K plate/推镜/视差/星点/云层/平台/边缘光/bloom/兜底/reduced/
    stats），落盘 `docs/motion-spec.md`；补齐动效自证（12 项断言）与 1440p 性能实测 + safety 降级。
  - 2026-11-03 v0.2.0（ROUND2）：按 `_handoff/ROUND2-PLAN.md` §4.4 实现「让地球动起来」——
    云遮罩提取 + 云层/地表相对视差、limb 8.4s 呼吸 + 色温、星点相机视差、两段斜向大气光扫、
    相机 0.45% 横移、平台反射增强；修复 v0.1.0 太阳闪光分支 globalAlpha 未复位的隐形 bug
    （导致 rim/扫描带实际只按 3% 强度绘制）。新增 §14 实测与 stats().motion 契约。

---

## 14. ROUND2（v0.2.0）：地球动起来 —— 实现、契约与实测

### 14.1 目标与验收判据

用户反馈（v0.1.0）：「让地球动起来。」（当前 P2–P5 的 4K 地球几乎是静态贴图）。
判据（ROUND2-PLAN §4.4 / 本任务 task-3）：

| # | 判据 | 实测（1600×900, engine-only） | 结论 |
|---|---|---|---|
| 1 | 同尺寸 t=4.4 vs t=6.4，地球区 y10–70% 像素差 ≥2% 像素 >8 灰阶 | meanAbs **35.80** / **>8 占 80.00%** / >16 占 61.96% | ✅ 远超 |
| 2 | `?t=` 同一 t 两次截图逐像素一致 | **0.000**（全帧） | ✅ |
| 3 | reduced 分支静态 | 两次加载（不同 wall time）**0.000** | ✅ |
| 4 | 新增合成层 ≤2 | **1**（cloudDeck） | ✅ |
| 5 | 新增运动可量化、stats 可读 | `stats().motion`（§14.3） | ✅ |

### 14.2 实现要点

**A) 云层 / 地表相对视差（新增合成层 1 张）**

1. **云遮罩在构建期提取**（离线，Python/Pillow，见 `_shots/round2-engine/_qa/mask-explore.py`）：
   从 `lib/assets/hero-4k.webp` 计算「云白度」= smoothstep(亮度 118→190) × (1 − 饱和度 0.10→0.42)
   × (1 − 0.85·暖色权重) × (1 − 0.9·太阳镜面区)，再限制在地平线以下 / 平台以上；高斯模糊软化后
   降采样为 **192×108、4bit 量化、nibble 打包、base64（13 824 字符）**，内嵌在 `engine.js` 的
   `CLOUD_MASK_B64`。运行期只 `atob` 解码成一张 192×108 的 alpha canvas 当软遮罩，
   **不从 4K 图读像素**——`file://` 下 canvas 会被 taint，实测 `getImageData` 抛 `SecurityError`
   （v0.1.0 注释里的约束依然成立，本方案是"构建期提取、运行期不解码原图"）。
2. **云层缓存**：把底板缓存再画一份 → `destination-in` 软遮罩 → 裁出"云纹本身"；
   逐帧以**整块替换（source-over, mix=1.0）** 叠回底板，并叠加相对位移。
   为什么不是 screen：rc1 实测 screen 叠加会把云整体洗白、且与原云形成双曝重影（`_qa/composite-modes.png`）；
   替换模式在**位移 0 时像素与原图完全一致**（不改变美术），位移增大时只有云纹平移，遮罩边缘是
   192×108 双线性放大的软羽化（数 px）→ 无硬接缝/断层。
3. **位移模型**（纯 t 函数）：`v(t) = 9.5·(1 + 0.16·sin(2π(t−3.10)/11.0))` px/s → 瞬时
   **7.98–11.02 px/s（实测 9.33–10.97，规格 6–14）**；`offset(t) = −∫v dt`（左向），
   t=8.8 时 **−59.45px**；另有 −0.10px/s 纵向漂移。
4. **地表层**：底板整体平移 `+0.85px/s` + **相机横移 0.45% 屏宽**（smoothstep 3.20→9.60s，约 7.2px），
   合计速度 **≤2px/s（实测 1.98px/s）** → 与云层形成反向相对视差。
5. 程序化云 sprite（v0.1.0 已有 9 团）漂移速度同步收敛到 `0.004–0.008 u/s`（≈6.8–13.6px/s @1600），
   与云层视差 6–14px/s 口径一致（原为 0.006–0.022 u/s ≈10–38px/s，已改）。

**B) 大气 limb 呼吸 + 色温 + 星点相机视差**

- limb 亮度：**8.4s 单频，0.75→1.0**（`pulse = 0.75 + 0.25·(0.5−0.5cos(2π·ambientT/8.4))`）；
  rim 描边由 3 层扩为 4 层（外扩 0.052H / 0.020H / 0.0075H + 高光芯 0.0022H），alpha 基于
  `0.30·pulse·boost`。
- 色温偏移：与亮度错相 0.9rad，`R += 14·warm`、`B −= 9.8·warm`（rim 色 `[87,168,255]→[94,171,250]` 量级），
  "轻微"且不发黄。
- 星点相机视差：`scale = 1 + (zoom−1)·0.08`，以焦点 (0.5, 0.52) 为中心极轻外扩 →
  P2 约 **2px**、P5 约 **4px**（stats `star.camShiftPx`）。

**C) 两段大气光扫**：窗口 **4.0–5.0 / 6.4–7.4**；斜向 **−0.38rad**、带宽 0.22W、
速度 **0.6 屏宽/秒**、峰值 **opacity 0.085（≤0.10）**，两端 smoothstep 淡入淡出；
用"旋转后的渐变矩形"填充（≈画宽 0.22 × 对角长），不用全屏渐变以省成本。

**D) 相机 / 平台**：保留 1.00→1.08→1.12 推镜 + 鼠标视差；新增 0.45% 屏宽横移（见 A4）；
平台反光柱亮度 **×1.22** + 横向微颤 **±2.6px**（1.15rad/s 错相）、平台线高光呼吸 +0.08。
反光柱 u=0.036/0.283/0.716/0.905 全部避开中央操作员剪影。

**E) 重要 bug 修复（v0.1.0 遗留）**：太阳闪光分支（原 `paintFrame` 第 3 步）漏复位 `globalAlpha`，
残留值 ≈**0.027** 被后续图层继承 → 大气边缘光、平台扫描带、P2 边缘扫光实际只按 **~3% 强度**绘制
（v0.1.0 里几乎不可见，这也是"地球看起来很死"的原因之一）。v0.2.0 在 glint / rim / cloudDeck / sweep
处显式复位 `globalAlpha`，并把 rim 基准从 0.44 重新定标到 0.30。这是 before→after 同 t 全帧像素差
较大（46.93% >8，见 §14.4）的主要原因：limb 变亮 + 相机横移 1.8px + 云层位移，不是贴图被替换。

### 14.3 stats() 新契约（verifier / QA 可读）

```js
eng.stats().motion = {
  t, ambientT,
  cloudDeck: { enabled, blend:'source-over(replace)', mix:1, mask:'192x108-4bit',
               driftPxS, driftSpecPxS:[6,14], offsetPx:{x,y} },
  plate:  { scrollPxS:0.85, scrollPx, camPanPx, camPanFracW:0.0045, shiftPx, shiftVelocityPxS },
  limb:   { periodS:8.4, pulse, range:[0.75,1], warm, color:[r,g,b], colorHi:[r,g,b] },
  star:   { camScale, camShiftPx },
  sweep:  { window, windowRange:[from,to], progress, centerU, alpha, peakAlpha:0.085, speedW:0.6 }
          | { window:-1, progress:0, alpha:0, ... },
  platform:{ stripGain:1.22, wobblePx:2.6, lineBreathe:0.08 }
}
eng.stats().layers = { plate, cloudDeck, cloudDeckBlend, newCompositeLayers:1,
                       cloudDeckAreaFrac:0.657, cloudMask:'192x108' }
```
`__VYRON_ENGINE_DEBUG__` 新增（仅 QA，不改正式契约）：`noCloudDeck`、`noSweep`、`noLimb`、
`cloudDeckScale`（数值，覆盖云层缓存缩放 0.3–1.0）。
读取示例：`window.__VYRON_STAGE__.modules.engine.stats().motion`。

### 14.4 实测数据（2026-11-03，1600×900，engine-only，CDP 真实时间）

**运动量随时间**（`stats().motion`，来自 `_shots/round2-engine/stats-t*.json`）：

| t | cloudDrift px/s | cloudOffset px | groundShift px | limbPulse | starShift px | sweep# | sweep alpha |
|---|---|---|---|---|---|---|---|
| 3.4 | 9.76 | −2.89 | 0.28 | 0.999 | 0.15 | — | 0 |
| 4.4 | 10.53 | −13.05 | 1.77 | 0.968 | 1.95 | 0 | 0.085 |
| 5.4 | 10.97 | −23.83 | 3.92 | 0.870 | 2.71 | — | 0 |
| 6.4 | 10.95 | −34.83 | 6.41 | 0.776 | 3.04 | 1 | 0（窗口起点） |
| 7.4 | 10.46 | −45.57 | 8.89 | 0.753 | 3.54 | 1 | 0（窗口终点） |
| 8.8 | 9.33 | −59.45 | 11.74 | 0.861 | 4.02 | — | 0 |

**像素差（engine-only 分层隔离，`_shots/round2-engine/`）**：

| 对照 | 统计 | 文件 |
|---|---|---|
| 同 t（t=4.4 两次） | meanAbs **0.000**（全帧） | `final-eng-t4.4.png` / `-b.png` |
| 判据：t=4.4 → t=6.4（y10–70%） | meanAbs 35.80，**>8 占 80.00%**，>16 占 61.96% | `diff-montage-final-gate.png` |
| 云层贡献（full − noCloudDeck，y10–70%） | meanAbs 7.68，>8 占 27.79%，max 139 | `diff-heat-final-clouddeck.png` |
| 光扫贡献（full − noSweep，全帧） | meanAbs 1.61，>8 占 6.68%，max 22 | `diff-montage-final-sweep.png` |
| limb 贡献（full − noLimb，t=7.14，rim ROI） | meanAbs 0.748，max 17 | `diff-heat-final-limb.png` / `limb-breathing.png` |
| reduced 两次加载 | meanAbs **0.000** | `final-reduced-1/2.png` |
| before(v0.1.0) vs after 同 t=4.4 | meanAbs 12.81，>8 占 46.93% | `before-vs-after-t44.png` / `diff-montage-final-vs-v010.png` |
| 云区 filmstrip 4.4→6.4（0.5s 步进） | 云边界相对地表逐帧左移，肉眼可辨 | `cloud-filmstrip-t44-t64.png` / `cloud-framediff-0.5s.png` |

### 14.5 性能（engine-only harness，Chrome headless SwiftShader，软件光栅）

> 口径：`_qa/harness.html` 真实 rAF，1440p = 2560×1440，150 帧采样（warm 40），v0.1.0 vs v0.2.0
> **交替 6 对**（同一台机器上还有 5 个 teammate 在跑 Chrome/node，帧间隔噪声大，取中位数）。

| 视口 | 指标 | v0.1.0 中位 | v0.2.0 中位 | Δ |
|---|---|---|---|---|
| 1440p | interval p50 | 66.6ms | 66.7ms | 0% |
| 1440p | interval p95 | 91.75ms | 100.05ms | **+9.0%**（6 对中 3 对为 0） |
| 1440p | interval mean | 63.76ms | 71.48ms | +12%（噪声大） |
| 1440p | engine draw 提交 | 0.65ms | 1.1–1.8ms | +0.6–1.1ms |
| 1600×900 | interval p95 | 33.4ms | 50.0ms | **+16.6ms（软件光栅下 1 个 vsync 台阶）** |
| 1600×900 | interval mean | 27.4ms | 33.1ms | +21% |

**成本归因与已做优化**（云层合成层 = SwiftShader 上"带 alpha 的准全屏 canvas→canvas 合成"）：

1. 原始实现（缓存全尺寸 2365×1330 @1440p）：`draw` 提交 **22–26ms/帧** —— 定位到 **>2048 宽**的带 alpha
   画布做 canvas→canvas 合成会掉进极慢路径；缓存宽 ≤2046 后降到 **1.1–1.8ms/帧**；
2. 只合成「非零遮罩包围盒」（占全画布 **65.7%**）；
3. `imageSmoothingEnabled=false`（缓存/屏幕比例 0.93–1.03，近 1:1 拷贝路径）。

**结论**：1440p p95 中位 +9.0%（在 ≤10% 内，但属于边界，且 6 对中有 1 对 +33% 的争用噪声）；
**1080p（1600×900）软件光栅下会多一个 vsync 台阶**（p95 +50%），真实 GPU 未实测。
若 verifier/Lead 要求更严格：可在 safety 降级到 level≤2 时自动关闭云层视差（一行 gate，
当前**有意未开启**，以保留用户明确要求的"地球动起来"；在真实 GPU 上不会触发降级）。

### 14.6 偏差与未验证项（照实）

1. 云层相对运动用「整块替换」而非 ROUND2-PLAN 建议的 screen/低透明（理由：screen 实测洗白 + 双曝；
   替换在位移 0 时 0 像素差、无硬接缝）。判据"不得出现明显重影断层"以替换方案达成。
2. 替换模式在云区边缘会留下 ≤位移量宽度的"旧云拖边"：P3 主窗口（t≤7.6）最大约 43px、
   t=8.8 约 59px（P4 后被字标/亮场覆盖），1:1 放大检查未见断层感；未做逐像素光流残差证明。
3. 地表平移与相机横移合计速度按位置导数 ≤1.98px/s 满足"≤2px/s"，但相机横移是 smoothstep 缓入
   （3.2→9.6s），起始瞬间速度低于平均值。
4. **真实 GPU 下 1440p p95 未实测**（本机 headless 只能软件光栅）；4K/高 DPR（cache 宽 >2046 时
   云层缓存按 0.5–0.7× 构建）云纹会略软，未在真机验证。
5. 全屏斜向光扫在星空区也会 +≤22 灰阶（设计上可接受；若要只作用于大气层，需再加一层裁剪成本）。
6. before→after 同 t 像素差 46.93%>8 主要来自 §14.2-E 的 globalAlpha bug 修复（limb 变亮）+
   相机横移 + 云层位移；如果验收要求"美术不得变化"，可把 rim 基准从 0.30 回调到 0.20–0.24，
   代价是 limb 呼吸的可见度下降。
7. `engine.css` 本轮**无改动**（云层/光扫/limb 全在 canvas 内；CSS 覆盖层已够用）。

### 14.7 证据清单（`_shots/round2-engine/`，133 张 PNG + montage）

| 文件 | 内容 |
|---|---|
| `final-eng-t{3.4,4.4,4.9,5.4,5.9,6.4,7.4,8.8}.png` | 改后 engine-only 定格帧 |
| `final-eng-t4.4-b.png` / `final-reduced-1/2.png` | 确定性对照（同 t / reduced 两次加载） |
| `before-vs-after-t44.png` / `diff-montage-final-vs-v010.png` | v0.1.0 vs v0.2.0 同 t 对比 |
| `diff-montage-final-gate.png` / `diff-heat-final-*.png` | t4.4→t6.4 判据 + 分层贡献热图 |
| `layer2-fin-t44-{full,noclouddeck,nosweep,nolimb}.png`、`layer2-fin-t714-*.png` | 分层隔离帧 |
| `cloud-filmstrip-t44-t64.png` / `cloud-framediff-0.5s.png` | 云区 0.5s 步进 filmstrip 与帧差 |
| `limb-breathing.png` | limb 0.97 / 0.75 / noLimb 三联 |
| `stats-t*.json`、`log-*.json` | stats().motion 原值 + console/exception 记录（全部 0 exception） |
| `_qa/` | QA 脚本（harness.html、diff.py、mask-explore.py、composite-modes.py、evidence.py、dbg-*）与 1440p 证据 |
