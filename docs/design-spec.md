# VYRON · 星海鲸航 — 启动动画 + UI 皮肤整合插件 · 设计规格

> 唯一设计权威源。实现以本文件的数值、接口、素材分配为准；改动先改本文件。
> 版本：v0.1-draft（2026-11-03）｜代号：STARWHALE｜包名：`dsh-startup-vyron`

## 0. 一句话

把包内两份 Wallpaper Engine 素材熔成一个 DSH 启动序列：**「CMD\LN」终端 HUD × 「威龙 VYRON 4K」轨道地球图**，
让 DSH 的大白鱼从地球云海游进星海，最后落在 **DEEPSEEK HARNESS** 字标上；主界面同步换成「星海终端」皮肤。

**素材分配（用户点名要的"融合、分配"）**

| 素材 | 提供什么 | 用在哪 |
|---|---|---|
| `3804048141`（CMD\LN V1.03 终端 HUD） | 终端四窗/日志流、micrographics 微图形集、雷达、月球相位、日轨条、session ledger、Oxanium / Share Tech Mono / JetBrains Mono / Noto Sans JP 字体、`#E8E9EA/#A3A6AA/#85888C` 单色终端色阶、CRT/VHS 扫描层、预设色板（grey/sakura/olive/crimson/navy） | **启动动画 P0–P2 的 HUD 层**（开机自检、终端日志、雷达扫描、月球/日轨/账本），**皮肤 full 档的微图形装饰**、皮肤信息密度与字体语言 |
| `3806012039`（三角洲行动威龙 VYRON 动态版 4K，无字版 3840×2160） | 轨道地球 4K 底图（星空/大气边缘光/云海/沙漠/平台金属反射）、孤独操作员剪影、Anurati-Regular + Quicksand-Bold 字体、Gusts_of_wind 风粒子与 fog 雾效的档案（scene.json）、时间/日期排版语言（`TUESDAY / 22 SEP 2026 / -09:40-`） | **启动动画 P2–P5 的主画面**（4K 底板、镜头推近、云层漂移、星点闪烁、平台反射）、终帧日期/时间排版、皮肤 glass 档的星海动态背景 |
| DSH 官方（取自 app.asar） | 大白鱼 `FishLogo` favicon SVG、`DeepSeek Harness` 字标（Montserrat 500）、DSH 蓝 `#4D6BFE` | **大白鱼主角**、终帧字标、皮肤主强调色、插件 icon |

## 1. 交付物

一个可安装的 DSH bundle：`dsh-startup-vyron`（本机包，含第三方游戏壁纸素材，不公开发布）。

- **启动动画**：全屏 iframe 启动层（P0–P5，TOTAL=9.8 动画秒），可跳过 / 减弱动态 / 速度 50–150% / 音效音量可调 / 每次会话或每天一次。
- **UI 皮肤**：off / accent / full / glass 四档 × orbit / terra / abyss 三主题；玻璃通透度可调；动态星海背景可关。
- **设置页**：「VYRON 星海鲸航」分组：播放 / 声音 / 外观皮肤 / 预览（内嵌回放）。
- **离线预览**：`preview/index.html`，?t= 定格、?speed=、?sound=、?probe=1，用于验收与二次开发。
- **测试与文档**：`test/*.mjs` 冒烟断言、`README.md`、`INSTALL.md`、`CHANGELOG.md`、`THIRD-PARTY-NOTICES.md`、本规格、验证报告。

## 2. 视觉概念

**叙事**：一台在轨终端冷启动（Material A 的 CMD\LN 控制台）→ 舷窗打开，露出地球与星海（Material B 的 4K 底板）→ 大白鱼从地球云海跃出，横越星海，尾迹化作数据流 → 撞入镜头、化为 DSH 鱼标 → 字标 + 实时日期/时间/月相/宿主事实锁版 → 鲸叫余韵中，光缝展开交接主界面。

**情绪曲线**：静（黑场ping）→ 密（终端数据流）→ 阔（地球全貌）→ 灵（鲸跃）→ 定（字标）→ 交（光缝通电）。
**节拍**：P0 0.65s / P1 2.45s / P2 2.0s / P3 2.5s / P4 1.4s / P5 0.8s；允许慢段（P2 推近）与快段（P3 鲸跃）。
**构图**：16:9 为主、竖屏/超宽自适应；地球占画面上 2/3，平台水平线在画面下 1/4。
HUD 构图分两段（Round2 修订）：**P0–P1 中央给「DSH ORBIT CORE」**（素材 A 中央雷达/轨道图 + 官方鱼标，解决"中间太空"）；**P2 起中央 60% 留给画面与鲸**，HUD 只占边缘与四角。

### 2.1 调色板（从 4K 底图取样，锁定）

| 语义 | token | 值 | 用途 |
|---|---|---|---|
| 太空底 | `--v-space` | `#050a16` | 黑场、皮肤底 |
| 深空层 | `--v-space-2` | `#0a1424` | 面板/玻璃基色 |
| 地球海 | `--v-ocean` | `#1d4f8c` | 主蓝、链接 |
| 大气边缘 | `--v-rim` | `#57a8ff` | 边缘光、焦点环 |
| 云白 | `--v-cloud` | `#eef2f6` | 主文字（深色皮肤） |
| 云暖 | `--v-cream` | `#f1e6d2` | 高光文字、日期 |
| 沙漠暖 | `--v-sand` | `#c9a46a` | 次强调、警示 |
| 平台钢 | `--v-steel` | `#8b9aab` | 次级文字、分隔线 |
| DSH 蓝 | `--v-brand` | `#4d6bfe` | 主强调（品牌）、按钮 |
| 终端灰阶 | `--v-ink-1/2/3` | `#e8e9ea / #a3a6aa / #85888c` | HUD 文本三级（Material A 原值） |
| 生物光青 | `--v-bio` | `#7ef0d4` | 鲸尾迹、扫描线、成功态点缀 |

### 2.2 字体（全部 SIL OFL / 官方随附，本地打包）

| 字体 | 来源 | 用途 | 文件 |
|---|---|---|---|
| Anurati-Regular | Material B | 终帧大字标（字母宽间距、几何切割感） | `lib/assets/fonts/anurati.otf` |
| Quicksand-Bold | Material B | 终帧日期/时间 | `quicksand-bold.otf` |
| Oxanium 200 | Material A | 大数字（时钟/百分比） | `oxanium-200.woff2` |
| Share Tech Mono 400 | Material A | HUD 标签/标题 | `share-tech-mono-400.woff2` |
| JetBrains Mono 400/500 | Material A | 日志/正文 | `jetbrains-mono-400.woff2`、`-500.woff2` |
| Montserrat 500 | DSH 官方 | DSH 字标（与官方 UI 一致） | `montserrat-medium.woff2` |

UI 皮肤不改宿主正文字体栈，只在 `.vy-hud-*` 装饰层使用上述字体（避免破坏可读性）。

## 3. 启动动画时间轴（动画秒；TOTAL=9.8）

| # | 相位 | 区间 | 画面 | 声音（见 §5） | 模块 |
|---|---|---|---|---|---|
| P0 | `signal` | 0.00–0.65 | 纯黑；**中央官方鱼标（72–88px，环+光晕）+ `DEEPSEEK HARNESS` 字标 + `CMD\LN · BOOT SEQUENCE` + `T-0.65`**（Round2：开幕即有 DSH 元素）；中央 1px 水平缝；四角 12px 角标；顶部/底部 chrome | ping + 次低频嗡鸣起 | main + engine(黑) |
| P1 | `console` | 0.65–3.10 | Material A 控制台开机：全屏 40px 网格、四窗依次推入（左上活动日志、右上遥测、左下 micrographics、右下 session ledger）、**中央 ORBIT CORE（素材 A 的大雷达/轨道图回归画面正中：三层同心环 + 虚线环 + 十字准线 + 罗盘标签 + conic 扫掠 + 3 个雷达点；核心=官方鱼标 + `--vy-sync` 进度环 + `DEEPSEEK HARNESS` 字标 + `BOOT CORE · CMD\LN`；底部 `AUDIO · L/R · 128 BINS` 频谱 + 坐标带；两侧竖向遥测流）**、日轨条、月相、终端打字日志、`SYNC 00→100`、HUD 色阶全用 Material A | 键盘/蜂鸣 4 连击、伺服升频、低频心跳 | hud |
| P2 | `breach` | 3.10–5.10 | 舷窗开：HUD 中央 ORBIT CORE 充能放大成 iris 圆 + 四窗向外滑出成边缘框；4K 地球画面从中心圆/缝展开（iris + 亮度 bloom）；镜头由 1.00 推到 1.08；**地球运动层（Round2）**：云层相对地表反向漂移 9.3–11.0px/s（地表 +0.85px/s，新增合成层 1）、limb 8.4s 呼吸 0.75→1.0 + 色温偏移、星点相机视差 ~2px、4.0–5.0 大气光扫；平台反射 ×1.22 + 横向微颤 | 低频冲击 + 气流喷涌 + 风噪渐起 + 上升音墙 | engine + main 转场 |
| P3 | `whale` | 5.10–7.60 | **Round2 轨迹（单条连续、无乱窜）**：5.06 自左下云海跃出 → 5.06–6.30 右上弧线（高点 ~0.62w/0.30h，终点 ~0.80w/0.33h）→ 6.30–7.35 一次连续侧倾（bank）大弧折返到 `#vyMarkSlot` 中心（末速归零，误差 ≤24px）→ 7.35–7.52 在 mark 处悬停收尾（体量缩到 ≈0.42×）。**质感**：canvas 逐帧鲸体（12 段体表渐变 + 背脊高光 + 腹部暖白 + 动态焦散 ≤0.10 + 镜面扫光 + 三色边缘光 + 半透明鳍 + 虹膜/高光/眼睑 + 软投影 + squash ±2%）；尾迹 = 4 层 tapered ribbon（白热→青→蓝→透明，26→5px）+ ≤120 粒子 + 淡化刻度；平台倒影 5 条 ripple；HUD 边缘扫描条掠过 | 远鲸叫 → 近鲸叫（两声，带混响）；低频下潜 | whale + engine |
| P4 | `lockup` | 7.60–9.00 | 白闪（7.52–7.92，峰值 7.70）中鲸体粒子化、在 mark 位置化为官方 DSH 鱼标（morph 起点即在 mark，位移 ≤24px；96 粒子向 mark 汇聚）；`DEEPSEEK HARNESS` 字标由数据刻度拼合；下方 Anurati 排版实时日期/时间（如 `SATURDAY / 03 NOV 2026 / -09:56-`）；月相 + `SYNC 100%` + 宿主 facts（PROFILE/MODEL/WORKSPACE/SESSIONS）；HUD 中央环以 7.5% 透明度在字标后回归一次（7.28–8.95）；右下「按任意键进入 / PRESS ANY KEY」 | 锁版冲击 + 大调和弦 shimmer + 鲸鸣回声 | whale + hud + main |
| P5 | `bloom` | 9.00–9.80 | 鱼标爆发一圈声呐环；9.02 高闪 + **终帧向 y=50% 收束成一条光缝**（lockup 纵向压扁 + 提亮 + 粒子化，9.20–9.62 全场压黑只剩光缝）；9.80 发 done → 宿主交接（**1200ms**：光缝 → 上下黑幕从中央缝滑开 → UI 从线里展开 + 声呐环飞入输入框 + 光带扫到顶栏） | 功率下潜 sweep + 交接钟声（宿主侧 `handoff.wav`） | main + splash.js |

**速度模型**（与 elisa 同构，代码与测试统一）：
`SPEED = clamp(splashSpeed,50,150)/100`，默认 **85**；主时钟 `t_anim += dt * SPEED`；
墙钟总长 = `TOTAL/SPEED`（85% → 11.5s；50% → 19.6s；150% → 6.5s）。
`IMPACT = 1/sqrt(SPEED)` 只缩放一次性冲击动作的 CSS 时长；循环氛围动画保持 1x。
看门狗 `WATCHDOG_MS = clamp(4000 + TOTAL*1000/SPEED + HANDOFF_MS, 8000, 40000)`；宿主兜底 = 看门狗 + 3000。

**减弱动态**（reducedMotion / `prefers-reduced-motion`）：跳过 P2 推镜与鲸游动轨迹（静帧定格在终帧构图），保留 4 帧淡入与终帧 2.2s 停留；不播风声与鲸叫，只留 ping + 锁版钟声。
实现口径（v0.1.0 修正）：reduced 分支用 `COMPOSE_T = TOTAL - 1.0`（8.8s）驱动 `draw()` 与 `updateStage()`，
使 iris/reveal=1、P0 信号层隐藏、锁版亮起、header/footer 与 hint 按 allowSkip 显示；鲸鱼 swim 层隐藏，仅留终帧官方鱼标。

### 3.1 Round2 收束与宿主交接（1200ms 基准）

**预览侧收束（9.02–9.80，动画秒）**：
- `--vy-collapse` 9.02→9.40：终帧 lockup 纵向压到 0.045×、横向压到 0.66×、向下压到 y=50%，同时提亮+模糊；sub/meta 先淡出；
- 9.02 高闪（`--vy-flash` 峰值 ~0.09s，0.30s 内衰减）；
- `--vy-seam` = max(9.02–9.80 缓动, `--vy-collapse`)：光缝在收束完成时已拉满整幅；
- 9.20–9.62 全场压黑（`.vy-blackout`），只剩光缝；9.80 done 时画面 = 纯黑 + 整幅水平光缝。

**宿主侧交接（lib/splash.js，基准 ms × k，k = ms/1200）**：

| ms | 动作 |
|---|---|
| 0 | `#dsh-vyron-root` → `vyron-handoff`（容器透明）；光缝 200ms 亮起；iframe 120ms 内藏到黑幕之后 |
| 120 | 上下两块 `.vyron-bar` 从中央缝向上下滑开（930ms，easeInOut）；宿主 UI 从这条线里展开 |
| 300 | `<html>` 加 `.vyron-enter`：`#root` 亮度/饱和爬升 900ms；皮肤侧 sidebar/topbar → composer → 内容分区显影（皮肤 CSS） |
| 420 | 声呐环从画面中央飞向 `[data-composer-card]` 矩形（680ms），交给皮肤 composer 环 |
| 700 | 竖直光带从 y=50% 扫到顶栏（520ms），落下后顶栏日轨增亮 →“启动线变成 UI 的时间轨” |
| 760 | 中央光缝淡出 |
| 1200 | 清理覆盖层/类、解锁滚动、派发 `dsh-vyron:done` |

跳过分支：同编排压缩（skip 基准 600ms）；reduced：380ms 快速淡切（不播钟声）；错误/超时：40ms 释放。
`HANDOFF_BASE_MS = 1200` 在 `lib/splash.js` 与 `preview/js/timeline.js` 两处一致；`lib/index.js` / `lib/client.js` 的兜底公式使用 1200。


## 4. UI 皮肤规格

### 4.1 档位（设置页可选，保存即生效）

| 档 | 说明 |
|---|---|
| `off` | 原版宿主，零样式 |
| `accent` | 只换设计 token（深空色阶 + DSH 蓝强调 + 暖云文字），无装饰层 |
| `full` | accent + 终端装饰层：顶栏日轨/月相、四角角标、micrographics 微图形条、session ledger 标签、输入框声呐环 |
| `glass` | **默认**：full + 动态星海背景（CSS 多层）+ 整窗毛玻璃 + 可调通透度 + 玻璃高光/颗粒/边缘光 |

### 4.2 主题

| 主题 | 底 | 高光 | 强调 | 适用 |
|---|---|---|---|---|
| `orbit`（默认） | 太空深蓝 | 大气青蓝 | DSH 蓝 | 深色宿主（默认） |
| `terra` | 地球蓝 + 沙漠暖 | 云暖白 | DSH 蓝 | 深色宿主，偏暖 |
| `abyss` | 近黑 | 生物光青 | 青 | 夜间/低亮度 |

所有主题都要给 **light 宿主**一套可读 token（light 下玻璃改为亮色半透，文字深色），不允许出现白底白字。

### 4.3 动态背景层（`#dsh-vyron-ambient`，CSS-only）

`va-base`（深空渐变）→ `va-stars`（两层 box-shadow 星点 + 闪烁 + 90s 慢漂 2.4vmax）→ `va-earth`（底部 55% 的地球大气边缘光，径向渐变）→ `va-cloud`×4（4 团超大模糊径向渐变云，错相漂移 60–90s）→ `va-sea`（底部平台反射水平线 + 微光）→ `va-sheen`（8.4s 呼吸 + `::before/::after` 两层极光帘幕 84s/90s 横移）→ `va-grain`（颗粒）→ `va-vignette`（暗角）→ `va-rim`（顶部边缘光）。
**Round2 呼吸振幅（用户要求"呼吸感要强、观感明显"）**：`va-sheen` opacity 0.06↔0.52 + 1.5% scale；`va-earth` 0.55↔1.0 + 2.2% scale；`va-rim` 0.10↔0.62 + 1.4% scale；上述各层 8.4s 同频呼吸（合成周期与 84s/90s 帘幕互质，肉眼循环可见）。
降级语义（Round2 修订）：**`--static`（`skinMotion=false` / `reducedMotion` 设置 / 低配 ≤4 线程）仍为全静态一帧**；**操作系统 `prefers-reduced-motion: reduce` 改为"减少动态"**——停大位移/缩放/漂移与 `::before/::after` 帘幕，但保留低频 opacity 呼吸（8.4s）+ composer 低速流光（见 §4.4）+ 交接分区显影的 opacity 淡入（依据：用户显式 `skinMotion=true` 优先于 OS 默认；8.4s 低频呼吸低于 WCAG 闪烁风险阈值）。`prefers-reduced-transparency` / 无 `backdrop-filter` / 页面后台降级不变。`glassTransparency` 0–100 映射 `--vyron-glass-alpha`（50=标准）。

### 4.4 玻璃与装饰（选择器策略）

- 全部作用域在 `html.dsh-vyron-skin` 下；玻璃档加 `.dsh-vyron-skin--glass`、主题用 `html[data-vyron-theme="..."]`。
- 用 `:where([class*="xxx" i])` 这类宿主 CSS Modules 前缀选择器，写好降级（宿主升级后缀变化时不清零布局）；不改字号/行高/布局，只改颜色、背景、边框、阴影、滤镜。
- 装饰层：顶栏日轨条（当前时间刻度 + 游标呼吸）、侧栏底部 micrographics 条（呼吸）、四角 `⌜⌝⌞⌟`、输入框声呐环/流光，均不拦截指针（`pointer-events:none`）、不新增布局位移。
- **输入框"流光"（Round2，用户点名）**：`[data-composer-card]::before` = 1.6px 环上的**彗尾流光**（白热 34° + 生物青 166° 双窄弧，5.6s/圈，环亮 0.9–1.0）；`::after` = 反向 7.2s 副光晕 + 6.4s 呼吸；卡面叠加 ≤0.06 的斜向流光扫过；`focus-within` 整体 ×1.2；OS reduce 下保留低速流光（降速、降对比）。
- 保留 `backdrop-filter` 不支持时的实心降级；`--vyron-glass-alpha` 变量驱动。

## 5. 声音设计（程序化合成，无外部音源）

一条 `vyron-boot.wav`（10.4s，44.1kHz/16bit/stereo，随速度以 `playbackRate`+`preservesPitch` 伸缩）+ `handoff.wav`（1.45s 交接：120ms 缝 click → 550ms 大调钟声 → 850ms bloom → 空气尾）。

| 动画秒 | 事件 | 合成 |
|---|---|---|
| 0.00 | 声呐 ping | 正弦 880→420Hz 下滑 + 长混响尾 |
| 0.30–2.9 | 低频嗡鸣 | 55Hz 正弦 + 轻微 detune，缓慢上行 |
| 0.75 / 1.05 / 1.38 / 1.72 | 终端蜂鸣 4 连 | 2.2–3.6kHz 短正弦脉冲 + 噪声点击 |
| 1.9–3.0 | 伺服升频 | 带通噪声中心频率 300→1800Hz |
| 3.10 | 舷窗冲击 | 38Hz 下潜 + 反向气流噪声爆 + 混响 |
| 3.3–5.4 | 风噪/星海空气感 | 粉噪过移动带通 + 缓慢 LFO，声像缓慢移动 |
| 4.4–5.1 | 上升音墙 | 3 层锯齿/三角泛音滑音 + 低通开合 |
| 5.15 / 6.35 | 鲸叫 ×2 | 基频 320→120Hz 滑音 + 3 共振峰（formant 带通）+ 颤音 + 双回声 |
| 7.60 | 锁版冲击 + 和弦 | 次低频 drop + 大三和弦（D3/A3/F#4）shimmer pad 叠 4 层 |
| 8.6–9.6 | 功率下潜 | 白噪/低频 sweep 下行 + 高通闭合 |
| 9.80 | done（宿主） | handoff.wav：缝 click → 大调钟声 → bloom → 空气尾（1.45s） |

**Round2 重制（用户："听感太单一、不够科技科幻太空"）**：v1 → v2.1 在保留上表 16 个规格事件（时间点 0.0ms 偏差）的基础上，追加 **4 层全程铺底**（35–55Hz sub 长音 / Dm9 和弦 pad+慢 LFO 低通 / 中心空气 6–14k / 深空双段长混响），事件全部层次化；实测四频段（mono downmix 口径）**27.7 / 49.3 / 14.0 / 9.03%**（v1：33.9 / 60.0 / 6.0 / 0.16%）；−15.8 LUFS、true peak −4.6 dBFS、stereo corr 0.620；交接 cue 对齐 7/7。**听感未经人耳验证**（本机无试听条件），8k 以上空气层亮度与 pad 低频清晰度需真机确认。

自动播放被拦截时静音降级；首次点击/按键后从当前进度补播（`sync(t)` 对齐）。音量 0–100 映射线性。

## 6. 资产规格（`lib/assets/`）

| 资产 | 规格 | 预算 | 来源 |
|---|---|---|---|
| `hero-4k.webp` | 3840×2160 WebP q82 | ≤ 1.2MB（实测约 555KB） | 3806012039/scene.pkg → tex → mip0 PNG |
| `hero-2k.webp` | 1920×1080 WebP q84 | ≤ 400KB | 同上，Lanczos 缩放 |
| `poster.webp` | 1280×720 WebP q82 | ≤ 200KB | 同上 |
| `brand/whale.svg` | 官方 FishLogo path，`currentColor`，viewBox 0 0 50 50 | ≤ 12KB | app.asar favicon.svg |
| `brand/lockup.svg` | 鱼标 + `DEEPSEEK HARNESS` 横排（Montserrat 500 转路径或 text） | ≤ 20KB | 自绘，DSH 官方 logo |
| `brand/whale-silhouette.svg` | 鲸鱼游动姿态剪影（官方鱼标为母本重绘，可变形） | ≤ 20KB | 自绘 |
| `fonts/*` | §2.2 六个字体 | 每个 ≤ 100KB | Material A/B + app.asar |
| `audio/vyron-boot.wav` | 10.4s 44.1k/16bit/stereo（v2.1 实测 1,834,560B，sha256 `d5dd49c2…`） | ≤ 2.0MB | 程序化合成 `_tools/make-audio.py`（v2.1，固定种子逐字节可复现） |
| `audio/handoff.wav` | 1.45s（v2.1 实测 255,824B，sha256 `5c2e4635…`） | ≤ 300KB | 同上 |
| `manifest.json` | 全部资产 size/sha256/尺寸/时长 | — | `_tools/build-manifest.py` 生成 |

素材合规：两份素材为 Wallpaper Engine 第三方素材（Steam 创意工坊），**仅本机自用**，不发布公共 registry、不二次分发；在 `THIRD-PARTY-NOTICES.md` 与 README 顶部写明。DSH 官方鱼标仅用于 DSH 界面装饰。

## 7. 模块契约（preview 启动页）

`preview/index.html` 是自包含启动页（可 `file://` 离线打开，也可被宿主以 iframe 加载 `/dsh-vyron/preview/index.html`）。
全局：`window.__DSH_VYRON__`（由宿主注入的配置）、`window.__VYRON_STAGE__`（编排状态，QA 用）。

query 参数：`embed=1`、`sound=1|0`、`volume=0..100`、`speed=50..150`、`reduced=1`、`allowSkip=0`、`t=<秒>`（定格渲染单帧）、`probe=1`（console 输出 `[vyron-probe] phase <key> @<t>`）、`v=<版本>`。

iframe ↔ 宿主消息：
- `{type:'dsh-startup-vyron:ready'}`
- `{type:'dsh-startup-vyron:progress', t, phase}`
- `{type:'dsh-startup-vyron:done', reason:'natural'|'skip'|'reduced'}`

文件与 owner（写盘范围唯一，不得跨界）：

| 文件 | Owner | 导出接口 |
|---|---|---|
| `preview/js/timeline.js` | Lead | `window.VYRON_TIMELINE = { TOTAL, PHASES, SPEED_MIN, SPEED_MAX, clamp, smooth, lerp, easeInOut, phaseAt(t), progress(t,key), paramsFromLocation() }` |
| `preview/js/main.js` | Lead | 编排：解析参数、主时钟 rAF、驱动 engine/hud/whale/audio、进度上报、跳到 `?t=` 定格、发送 done、跳过键。缺模块时降级不崩 |
| `preview/js/engine.js` | cloud-motion | `window.VYRON_ENGINE = { create({canvas, hiSrc, midSrc, posterSrc, reduced, quality}) -> { ready:Promise, render(t, ctx:{phase,speed,pointer,w,h,reveal}), resize(w,h), dispose(), stats() } }`。负责 4K 底板绘制、镜头推近/视差、星点闪烁、云层漂移（程序化 blob/fog）、平台反射微颤、大气边缘光。图片缺失→程序化渐变兜底 |
| `preview/js/hud.js` | hud-console | `window.VYRON_HUD = { create({root, reduced}) -> { ready:Promise, update(t, ctx:{phase,facts,speed}), resize(w,h), dispose(), setFacts(facts) } }`。P0–P4 的终端 HUD、micrographics、雷达、日轨、月相、ledger、终帧日期/时间排版 |
| `preview/js/whale.js` | whale-art | `window.VYRON_WHALE = { create({root, canvas, reduced}) -> { ready:Promise, update(t, ctx:{phase,w,h,speed,pointer}), dispose(), morphToMark(progress) } }`。鲸鱼路径/摆尾/尾迹/反射/撞镜头→官方鱼标 morph |
| `preview/css/splash.css` | Lead | 舞台、黑场、舷窗 iris、转场、终帧、skip/hint、reduced 分支 |
| `preview/css/engine.css` | cloud-motion | engine 相关覆盖层（可空） |
| `preview/css/hud.css` | hud-console | HUD 全部样式（作用域 `.vy-hud`） |
| `preview/css/whale.css` | whale-art | 鲸鱼/尾迹/morph 样式（作用域 `.vy-whale`） |
| `lib/audio.js` | sound-design | `window.VYRON_AUDIO = { init({src, chimeSrc, enabled, volume, reduced, rate}), start(), sync(t), stop(ms), chime(), state(), __vyronAudio }` |
| `lib/skin.css` | skin-glass | §4 全部皮肤；作用域 `html.dsh-vyron-skin` |
| `lib/index.js` | Lead | 宿主路由 `/dsh-vyron/*`、配置读写 `~/.dsh/dsh-startup-vyron.json`、index.html 首屏注入、facts 采集 |
| `lib/splash.js` | Lead | 宿主启动层 iframe 控制器、ready/progress/done、看门狗、交接转场、`__DSH_VYRON_API__`、QA 参数 |
| `lib/splash.css` | Lead | 宿主启动层与交接样式 |
| `lib/client.js` | Lead | 设置页「VYRON 星海鲸航」+ 皮肤加载 + ambient 注入 + 客户端自举 |
| `package.json`/`cordis.patch.yml`/`locale/*`/`icon.svg` | Lead | bundle 清单与显示元数据 |
| `test/*.mjs` | Lead + verifier | 冒烟断言 |
| `_tools/build-manifest.py` | Lead | 生成 `lib/assets/manifest.json` |
| `_tools/make-audio.py` | sound-design | 合成两条 WAV |

**依赖顺序**：engine/hud/whale 都只依赖 `lib/assets/*` 与 `preview/js/main.js` 的调用契约；互不 import。所有模块必须：
1) 用 `window.VYRON_*` 暴露、不依赖打包器；2) 缺资源/异常时 `console.warn` 并降级，不抛出导致整页崩；3) 用 `requestAnimationFrame` 之外的纯 `update(t)` 驱动（时间由 main 注入）；4) `dispose()` 清理计时器/监听器；5) 首帧渲染前 resolve `ready`。

## 8. 宿主与配置

- 路由：`/dsh-vyron/splash.css`、`/dsh-vyron/splash.js`、`/dsh-vyron/skin.css`、`/dsh-vyron/lib/audio.js`、`/dsh-vyron/preview/*`（prefix）、`/dsh-vyron/lib/assets/*`（prefix，支持 Range）、`/dsh-vyron/config`（GET/POST）。
- 配置：`~/.dsh/dsh-startup-vyron.json`，原子写；缺省自动补默认。
- 默认：`{enabled:true, mode:"session", allowSkip:true, reducedMotion:false, sound:true, volume:65, splashSpeed:85, skin:"glass", skinTheme:"orbit", skinMotion:true, glassTransparency:50}`。
- 同一 profile 只能启用一个启动插件：安装本插件前停用 `dsh-startup-elisa`（保留可回滚）。
- QA 后门（只读 query，不进设置页）：`?vyron_nosplash=1`（跳过启动层）、`?vyron_t=4.2`（iframe 定格秒）、`?vyron_speed=`、`?vyron_skin=off|accent|full|glass`。

### 8.1 页面内全屏预览（v0.2.1）

设置页「页面内全屏预览」按钮 / 任意页面快捷键 **Ctrl+Alt+V** / `window.dispatchEvent(new CustomEvent('dsh-vyron:preview', {detail:{...}}))` → 在**当前页面**挂载真实启动层（与开机同一套 iframe + 交接），播放完交接回本页：

- `window.__DSH_VYRON_API__.preview({ speed?, sound?, volume?, reduced? })` → boolean（启动层播放中返回 false）。
- 实时套用设置页**草稿参数**：速度 50–150、声音开关、音量 0–100、减弱动态；**不写配置文件**、不标记「本次会话已播放」；预览结束自动还原原配置。
- 预览强制 `allowSkip=true`（Esc / 点击 / SKIP 均可退出），避免被困在预览里。
- 页面被 bootstrap 跳过（`vyron_nosplash` / 会话已播 / 插件禁用）时 `splash.js` 仍完整初始化 API（v0.2.1 起不再提前 return），预览可懒加载启动层。
- 启动层正在播放时再次触发返回 false；错误/超时走 40ms 快速释放。


## 9. 验证计划

1. `npm test`：host / splash / client / audio / assets / preview 六套冒烟断言（node vm + mock DOM，无浏览器）。
2. 离线预览：headless Chrome 在 `?t=0.4/1.6/2.9/3.6/4.8/5.9/6.8/7.9/9.2/9.7` 截图（`_shots/`），断言非空白 + 主色统计。
3. 隔离真机：`DSH_HOME=<temp>` + `dsh web` 起临时实例，安装 tgz，headless 打开带 token URL，截图启动动画与皮肤；结束后清理临时目录。
4. 独立 QA（verifier 子代理）：换视角验收——素材是否都用上、DSH 元素是否到位、时间轴与音画同步、皮肤可读性/对比度、降级路径、性能（帧时长 p95）。
5. 交付前：`desktop` profile 安装（先停用 elisa）、`plugin_manager` 结果 `application: applied`、`/dsh-vyron/config` 200、插件清单行与 icon/locale 元数据核对。真实启动观感需重启 DSH 后由用户确认（写进报告"未验证项"）。

## 10. 协作与写盘

- 项目根 `<repo>\`；素材只读源 `<workspace>\3804048141`、`3806012039`。
- 每个文件只有一个 owner（见表）；跨文件改动先找 Lead。队友不得改 `package.json`、`lib/index.js`、`lib/splash.js`、`lib/client.js`、`preview/index.html`、`preview/js/main.js`、`preview/js/timeline.js`、本文件。
- 工具：node `node` 或 `<DSH_INSTALL>\resources\runtime\bin\node`；python `python`（含 numpy/Pillow）；无 ffmpeg 系统 PATH，用 `ffmpeg`。
- 中文写盘 UTF-8；大文件生成用脚本落盘，不在会话里贴大段内容。
