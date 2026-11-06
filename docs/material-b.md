# 素材B 解析报告 — 威龙 VYRON 4K（正交星海底板）

> 归属：素材B（Wallpaper Engine 创意工坊 3806012039「三角洲行动 威龙 VYRON 动态版 4K 无字版」）。
> 用途：VYRON 星海鲸航启动动画 P2–P5 的背景底板、镜头语言、终帧日期/时间排版、皮肤 glass 档星海背景。
> 权威设计源：`docs/design-spec.md`（冲突以该文件为准）；本文只记录**素材B 侧**的解析事实与本插件的对应关系。
> 生成/更新时间：2026-11-03 ｜ 作者：whale-art（task-1）

---

## 0. 一句话结论

素材B 是**一张 3840×2160 无字版轨道地球底图 + 一组正交相机参数 + 三块日期/时间文本 + 一层风粒子 + 一层高斯模糊特效**。
底图已提取为 `lib/assets/hero-4k.webp`（3840×2160，555 KB）；三块文本的**排版语言**（星期大字 / 日期中字 / 时间小字带连字符）被复刻成 P4 终帧排版；风粒子的方向与速度被换算成引擎的云层漂移参数。

---

## 1. 素材来源与解包链路（可复现）

```
3806012039/  (Steam 创意工坊条目，只读源目录)
  └─ scene.pkg                     ← Wallpaper Engine 场景包
       └─ _extract-b/               ← 解包结果（_tools/extract_we_pkg.py）
            ├─ scene.json           场景图（13,230 B）
            ├─ materials/威龙_VYRON_4K_无字版.tex   纹理容器（12,569,195 B，TEXV0005/TEXB0004）
            ├─ materials/威龙_VYRON_4K_无字版.json  genericimage4 材质
            ├─ models/威龙_VYRON_4K_无字版.json     autosize 模型 → 引用材质
            ├─ fonts/workshop/2981960200/{Anurati-Regular,Quicksand-Bold}.otf
            ├─ effects/workshop/2981960200/blurprecise/effect.json
            ├─ particles/workshop/2991402338/Gusts_of_wind.json
            └─ shaders/workshop/2981960200/effects/blur_precise_gaussian.{vert,frag}
```

`.tex` 是 Wallpaper Engine 的 TEXV0005 / TEXB0004 容器，内部**内嵌 5 张 PNG mip**（不是 DXT 压缩），
用 `_tools/tex_png_extract.py` 直接切出（偏移量见 `_extract-b/_manifest.json`）：

| mip | 文件 | 尺寸 | PNG 体积 | sha256（前 16 位） |
|---|---|---|---|---|
| 0 | `mips/mip00_0x5.png` | **3840×2160** | 8,784,470 B | `89f117c6380a2cf5` |
| 1 | `mips/mip01_1145980233x2187346606.png` | 1920×1080 | 2,703,421 B | `f3908b7fd3855633` |
| 2 | `mips/mip02_1145980233x2187346606.png` | 960×540 | 794,370 B | `df26afe67c30f81b` |
| 3 | `mips/mip03_1145980233x2187346606.png` | 480×270 | 224,729 B | `5114d476085cb7f9` |
| 4 | `mips/mip04_1145980233x2187346606.png` | 240×135 | 62,034 B | `5ec7e0b33f54343f` |

派生资产（`lib/assets/`，编码参数与设计规格 §6 一致，体积预算全部达标）：

| 资产 | 尺寸 | 体积 | 预算 | sha256（前 16 位） |
|---|---|---|---|---|
| `hero-4k.webp` | 3840×2160 | 554,658 B | ≤1.2 MB ✅ | `86c51c85f4459991` |
| `hero-2k.webp` | 1920×1080 | 267,042 B | ≤400 KB ✅ | `5f06b1533dbc0048` |
| `poster.webp` | 1280×720 | 138,676 B | ≤200 KB ✅ | `4e6c2104d72e128d` |

完整清单（含品牌 SVG 与字体、`budgetOK` 逐项断言）见 **`_build/assets-b.json`**（生成脚本 `_tools/asset-b/make-assets-b.py`，`--check` 可校验漂移）。

> 编码说明：hero-4k 由 mip0 PNG 直接以 WebP q82 编码（无缩放，避免二次重采样）；
> hero-2k / poster 由 mip0 用 Lanczos 缩放后编码（q84 / q82）。`hero-*` 保留 sRGB、无 alpha，供 engine 直接 `drawImage`。

---

## 2. scene.json 结构解析

`scene.json` 版本 5，顶层四块：`camera` / `general` / `objects` / `version`。

### 2.1 camera 与投影

| 键 | 值 | 含义 |
|---|---|---|
| `camera.center` | `-77.91132 -515.47485 0.00000` | 相机焦点（世界坐标） |
| `camera.eye` | 同上，z=1.0 | 正对画面，无透视偏移 |
| `camera.up` | `0 1 0` | 上方向 |
| `general.orthogonalprojection` | `width:3840, height:2160` | **正交投影**，1 世界单位 = 1 像素（与底图 1:1 对应） |
| `general.fov` / `perspectiveoverridefov` | 50 / 90 | 正交模式下不生效，仅作透视回退 |
| `general.zoom` | 1.0 | 无初始缩放 |
| `general.nearz` / `farz` | 0.01 / 10000 | 深度裁剪 |

**对本插件的意义**：底图在 3840×2160 上是像素级 1:1 的"平面"，没有任何透视畸变。
因此 P2 的"镜头推近 1.00→1.08"可以直接用 **CSS/engine 的 scale 变换**实现（不需重投影），
`hero-4k.webp` 可直接当 16:9 平面贴图使用。

### 2.2 general（全局渲染参数）

| 键 | 值 | 用途 / 本插件对应 |
|---|---|---|
| `bloom` | `false` | 场景未开 bloom；但 `bloomhdr*` 参数保留（strength 2.0 / threshold 1.0 / scatter 1.619 / iterations 8 / feather 0.1 / tint 白） |
| `hdr` | `false` | 非 HDR 渲染 |
| `clearenabled` / `clearcolor` | true / `0.7 0.7 0.7` | 清屏色（本插件用 `--v-space #050a16` 替代） |
| `camerafade` | true | 相机淡入（本插件 P2 舷窗 iris 展开即其等价语言） |
| `cameraparallax` | false（amount 0.5, delay 0.1, mouseinfluence 0.5） | 视差关闭；本插件用指针微视差（whale ±11px）自建 |
| `camerashake` | false（amplitude 0.5, roughness 1.0, speed 3.0） | 震动关闭；本插件用"平台反射微颤 + 白闪"代替 |
| `winddirection` / `windenabled` / `windstrength` | `0.707 0.707 0` / **false** / 1.0 | 场景级风关闭；风的视觉实际由 `Gusts_of_wind` 粒子提供（§2.4） |
| `ambientcolor` / `skylightcolor` | `0.3 0.3 0.3` | 环境光；底图已烘焙，本插件不需要 |
| `gravitydirection` / `gravitystrength` | `0 -1 0` / 1.0 | 粒子重力基准（见 §2.4 `gravity 0.4 1 0`） |

### 2.3 objects（四个对象）

| id | 名称 | 类型 | 关键参数 |
|---|---|---|---|
| 17 | `威龙_VYRON_4K_无字版` | 图片模型 | `origin 1920,1080`（画面中心）、`size 3840×2160`、`locktransforms true`、image → `models/威龙_VYRON_4K_无字版.json`（autosize） |
| 19 | `Clock` | 文本 | 字体 **Quicksand-Bold**、`pointsize 32`、`scale 0.28038`、`origin 1909.03, 153.20`、`brightness 2.39`、blur `scale 1.28` |
| 27 | `D a y` | 文本 | 字体 **Anurati-Regular**、`pointsize 32`、`scale 1.14488 1.13179 0.95818`、`origin 1924.44, 306.90`、`brightness 1.4`、`angles -0.01036`、blur `scale 0.43` |
| 33 | `Date` | 文本 | 字体 **Quicksand-Bold**、`pointsize 32`、`scale 0.31731 0.30580 0.44841`、`origin 1906.72, 200.12`、`brightness 1.98`、blur `scale 1.33` |
| 51 | `Wind particles` | 粒子 | `origin 983.95, 621.95`、`particle particles/workshop/2991402338/Gusts_of_wind.json`、`solid true`、`instanceoverride {count 1.46, size 1.54, speed 1.35}` |

**换算成屏幕百分比（1920 原点 = 画面中心，y 向下）**：

| 对象 | x | y | 有效字号（pointsize×scale） | 角色 |
|---|---|---|---|---|
| Clock | 49.71% | 7.09% | ≈8.97 px | 时间 `-10:17-`（小字） |
| Date | 49.65% | 9.27% | ≈10.15 px | 日期 `03 NOV 2026`（中字，月份缩写） |
| Day | 50.12% | 14.21% | ≈36.64 px | 星期 `TUESDAY`（大字，Anurati 几何切割感） |
| Wind | 25.62% | 28.79% | — | 风粒子发射器中心（左上偏中） |

三块文本都是 `horizontalalign center / verticalalign center`，且 x 都≈水平居中 → 素材B 的原始版式是
**顶部居中三行：星期大字 / 日期中字 / 时间小字**。这正是设计规格 §3 P4 中
`TUESDAY / 03 NOV 2026 / -09:56-` 排版语言的出处。

### 2.4 文本对象脚本逻辑（时间/日期格式）

- **Clock**（`scriptproperties`：`use24hFormat: true`、`showSeconds: false`、`delimiter: ":"`）
  脚本：`"-" + hh + delimiter + mm + "-"` → 例 `-09:56-`（两侧连字符是素材B 的标志性符号）。
- **Date**（`monthFormat: "2"` 缩写、`dayFormat: "2"`、`showDay: false`、`useDelimiter: true`、`addDelimiter: ""`）
  → `03 NOV 2026`（日 + 月缩写 + 年）。
- **Day**（`monthFormat: "1"`、`dayFormat: "2"` 全称、`showDay: true`、`useDelimiter: true`、`addDelimiter: "/"`）
  → `TUESDAY`。
- 三者 `maxwidth 500 / padding 32 / limit* false` —— 文本不换行、不省略，居中锚定。

**本插件复刻口径**（P4 终帧，由 hud/main 排版，whale-art 不写该文件）：
`{DAYKIND} / {DD} {MON} {YYYY} / -{HH}:{MM}-`，字体分工同素材B：**星期 = Anurati 大字**、日期 = Quicksand 中字、时间 = Quicksand 小字带连字符。

### 2.5 模糊特效（blurprecise → 三块文本的柔光）

`effects/workshop/2981960200/blurprecise/effect.json`：

- 两个 pass：先 **水平** 高斯（`blur_precise_gaussian_x.json`），再 **垂直** 高斯（`blur_precise_gaussian_y.json`），
  中间结果绑在 FBO `_rt_FullCompoBuffer1`；`performance: "expensive"`。
- 三个文本对象各带一份实例，`constantshadervalues.scale`：
  Clock `1.28 1.28`、Day `0.43 0.43`、Date `1.33 1.33`，且第二 pass `combos {ENABLEMASK:1, VERTICAL:1}`（带遮罩纵向模糊）。
- 着色器 `blur_precise_gaussian.frag` 依赖 `common_blur.h`，按 `KERNEL` combo 选 `blur13a / blur7a / blur3a`，
  `BLURALPHA` / `MASK` 控制是否与上一结果混合。

**对本插件的意义**：素材B 的文本"柔光光晕"= 双向小半径高斯。
本插件用更便宜的手段等价表达：CSS `filter: blur()`/`text-shadow` + `opacity`（HUD 层），
以及 canvas 侧的多层 sprite 光斑（尾迹）；引擎侧不再做真实高斯卷积，避免 p95 帧时劣化。

### 2.6 风粒子 `Gusts_of_wind.json`

| 段 | 值 | 说明 |
|---|---|---|
| `emitter` | `sphererandom`，`rate 10`，`distance 0–512` | 球形随机发射，10 个/秒，半径 512 世界单位 |
| `initializer` | `lifetimerandom 1–7`、`sizerandom 15–50`、`velocityrandom 100..500 / 0..40 / 0`、`colorrandom 255 255 255`、`rotationrandom`、`alpharandom 0.15–0.5` | 生命 1–7s、尺寸 15–50、速度主要沿 +X（100–500）带轻微 +Y（0–40）、纯白、透明度 0.15–0.5 |
| `operator` | `movement(gravity 0.4 1 0)`、`alphafade`、`angularmovement(drag 1)`、`oscillateposition(mask 0 0 2)` | 轻微上浮 + 透明度淡出 + 旋转阻尼 + Z 轴方向摆动 |
| `renderer` | `sprite`，材质 `materials/workshop/2991402338/particle/fog1_1_1.json`（fog 雾片） | 精灵图，配 fog 材质形成雾感 |
| `maxcount` / `starttime` | 100 / 2s | 场景启动 2s 后开始刮风，上限 100 粒 |
| 实例覆盖 | `count 1.46`、`size 1.54`、`speed 1.35` | 实际 146 粒、尺寸 ×1.54（23–77 px）、速度 ×1.35（135–675 px/s） |

**坐标**：发射器 `origin 983.95, 621.95` → 屏幕 (25.62%, 28.79%)，即**左上偏中**，风从该处向右上吹。

**换算到本插件引擎参数**（engine.js 的云层/fog 程序化层）：

| 素材B 参数 | 引擎参数（建议值） | 依据 |
|---|---|---|
| 风方向 +X 为主、+Y 轻微 | 云层漂移向量 `(+1.0, -0.25)`（屏幕坐标 y 向下，故向上偏） | velocity 100–500 vs 0–40 |
| 速度 135–675 px/s（1920 宽基准） | 归一化漂移速度 `0.070–0.35 /s`（按视口宽度归一） | 675/1920 ≈ 0.35 |
| 尺寸 23–77 px | 云团半径 `clamp(0.012w, 0.04w)` 四个 blob | sizerandom ×1.54 |
| 透明度 0.15–0.5 | 云层不透明度 `0.06–0.22`（乘 0.45 避免压过地球） | alpharandom |
| 生命 1–7s | 云团错相漂移周期 60–90s（CSS keyframes；canvas 用长周期 LFO） | 慢速氛围 |
| `oscillateposition(mask 0 0 2)` | 云层 ±1.2% 横向摆动 + 平台反射 ±2px 微颤 | whale.js 反射已有 `sin(t*11.3)*2px` |

### 2.7 fog 材质与着色器

- `materials/.../particle/fog1_1_1.json` 是粒子材质（fog 雾片），在 `Gusts_of_wind` 里被 sprite 渲染器引用；
  该材质文件未随 scene.pkg 解出（属于 workshop 依赖项），**本插件不复刻其像素级效果**，
  只按 §2.6 把"雾感风团"折算成程序化云层（模糊径向渐变 + 慢速漂移）。
- `shaders/.../blur_precise_gaussian.vert/.frag`：标准 separable Gaussian，本插件不加载任何 WE 着色器。

---

## 3. scene.json ↔ 本插件：时间轴/参数对应表

> 素材B 本身是**循环动态壁纸**，没有时间轴；下表是"把它的静态构图语言翻译成 9.8s 启动序列"的落点。
> 本插件只读取派生的 `hero-4k.webp / hero-2k.webp / poster.webp` 与字体，**不在运行期解析 scene.pkg / scene.json**。

| # | 素材B 事实 | 本插件落点 | 具体做法 / 数值 | Owner |
|---|---|---|---|---|
| 1 | 正交投影 3840×2160、底图 1:1 | engine 主底板 | `hero-4k.webp` 按 16:9 contain/crop 铺满；低配用 `hero-2k`；首帧 `poster` | cloud-motion |
| 2 | `zoom 1.0`，无透视 | P2 镜头推近 | 3.10–5.10s：**1.00 → 1.08** 的 scale 变换（正交相机推近的等价表达） | cloud-motion |
| 3 | `camerafade: true` | P2 舷窗展开 | `--vy-iris` 0→1 的圆形 mask 展开 + 亮度 bloom（`splash.css`） | Lead |
| 4 | `bloomhdrstrength 2.0 / threshold 1.0` | P2 展开瞬间的亮部溢出 | iris 边缘 1px 高光 + `bloom` 透明层（CSS 径向渐变），不写后处理 | Lead |
| 5 | 大气边缘光（底图烘焙，地球弧顶最亮） | P2 边缘光扫过 / 皮肤 `va-rim` | 底图自带；叠加一条 0.6s 的高光扫过 | cloud-motion / skin-glass |
| 6 | 云海（底图烘焙） | 云层漂移 | 程序化 4 团大模糊 blob 叠加，按 §2.6 参数漂移（60–90s 周期） | cloud-motion |
| 7 | `Gusts_of_wind` 粒子 | P2 风噪视觉 / P3 星海空气感 | 见 §2.6 换算表；引擎层用 2–3 条慢速雾带 | cloud-motion |
| 8 | 平台金属反射（底图下 1/4） | P3 鲸影反射 / 平台微颤 | whale.js 在 canvas 上把鲸体剪影镜像压扁画进平台带（`bandTop 0.795h`） | whale-art |
| 9 | Clock 文本（Quicksand-Bold 8.97px，`-09:56-`） | P4 终帧时间 + HUD 时钟 | `--vy-num` 字体；`-HH:MM-` 格式（素材B 的连字符符号） | hud-console |
| 10 | Date 文本（Quicksand-Bold 10.15px，月份缩写） | P4 终帧日期 | `03 NOV 2026` 格式 | hud-console |
| 11 | Day 文本（Anurati 36.64px，星期全称） | P4 大字标 / 终帧主视觉 | `TUESDAY` 等全称，Anurati 大字 | hud-console / Lead |
| 12 | 三块文本全屏水平居中、顶部 7–14% | 终帧垂直构图参考 | 本插件终帧改为**画面 47% 居中锁版**（品牌优先），但保留"星期/日期/时间"三行层级与字体分工 | Lead |
| 13 | 文本高斯柔光（blurprecise） | HUD 文本光晕 | `text-shadow` + `filter: blur` 低成本等价（不做卷积） | hud-console |
| 14 | 文本 brightness 2.39 / 1.4 / 1.98 | 文字亮度层级 | 时间最亮（2.39）→ 日期次之（1.98）→ 星期最暗（1.4，但字号最大） | hud-console |
| 15 | Anurati / Quicksand 字体随附 | 字体表 §2.2 | `lib/assets/fonts/Anurati-Regular.otf`、`Quicksand-Bold.otf`，`@font-face` 在 `preview/css/splash.css` | whale-art |
| 16 | 无字版（用户点名） | 全部画面 | 底图确认无任何文字/水印，可放心叠加 DSH 元素 | — |

---

## 4. 品牌资产（DSH 官方来源）

| 资产 | 来源 | 生成方式 |
|---|---|---|
| `brand/whale-official.svg` | app.asar → `@deepseek-ai/dsh-web-frontend/dist/favicon.svg` | 原样提取（母本存档） |
| `brand/whale.svg` | 同上 `<path d>` | 单 path、`currentColor`、viewBox `0 0 50 50`、3.6 KB → 可内联可着色 |
| `brand/wordmark.svg` | app.asar → web-frontend bundle 的 `BrandWordmark` 组件 | mock jsx runtime 求值后序列化为静态 SVG（19 条官方 path，viewBox `26 0 156 24`） |
| `brand/lockup.svg` | 同上 + 鱼标 | 鱼标 + `deepseek` + 白底 `HARNESS` 徽标（官方反相配色），viewBox `0 0 182 24`，15 KB |
| `brand/whale-silhouette.svg` | 以官方鱼标为母本**重绘** | 头右尾左游动姿态；`#whale-dorsal / #whale-tail / #whale-fin / #whale-body` 四层可分离；尾鳍铰点 `(52,68)`、胸鳍铰点 `(240,88)`；眼与嘴用 `fill-rule=evenodd` 镂空（纯 path，不依赖底色） |

三个字标 SVGV 均满足"可内联、无外链、无滤镜依赖"（`_build/assets-b.json` 的 `inlineSafe: true` 由脚本断言）。

**鲸体运行期**：`preview/js/whale.js` **内联** `whale-silhouette.svg` 的路径常量（file:// 下 fetch 本地 SVG 会被 CORS 拦），
同源性由 `_tools/asset-b/sync-whale-js.mjs --check` 在构建期断言（不同源 → exit 1）。

---

## 5. 字体处理（素材B 部分）

| 字体 | 文件 | 体积 | 许可 | 本插件用途 |
|---|---|---|---|---|
| Anurati-Regular | `fonts/Anurati-Regular.otf` | 8,176 B | 作者随素材附带（免费字体） | 终帧星期大字标（`--vy-display`） |
| Quicksand-Bold | `fonts/Quicksand-Bold.otf` | 29,324 B | SIL OFL 1.1 | 终帧日期/时间（`--vy-body`） |

**otf → woff2 未执行**：本机 Python 环境未安装 `fontTools` + `brotli`（`import fontTools` → ModuleNotFoundError），
按 task-1 约定"不可用则保留 otf 并在 docs 说明"。影响评估：

- 体积：8.2 KB / 29.3 KB，**均远低于设计规格 §6 的每字体 ≤100 KB 预算**，woff2 的压缩收益（约 30–40%）不构成交付风险；
- `preview/css/splash.css` 已按 `format("opentype")` 正确引用（`@font-face` 的 `src` 与文件扩展一致），浏览器支持 OTF/CFF 直载；
- 若后续拿到 fontTools，可一行式转换并用 `src: url(x.woff2) format("woff2"), url(x.otf) format("opentype")` 双列；
- 其余 6 个字体（Oxanium / Share Tech Mono / JetBrains Mono ×2 / Montserrat / Noto Sans JP ×2）来自 Material A 与 DSH 官方，**本身就是 woff2**，无需转换。

字体引用校验：`lib/assets/fonts/` 内 **9 个文件全部被 @font-face 引用**——`preview/css/splash.css` 7 条
（Anurati / Quicksand / Oxanium / Share Tech Mono / JetBrains 400 / JetBrains 500 / Montserrat），
`preview/css/hud.css` 2 条（Noto Sans JP 500 / 900）；文件名与引用大小写逐一对齐
（woff2 全小写、OTF 按原大小写；Windows 不区分大小写但宿主在 Linux 下需要一致）。

---

## 6. 素材合规声明

1. **素材性质**：`3806012039`（威龙 VYRON 4K 动态壁纸）与 `3804048141`（CMD\LN 终端 HUD）均为
   **Wallpaper Engine（Steam 创意工坊）第三方素材**，著作权归原作者所有。
2. **使用范围**：仅用于本机自用的 DSH 启动动画/皮肤（`dsh-startup-vyron` 本机 bundle）。
3. **禁止事项**：不发布到公共 npm registry / 任何公共插件市场；不二次分发；不用于商业用途；
   不以本插件为载体传播原始素材（`hero-*.webp`、`poster.webp`、scene 解包件均为本机派生，随包仅本地安装）。
4. **DSH 官方元素**（鱼标、`deepseek / HARNESS` 字标、Montserrat 字体、DSH 蓝 `#4D6BFE`）仅用于 DSH 界面装饰，
   不代表 DeepSeek 官方发布物；字标矢量取自本机安装的 DSH（app.asar），不对外分发独立 SVG。
5. **字体许可**：Quicksand = SIL OFL 1.1；Montserrat = SIL OFL 1.1（`_brand/dsh/.../Montserrat-OFL.txt`）；
   Anurati = 素材作者随包附带；Oxanium / Share Tech Mono / JetBrains Mono = SIL OFL；Noto Sans JP = SIL OFL。
6. 上述条款须同时写入 `THIRD-PARTY-NOTICES.md` 与 `README.md` 顶部（由 Lead 汇总，whale-art 不写这两个文件）。

---

## 7. 验证记录

| 项 | 方法 | 结果 |
|---|---|---|
| hero-4k 尺寸/编码 | Pillow `Image.open` | 3840×2160 / WEBP / RGB ✅ |
| hero-2k、poster 尺寸 | 同上 | 1920×1080、1280×720 ✅ |
| 三图体积预算 | 设计规格 §6（1.2MB/400KB/200KB） | 555/267/139 KB ✅ |
| SVG 可内联性 | `_tools/asset-b/make-assets-b.py` 正则断言（无 `<image>`/`xlink:href`/`@import`/外链 url） | 5 个 SVG 全 `inlineSafe: true` ✅ |
| 剪影路径与 whale.js 同源 | `sync-whale-js.mjs --check` | `already in sync`（mark 3,394 / dorsal 50 / tail 117 / fin 121 / body 354 / belly 117 字符）✅ |
| 字标渲染 | headless Chrome 内联渲染截图 | `deepseek HARNESS` 字形与宿主一致 ✅ |
| 鲸体渲染 | headless Chrome `?t=5.6 / 6.6 / 7.9 / 8.8` | 4 帧姿态/尺度递进 + 终帧落位 mark slot ✅ |
| 资产清单 | `_build/assets-b.json`（17 文件、1,177,480 B、预算 0 超标） | `--check` exit 0 ✅ |

**未验证项**

- `.tex` 容器中 mip 之外的辅助贴图（若有）未逐一确认用途；本插件只依赖 mip0。
- `fog1_1_1` 粒子材质文件未随包解出，其雾感效果按视觉近似而非像素级复刻。
- 4K 屏实际缩放观感（当前截图固定 1600×900 headless）。
- 真实 DSH 启动流程下的观感（需用户重启 DSH 验证）。

---

## 8. ROUND 2 精修：鲸体渲染升级 + 轨迹重做（whale-art，2026-11-03）

> 用户反馈（v0.1.0）：「大白鱼结束前落点到字幕位置再化形消失的想法是好的，但最后结束前在乱窜；质感太草率、太廉价。」
> 本轮按 `_handoff/ROUND2-PLAN.md §4.3` 重做轨迹、质感、尾迹与 morph。写盘范围仅
> `preview/js/whale.js`、`preview/css/whale.css`、本文件、`lib/assets/brand/`（本轮未新增品牌资产）、
> `_shots/round2-whale/`。API / `T` 常量语义 / reduced 静帧口径保持不变。

### 8.1 轨迹：单条连续路径（替换旧版三次方向反转 + 末端瞬移）

| 阶段 | 区间 | 内容 | 实现 |
|---|---|---|---|
| 跃出 | 5.06 – 6.30 | 左下（<-0.1w, >1.0h）→ 右上弧，高点 ≈(0.62w,0.30h)，终点 **(0.80w,0.33h)** | 13 点 Catmull-Rom 样条 + 弧长参数化 |
| 折返 | 6.30 – 7.35 | 一个连续侧倾（bank ≤10°）大弧折返到 `#vyMarkSlot` 中心，**速度精确归零** | 同一条样条；速度剖面单峰（峰值在 6.30） |
| 悬停 | 7.35 – 7.52 | 摆尾 1 次、胸鳍收拢、体量 0.62×→**0.42×** | 末段航向 12px/s 极缓微滑（累计 ≤6px），保证近零速方向角有定义 |
| 化形 | 7.52 – 7.74 | 鲸体收缩到 0.42×0.42 并淡出，粒子向 mark 汇聚；7.60 白闪期 morph 起点就在 mark | 粒子 96 枚（t 的解析函数） |
| 落位 | 7.60 – 8.90 | 官方鱼标在 mark 点亮 → 呼吸光晕 → P5 声呐环 | 既有 morph 保留，起点位移 ≤3px |

**关键数值**（`_shots/round2-whale/path-smoothness.json`，poseAt 采样 t=5.06…7.56 step 0.02）：
路径总长 3150px；峰值速度 2334px/s @t=6.26；**最大方向变化率 80.8°/0.1s**（门 ≤120，翻转 0 次）；
末位距 mark 中心 **2.5px**（门 ≤24）；最大单步位移 46.8px（门 80px）；无「先过 mark 再离开」。

**与 plan §4.3 的偏差（已论证）**：plan 要求 A 段「easeOut 减速」+ B 段「减速到 0」，但按 6.30 必须
到达 (0.80w,0.33h) 的几何约束，A 段平均速度 1548px/s 高于 B 段 1172px/s；若 A 段取 easeOut，则 6.30
速度必低于 B 段均值 → 合速度出现第二峰（违反同节「合速度单峰后归零」）。故实现为**三角形速度剖面**：
A 段 751→2334px/s 平滑加速（smoothstep，端点加速度 0），B 段 2334→0 平滑减速（1-smoothstep，末速/末加速度
均为 0），两段积分严格等于各自弧长（6.30 落点误差 0.0px）。

**3D 朝向**：航向穿越竖直（74°→106°）时用 **180° 偏航「转身」**代替平面内翻转（鲸腹始终朝下），
末段叠加 24° 残余偏航（= plan 的 rotY 0→24° 的可视化等价实现，`pose.rotY` 实际记录 204°）。

### 8.2 质感：鲸体改为 canvas 逐帧渲染（目标「一眼高级」）

旧版是单层 SVG 平涂 + 一道高光；SVG 逐帧改属性会触发滤镜重栅格化，成本高。本轮把鲸体
（尾鳍/背鳍/胸鳍/身体/眼/嘴）改为 canvas 2D 在 `#vyWhaleFx` 上逐帧绘制，几何仍用同步的
`whale-silhouette.svg` 路径（Path2D，`@paths` 区块未改，`sync-whale-js.mjs --check` 通过）。

材质层（自下而上）：
1. **12 段体表纵向渐变**：顶白 → 云白 → 冷蓝腹 → 底部暖沙反照；
2. **软投影 + 深空分离描边**（亮云海背景上仍有清晰轮廓与体积）；
3. 腹部软阴影 / 侧腹体积影 / **暗侧 terminator**（光从右上打来）/ 腹部暖白反光 / 鳍根 AO；
4. **动态焦散**：3 条暗部冷蓝波纹（source-over）+ 4 条亮部白青波纹（lighter）+ 5 条体表流线
   + 6 段背部鳞光；全部是 t 的解析函数，缓慢平移，亮纹层 opacity ≤0.10；
5. **背脊高光带**（宽晕 + 细核）+ 吻端湿镜面高光 + 缓慢横移的**镜面扫光带** + 两条极淡虹彩带；
6. **三色边缘光**（上空气蓝 / 下生物光青 / 靠地球暖侧沙金）+ 上缘 specular 亮线；
7. **半透明胸鳍**（fill-opacity 0.82 + 内渐变 + 亮边 + 鳍条）、尾鳍/背鳍同材质分层；
8. 眼部：深蓝黑**虹膜**（径向渐变、杏仁形）+ 瞳孔 + **白高光点** + 眼睑环；嘴线细深色；
9. 轻微 **squash/stretch ±2%**；尾鳍与胸鳍拍动**相位错开**（摆动 ±15°/±10°，收尾时胸鳍收拢 -24°）；
10. 外发光分层（内圈白热 + 外圈青蓝，呼吸 + 收尾增亮）。

降级：canvas 2d 不可用 → 退回内联 SVG 鲸体（静态渐变版）+ 摆尾 transform；reduced → 无鬼影。

### 8.3 尾迹 / 反射 / morph

- **尾迹**：tapered ribbon 4 层软边（外晕 2.6× → 主带 1.55× → 亮核 0.78× → 热线 0.30×），
  宽度按 `wNear·(1-age)^k` 快速收窄；颜色带 白热→生物青→空气蓝→透明；近端宽 26px、远端 5px；
  速度越快拖尾越长（窗口 0.28–0.90s，速度归一化后取幂）；两层 glow + 亮核；有机摆动（老段更松）；
  生物光气泡 ≤120 个（出生率 52/s，生命 0.45–1.35s，逐帧解析、定格可复现）；
  数据刻度线保留但降透明（主线 0.13–0.20）。
- **平台倒影**：镜像剪影 + 5 条多频正弦 ripple 高光带（横向微颤）。
- **morph**：96 枚粒子从鲸体表面向 mark 汇聚（easeInCubic + 侧向摆动 + 短拖尾），
  鲸体同步收缩淡化；mark 由 opacity/scale 点亮 + canvas 径向爆闪 + 呼吸光晕。

### 8.4 验证与性能（本机 1600×900 headless Chrome）

| 项 | 方法 | 结果 |
|---|---|---|
| 轨迹平滑 | `_shots/round2-whale/check-whale-path.mjs`（CDP 调 `VYRON_WHALE.poseAt`） | **7/7 断言 PASS**（`path-smoothness.json/.txt`） |
| path 与资产同源 | `_tools/asset-b/sync-whale-js.mjs --check` | `already in sync` |
| 冒烟 | `node test/smoke-preview.mjs` | **PASS 122 / FAIL 0** |
| 模块成本 | 160 帧 `whale.update()` JS 计时（基线 vs 本轮） | avg 1.47→**1.04ms**，p95 2.8→**2.0ms**，max 3.8→**3.4ms**（不劣化，反而下降） |
| 整页 p95 | 完整 9.8s 动画（1600×900 headless） | 基线 208.1ms → 本轮 209.7ms（+0.8%，<15% 门；该值由 engine/hud 主导） |
| console | 关键帧 + 完整动画 | 0 error / 0 exception |
| 定格可复现 | 同 t 两次截图 | 逐像素一致（全部效果为 t 的解析函数） |

证据目录 `_shots/round2-whale/`：`before-t*.png`（改前 8 帧）/ `after-t*.png`（改后同 8 帧）/
`after-morph-t762/772/792.png`（粒子化 morph）/ `after-reduced.png`（reduced 静帧）/ `dev*.png`（逐轮迭代）/
`crop*.png`（鲸体/尾迹局部放大自查）/ `path-smoothness.*`、`*-bench.json`、`*-live-stats.json`。

### 8.5 尚未验证的假设

- 真实 DSH 启动流程（iframe + 宿主背景）下的观感需用户重启验证；headless 截图固定 1600×900。
- 独立 verifier 的 `analyze-whale.py` 把「峰后任何 >20% 峰值速度」都记为 multi_peak；本实现为平滑单峰
  （峰后单调下降、无局部极大），该朴素判据会恒为 true，建议改为「峰后局部极大」判定。
- 60fps 真机下 canvas 合成（两时长画布 + 全局 CRT 扫描线叠层）的实际帧时未在真机采样。
- 4K/高 DPR 屏上 canvas 内部分辨率按 dpr 自动放大，锐度未在 2x DPR 上截图核验。

