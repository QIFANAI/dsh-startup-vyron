# 素材 A 移植说明 — CMD\LN V1.03 终端 HUD（Material A）

> 本文档是 `dsh-startup-vyron` 启动页 HUD 层（`preview/js/hud.js` + `preview/css/hud.css`）的素材移植记录。
> 唯一设计权威源：`docs/design-spec.md`（§0 素材分配、§2.1 调色板、§2.2 字体、§3 时间轴、§7 模块契约）。
> 素材源目录（只读）：`<workspace>\3804048141\`（Wallpaper Engine 工程，`type: web`，project version 11）。

## 1. 素材结构清点

### 1.1 工程文件

| 文件 / 目录 | 规模 | 内容 |
|---|---|---|
| `index.html` | 421 行 | 舞台 DOM：1600×900 授权排版的控制台 + 内联 SVG 微图形 + 四面板 + 问候时钟 + CRT 层 |
| `css/main.css` | 477 行 | 全部视觉：字体、token、舞台缩放、曲线 HUD、斜切/圆角、微图形、四面板、CRT |
| `js/*.js` | 21 个模块、约 5.5k 行 | 无构建器的原生 ES Module：micrographics / sets / moon / sun / ledger / activity / motion / parallax / presets / media / chat / avatar / greeting / todo / voices / we-bridge / loop / util / main |
| `fonts/` | 6 个 woff2 + OFL 文本 | Oxanium 200、Share Tech Mono 400、JetBrains Mono 400/500、Noto Sans JP 500/900（子集） |
| `assets/presets/` | 14 张 jpg | 5 套预设背景图（Default/Sakura/Olive/Navy/Crimson） |
| `project.json` | 122 个 properties | Wallpaper Engine 属性系统：全部可见性开关、样式下拉、预设色板、文本/坐标/边缘/底边距、CRT/斜切/曲线 HUD 参数 |
| `CREDITS.md` | — | 背景图 Pixabay 授权、字体 OFL、月相数据来源 |

### 1.2 四终端（四窗）

| 窗 | 原面板 | 原内容 |
|---|---|---|
| 01 | `ACTIVITY.LOG` | 活动日志：`时间 / CAT / ACT / OBJ` 四列、最多 18 行、按行渐隐、`cmdln ~ $` 块光标提示、脚注 `TTY0 · 9600 8N1 / UTF-8 · LF / nL` |
| 02 | `NOW.PLAYING` | SMTC 媒体会话：封面（灰度 + 45° 网纹占位）、标题/艺术家/专辑、封面取色、56px 音频柱、进度条与时间 |
| 03 | `TODO.BOARD` | 主任务大数字倒计时 + 任务列表（名称/年龄/逾期），标题栏含 `n OPEN` |
| 04 | `CONSOLE` | 控制台对话流 + 左下 56px 头像窗（点阵球 / 示波器 / 激活图 / 眼睛 / 字符脸 五选一） |
| — | `greeting` | 右上问候语 + 日期 + 会话运行时长（`SESSION HH:MM:SS`），Osxanium 大字逐字打字机 |

面板通用语言：1px 半透明描边、`--panel` 深色底（默认 80% 不透明）、左上/右下 10px 角括号、标题栏（编号 + 名称 + 右侧 LED/窗口按钮）、脚注三门数据；可选「曲线 HUD」（一点透视，左右列向中心转 12°）、「斜切/圆角」二选一、面板透明度/Tab 标题条/窗口按钮/边距均为属性。

### 1.3 HUD 层（四窗之外）

- **角标**：`⌜⌝⌞⌟` 24px 细线，随边距属性移动；坐标读数 `X 0000 · Y 0000 · CMD\LN`。
- **顶图形（两种）**：`FIELD SCAN` 扫描线 / `DAY BAR` 日轨条（24 小时分段、按小时填充、当前时刻游标、`DAY · xx.x%`、`xxH xxM LEFT`、日出/日落刻度与太阳位置）。
- **中央图形（两种）**：`RADAR` 雷达扫描环（150px 半径、角度刻度、扫描扇面、信号弧） / `WIRE GLOBE` 线框地球 + 月球轨道 + 月相盘（`ILLUM / AGE / FULL IN`）。
- **底部中心（六选一）**：五套 micrographics 预设 + `session ledger`（见 1.4）。
- 其他：音频波形（128 bins）、数据总线、hex 字符流（把 "Thank you for using my wallpaper." 转成 `0x` 十六进制滚动）、CRT 扫描线/暗角/跟踪带、屏幕黑场渐入。

### 1.4 micrographics 五套预设（底部中心）

| # | 预设 | 图形语言 |
|---|---|---|
| 01 | **Default**（`micro`） | 连接线 + 事件日志（LINES/LAST/SRC/IDLE）+ 序列号铭牌（`S/N 0x3F-A1`、条码、扫描高光）+ 四路电平表 + 活动图（LOG/MEDIA/TODO/CONSOLE 四节点 + 脉冲）+ 5×4 点阵 + hex 流 |
| 02 | **Minimalistic**（`minimal`） | 精简条码 + 节点图 + 点阵 + hex 流（去密度） |
| 03 | **Dither**（`dither`） | 印刷套准标记 + 10 级网点灰度条 + Bayer 4×4 抖动块 + 摩尔纹双环 + 明暗阶调条 + 等高线地图 |
| 04 | **Schema**（`schema`） | 原理图：数据总线 + 胶囊泳道动画 + 敲版（击穿）文字 + 任务循环箭头 + 年/日进度 + 相位扇 + `UPTIME` |
| 05 | **Kanji**（`kanji`） | 日文 17 字子集：访问日志（ア/ク/セ/ス）、`オンライン`、`月相`（八相标记）、`データ` 数据块 + 十六进制字节、`完了` 朱印（任务清空时盖章） |
| — | **Session ledger** | 7 天 × 24 小时格，记录本次壁纸运行过的小时；脚注 `SESSION · 7 DAYS · n H` |

（`project.json` 的 `mg_lower_style` 下拉即这 6 个选项；中心/顶部图形各有一套次级样式，共 `radar/globe` 与 `scan/daybar` 两组。）

### 1.5 色板与灰阶

| 类别 | 原值 / 选项 | 在启动页的用途 |
|---|---|---|
| 主文字 `--white` | `#E8E9EA` | HUD 一级文字（design-spec §2.1 `--v-ink-1`，原值保留） |
| 次级 `--dim` | `#A3A6AA`（同色相 70.5%） | 标签/次级（`--v-ink-2`） |
| 弱 `--faint` | `#85888C`（同色相 58%） | 脚注/辅助（`--v-ink-3`） |
| 地面 `--ground` | `#0A0B0C`（预设可染） | 面板半透明底；启动页 HUD 用 `rgba(5,10,22,…)` 以贴合星海底色 |
| 预设色板 | Default（灰）/ Sakura（樱）/ Olive（橄榄）/ Navy（海蓝）/ Crimson（绯红），各带 2–3 张背景图与调色 | 只取「灰阶终端」这一档；花/暖/冷/红四档不移植（与本插件星海主题冲突） |
| 方案色 | `schemecolor`（WE 传 r g b 0–1）→ 三阶亮度 | 不移植（启动页不开放换色） |

### 1.6 字体与许可

| 字体 | 文件（素材 A 原包） | 许可 | 在启动页的用途 |
|---|---|---|---|
| Oxanium 200 | `oxanium-200.woff2` | SIL OFL 1.1 | HUD 大数字（时间、百分比、编号） |
| Share Tech Mono 400 | `share-tech-mono-400.woff2` | SIL OFL 1.1 | HUD 标签、标题、脚注 |
| JetBrains Mono 400/500 | `jetbrains-mono-400/500.woff2` | SIL OFL 1.1 | 开机日志、正文 |
| Noto Sans JP 500/900 | `noto-sans-jp-500/900.woff2` | SIL OFL 1.1 | Kanji 微图形（17 字子集）；启动页仅用于 `デ` 等字符 |
| Anurati / Quicksand-Bold | 素材 B 随附（见 design-spec §2.2） | SIL OFL 1.1 | 终帧日期/时间（Quicksand-Bold，Anurati 风格宽字距） |

字体文件随包落在 `lib/assets/fonts/`；`preview/css/hud.css` 用 `../../lib/assets/fonts/*` 引用（CSS 位于 `preview/css/`，两级相对路径同时适配 `file://` 与宿主 `/dsh-vyron/preview/*` 路由）。

### 1.7 属性系统（不移植的部分）

`project.json` 有 122 个 Wallpaper Engine properties：可见性开关（面板/mg 各件/CRT/曲线 HUD）、样式下拉（`mg_lower_style` 六选一、`mg_radar_style`、`mg_ruler_style`、`avatar`、`preset`）、预设覆盖（`presettweaks`）、边距/底边距、`schemecolor`、`textbrightness`、坐标/月相输入、`motion`/`textmotion` 速率等。这些由 `we-bridge.js` + `main.js` 在壁纸运行时消费——启动页没有也不该有属性面板，整层不移植。

## 2. 移植取舍表

### 2.1 保留（视觉语言与信息结构）

| 项 | 保留下来的部分 | 落在哪 |
|---|---|---|
| 终端灰阶 | `#E8E9EA / #A3A6AA / #85888C` 原值三级 | `hud.css` `--vyh-ink-1/2/3` |
| 四窗语言 | 编号 + 标题（`01 ACTIVITY.LOG`…）、角括号、半透明底、标题栏 LED、脚注三门数据 | `.vy-hud-win*` |
| 活动日志 | 行号 + `HH:MM:SS` + 3 字母 CAT + 对象文本四列；打字机 + 块光标 + 行数计数 | 01 窗，内容替换为 DSH facts |
| 日轨条 | 24 小时分段刻度、按当前时刻填充、游标、`DAY · xx.x%` 与本地时间 | 顶部中央（P1） |
| 雷达扫描环 | 三层同心环 + 60 格角度刻度 + 十字线 + 旋转扇面 + 回波点 | 02 窗（P1） |
| 月相 | 亮面月盘路径（waxing/waning、gibbous/crescent 几何一致）+ 轨道 + 相位名/光照率/月龄/满月倒数 | 02 窗 + 终帧 |
| Session ledger | 7 行 × 24 小时格，今日行按已过小时点亮、当前小时高亮 | 04 窗 |
| micrographics | 三套图形语言：Schema（环/节点/尺寸线/扫描线）、Dither（Bayer 4×4 网点矩阵 + 权重阶梯）、Kanji（`デ ー タ ル` 竖排 + `データ` + `完了` 印） | 03 窗（canvas + DOM 混排） |
| 标题栏/脚注 | `Share Tech Mono` 字距、右上双横窗钮、LED 方块 | 通用 |
| CRT 质感 | 扫描线交给舞台层（`splash.css` 的 `.vy-scanlines`）；HUD 只保留 40px 网格与细边框 | 避免与舞台层重复 |
| 打字机/光标 | 逐字符展开 + `Math.floor(t*2.4)%2` 闪烁块光标（终局光标停在最后一行末尾） | 01 窗 |

### 2.2 简化 / 重写

| 项 | 原实现 | 启动页做法 | 理由 |
|---|---|---|---|
| 主时钟 | Wallpaper Engine 帧回调 + `loop.js` 调度 | main 注入的动画秒 `update(t)` 纯函数 | `?t=` 定格与实时播放必须是同一帧；无计时器/随机种子 |
| 月相 | USNO 联网 + 本地 Meeus + 手输三相 | 只保留 Meeus 第 49 章本地计算（相位事件 → 插值 → 光照率/月龄/满月） | 启动页不能联网、无人手输；`?t=` 需可复现 |
| Session ledger | `localStorage` 记 7 天 24 小时 | 本次会话运行时长 `T+HH:MM:SS` + 启动时刻 + 实时 7 日格（今天已过小时） | 启动页生命周期只有 ~10s，不需要持久化 |
| 日轨条 | 24 段 + 日出/日落刻度（需经纬度 `sun.js`） | 24 段 + 当前时刻刻度 + `DAY xx.x%` + 本地时间 | 启动页无地理位置；去掉 sun.js |
| 布局 | 1600×900 固定舞台 + `--s` 缩放 + `--edge/--bottom` 边距 | 视口自适应（`clamp()/vw/vh`），四角定位 | 启动页全屏 iframe，16:9/竖屏/超宽都要成立 |
| 中央 60% | 中央微图形场（radar/wave/bus/hex） | **Round2 起：P1 中央 = ORBIT CORE（素材 A 的 `mg_radar`/`mg__globe` 版式搬回画面正中）；P2 舷窗打开后让位给 4K 底板与大白鱼**（见 §7） | 用户反馈「中间位置太空，素材里中间本来有东西」 |
| 动画 | `motion.js` 按步进 JS 动画（10/30/60fps） | 全部由 `t` 推导（扫描角 = `t*66°`、网点相位 = `t` 的三角函数、打字机 = `t` 与固定 CPS） | 定格可复现、无 CSS 循环动画 |
| 字体加载 | `document.fonts.ready` 后 remeasure 标签位置 | 字体固定排版，不需要测量；`@font-face` + 系统回退 | 结构更简单 |

### 2.3 去除（不进入启动页）

- Wallpaper Engine 属性系统与 `we-bridge.js`（含 dev 面板）、预设调色 `presets.js`、`parallax.js`、`sun.js`、`todo.js`、`media.js`、`chat.js`、`avatar.js`、`voices.js`、`greeting.js`、`activity.js`（日志内容改由 DSH facts 注入）、`ledger.js`（localStorage 版）。
- 曲线 HUD 一点透视、斜切/圆角面板、背景图、CRT 跟踪带/暗角、光标倾斜/视差、自定义光标与块光标样式（仅保留打字机块光标）、USNO 网络请求。
- 四窗的媒体/TODO/控制台业务内容（启动页没有宿主 UI 数据）。

### 2.4 新增（为启动叙事服务）

| 新增 | 说明 |
|---|---|
| 相位化 HUD | P0 静默 → P1 四窗依次推入 + 逐步点亮 → P2 四窗向外滑出、四角展开成整屏边缘框 → P3 边缘扫描条掠过 → P4 终帧两行 meta |
| 四窗外滑成边缘框 | P2 内四窗按各自方向 translate 出屏（`outFade` 同步淡出）；同一时段 4 条 edge rail 由四角 `scaleX/scaleY` 展开，形成整屏 1px 细框 |
| SYNC 00→100 | P1 底部读数与进度条，`easeInOutCubic` 1.0→2.95s 到 100%，P2 收起 |
| 终帧两行 meta | 填进 `#vyLockupMeta`（splash 定位于字标下方）：① 月相 + `WEEKDAY / DD MON YYYY / -HH:MM-` ② `PROFILE/MODEL/WORKSPACE/SANDBOX/SESSIONS + SYNC 100%`；字号/行高/省略号按验收口径收敛，总高 ≤ 2 行 |
| 边缘扫描条 | P3 沿顶部边缘按 `vw` 推进的 1px 亮条（`sin` 包络淡入淡出） |
| reduced 静态降级 | 不播动画：直接静态终帧（月相/日期/时间/facts + 边缘框），无打字机/雷达/网点动画 |
| 挂载契约 | 只写 `#vyHudRoot`（自己的 root）与 `#vyLockupMeta`（填终帧排版）；全部节点 `.vy-hud` 前缀、`pointer-events:none`、不改 stage 布局 |
| **P1 中央 ORBIT CORE**（Round2） | 素材 A 的中央大雷达/轨道图搬到画面正中 + DSH 鱼标核心 + 底部 AUDIO 控制带 + 两侧竖向遥测流（详见 §7） |
| **P4 环回归**（Round2） | core 的环在终帧字标后方以 7.5% 透明度回归一次，8.6s 后淡出（详见 §7） |

## 3. 与启动时间轴的对应（design-spec §3，TOTAL = 9.8 动画秒）

| 相位 | 区间（s） | HUD 行为（`update(t)` 里的主要表达式） |
|---|---|---|
| **P0 `signal`** | 0.00–0.65 | 全静默：所有 HUD 元素 `opacity = 0`（不占 P0 的元素由 splash.css 负责）。**Round2**：P0 中央鱼标/字标由 main + splash.css 提供（0.66–0.94 淡出），HUD 的 ORBIT CORE 在 0.95 后从同一圆心长出来。 |
| **P1 `console`** | 0.65–3.10 | 0.62–1.02 网格淡入（`opacity = smooth(progress(t,0.62,1.02))`，P2 再退）；四窗依次推入 `smooth(progress(t, inAt, inAt+0.42))`，`inAt` = 0.78 / 1.02 / 1.28 / 1.52（左上/右上/左下/右下）+ 34/18px 位移；日志打字机 0.88 起、每行错 0.112s、460 字符/秒；雷达扫描角 `(t*66)°`、回波点按扫描角邻近度点亮度；日轨条 1.22–1.84 淡入；SYNC 1.00→2.95 到 100%；月相/P2 图形随窗点亮。**Round2**：0.95–1.45 中央 ORBIT CORE 环系淡入、1.08–1.68 鱼标/字标点亮、扫掠 `t/8*360°`、控制带随 SYNC 0.96–1.42 亮起。 |
| **P2 `breach`** | 3.10–5.10 | 3.10–4.34 四窗按方向滑出屏（`pOut = smooth(progress(t,3.10,4.34))`，左窗 `x = -pOut*(w+60)` 等）；3.34–4.16 内容淡出；同一时段四角 edge rail `scaleX/scaleY = smooth(progress(t,3.42,4.46))` 展开成整屏 1px 边缘框；网格 3.10–3.72 退；日轨条 3.02–3.52 收；SYNC 3.02–3.56 收。**Round2**：3.05–3.60 ORBIT CORE 充能（扫掠/虚线环加速、鱼标增亮、SIG 1.00），3.10–4.20 整体放大到 1.35×、3.26–4.16 淡出（外环视觉上并入同圆心 iris 圆）；2.92–3.28 起给核心加一层极淡淡色镜片，保住地球亮部上的字标可读性。 |
| **P3 `whale`** | 5.10–7.60 | 仅保留边缘框 + 顶部扫描条（5.20–7.55 两次掠过，`pass = (p*2.35)%1`，`x = -26 + pass*156 vw`）；中央完全让给鲸鱼与星海（ORBIT CORE 已退场）。 |
| **P4 `lockup`** | 7.60–9.00 | 终帧两行 meta 由 splash.css 的 `.vy-lockup.is-on`（t≥7.30）接管显隐；HUD 在 `ctx.lockupMeta` 里实时写：真实本地日期/时间（`TUESDAY / 03 NOV 2026 / -12:04-`）、月相名/光照率、宿主 facts、`SYNC 100%`。**Round2**：7.28–7.98 环以 7.5% 透明度在字标后方回归、8.58–8.95 淡出。 |
| **P5 `bloom`** | 9.00–9.80 | HUD 不再变化（终帧保持），交棒给 main/宿主；`ended` 后 HUD 不写 DOM。 |

时间轴常量单源：`preview/js/timeline.js`（`TOTAL/PHASES/CUES/clamp/smooth/progress/phaseAt`）。HUD 内部只用 `progress/smooth` 的相对区间，不复制相位起点。

## 4. 交付内容与契约

| 文件 | 内容 |
|---|---|
| `preview/js/hud.js`（~1.65k 行） | `window.VYRON_HUD.create({root, reduced}) -> {ready, update(t, ctx), resize(w,h), dispose(), setFacts(facts)}`。内部：Meeus 月相、facts 归一化（profile/model/workspace/sandbox/sessions/bundles/version，缺省兜底 `DESKTOP / deepseek-flash / dsh-workspace / workspace-write / — / 0.1.0`）、DOM 构建、打字机、雷达/日轨/月相/ledger 更新、双套 canvas 微图形、P2 四窗外滑与边缘框展开、终帧 meta 写入；**Round2 新增 P1 中央 ORBIT CORE（`buildCore`/`updateOrbit` + 内联官方鱼标 path `WHALE_D`）、底部控制带（`updateSpectrum`）、两侧遥测流（`buildSideRail`）、P4 环回归（echo）** |
| `preview/css/hud.css`（~1.2k 行） | @font-face（9 个 face，`../../lib/assets/fonts/*`）、`.vy-hud` token、40px 网格、边缘框/扫描条、日轨条、四窗通用与四窗内容、微图形、ledger、SYNC、终帧两行 meta、reduced/窄屏降级；**Round2 新增 §10 ORBIT CORE / §11 底部控制带 / §12 两侧遥测流 / §13 P4 echo 样式与对应窄屏降级** |
| `docs/material-a.md` | 本文件 |

`update(t, ctx)` 的 ctx 由 main 提供：`{t, phase, phaseProgress, speed, reduced, w, h, pointer, facts, reveal, bloom, lockup, markRect, lockupMeta, ended}`。HUD 只消费 `phase/facts/lockupMeta/w/h`，其余忽略。

## 5. 合规声明

1. **素材来源与分发**：Material A（`3804048141` CMD\LN V1.03）与 Material B（`3806012039` 威龙 VYRON 4K）均为 **Wallpaper Engine 第三方素材（Steam 创意工坊）**，按 design-spec §6 约定：**仅本机自用，不发布公共 registry、不二次分发**；`THIRD-PARTY-NOTICES.md` 与 README 顶部须写明。
2. **背景图**：素材 A 的 `assets/presets/*.jpg` 来自 Pixabay（Pixabay Content License，免归属），启动页**不打包、不使用**这 14 张图（HUD 是透明覆盖层，底板来自 Material B 的 4K 无字版）。
3. **字体**：Oxanium / Share Tech Mono / JetBrains Mono / Noto Sans JP 均为 SIL OFL 1.1（OFL 文本随素材 A 的 `fonts/OFL-*.txt`）；Anurati / Quicksand-Bold 为 SIL OFL 1.1（随 Material B）。随包 `lib/assets/fonts/` 内分发，未修改字形。
4. **月相数据**：算法移植自 Jean Meeus《Astronomical Algorithms》第 49 章（本地计算，不联网）；素材 A 的 USNO 在线数据源在启动页**未启用**。实现为独立重写，未复制原文件。
5. **DSH 官方元素**：大白鱼鱼标、`DEEPSEEK HARNESS` 字标、DSH 蓝属 DSH 官方，仅用于 DSH 界面装饰（design-spec §0）；HUD 层不引用、不改宿主正文字体栈，字体只在 `.vy-hud*` 作用域生效。
6. **代码来源**：`hud.js` / `hud.css` 为按视觉语言**重写**的启动页专用实现（不是壁纸工程的整包搬运）；引用了素材 A 的算法与图形语言（Meeus 月相、日轨/雷达/ledger/微图形构成），未引入 Wallpaper Engine 运行时依赖。

## 6. 已知限制 / 未验证项

- **真机 iframe 路由**：`../../lib/assets/fonts/*` 已在 `file://` 下实测加载；宿主 `/dsh-vyron/preview/*` 路由下由 `lib/index.js` 的前缀路由映射，尚待真机（隔离实例）截图确认。
- **reduced 与 lockup 的联动**：`main.js` 的 reduced 分支 `draw(0.35)` 不点亮 `#vyLockup`（`updateStage` 的 `lockVisible = t >= 7.30`），因此 reduced 下若 splash.css 不额外兜底，终帧 meta 会随父层不可见。HUD 侧已按静帧渲染好内容（`data-reduced=1`），是否需要 main/splash 补 `is-on` 由 Lead 决定。
- **P3 扫描条亮度**：在 4K 明亮云层上以 0.85 峰值透明度掠过，实测可辨；真机观感待确认。
- **终帧日期/时间字号**：为满足「无重叠、总高 ≤ 2 行」的验收口径，日期行用 `clamp(11px,1.55vmin,17px)`（约 14px @1600×900），facts 行 ≤ `clamp(8px,1.15vmin,12px)`；若产品侧要求更大的 Anurati 风格日期，上调 `--vyh-*` 或该行 `font-size` 即可，但需重新验重叠。
- **字体回退**：字体缺失时回退 Consolas/系统字体，字形与字距会变（本次已在字体就绪后出图确认）。
- 本文档只记录 HUD 层；4K 底板/鲸鱼/音轨/皮肤见 `docs/material-b.md`、`docs/motion-spec.md`、`docs/audio-spec.md`、`docs/skin-spec.md`（各自 owner）。

## 7. Round2：P1 中央 ORBIT CORE（v0.2.0，2026-11-03）

> 背景：用户对 v0.1.0 的反馈「P1 CONSOLE 中间位置太空，素材里中间本来有东西，应该在开幕就有 DSH 元素在」。
> 根因：v0.1.0 只复刻了素材 A 的四角窗，把素材 A 真正的中央大雷达/轨道图（`3804048141/index.html` 的 `data-mg="radar"` 组：`mg_radar` 圆弧 132px + `IN·EVENTS`/`LUNA·ORBIT`/`SOL` 标注 + `AUDIO · L/R · 128 BINS` 频谱 + `mgCoords` 坐标 + `bus` 竖向刻度轨）漏掉了。
> 裁决口径：`_handoff/ROUND2-PLAN.md` §4.2（Lead）。

### 7.1 版式与元素（照素材 A 的 `mg_radar` / `mg_globe` 语言）

| 元素 | 实现 | 来源/备注 |
|---|---|---|
| 环心 / 外径 | 环心 `(50%, 47%)`（与舷窗 iris 同心）；外环直径 `clamp(360px, 44vmin, 520px)`；SVG 容器 `clamp(720px, 88vmin, 1040px)`，viewBox 800×800 | P2 放大时外环可"变成 iris 圆"；鱼标核心在环心上方约 3%（≈50%/44%），与 Lead 的 P0 信号层鱼标位置衔接 |
| 同心环 | 三层实线 r 200 / 152 / 116 + 细点环 r 176 + 虚线环 r 134；**外圈虚线环 r 222** 慢转（`t*7°/s`）、内虚线 r 74 反向慢转 | 照 `mg_radar` 的三层环 + `dash-a/dash-b` 虚线环 |
| 罗盘刻度 | 144 格（每 2.5°，每 15° 长格），r 202–214 | 照 `mg_radar` 的 60 格刻度加密 |
| 十字准线 | 四臂（中心让位给鱼标/字标）：`M80 400 H276 / M524 400 H720 / M400 80 V276 / M400 524 V720`，臂上带距离刻度（±3px 短线） | 延伸至 1.6R（320/800）；中心留空避免切字 |
| 方位标注 | `000/090/180/270` 四正位 + 8 个 30° 斜位小标（030/060/120/150/210/240/300/330）+ `IN · EVENTS` / `LUNA · ORBIT` / `SOL` / `SRC · LOCAL` / `SWEEP 8S` / `CONTACTS 3` / `SIG` + 数值，全部带引线/节点方块 | 文案与相对位置照 `mg_radar`/`mg_globe`；`SIG` 数值随 SYNC 0→1.00 |
| 扫掠 | `conic` 扇面 8s/圈（45° 主扇 + 45° 拖尾），径向渐变填充（中心 0.34 → 边缘 0.03）；扫掠前缘 2.6px 亮弧；P2 充能额外 +900°（约 0.55s 内多转 2.5 圈） | `SWEEP 8S` 文案对应 8s/圈 |
| 回波点 | 3 个方块（5×5）按 34°/227°/113° 布点，闪烁 `0.5+0.5*sin(t*2.2)`，扫掠经过时额外增亮 | 照 `mg_radar` 的 3 个 pulse rect |
| LUNA 轨道 | `rotate(-16°)` 椭圆 `rx 310 / ry 150` 虚线轨 + 月相标记（按真实月相位角沿椭圆运动，`renderMoonLabels` 每分钟更新） | 照 `mg_globe` 的月球轨道组；椭圆放大到 ≥150 半径，避免穿过中央字标 |
| 中央微图形 | 20px 细网（径向淡出成圆形准星区，`opacity 0.075`）+ 24 条细辐条 + 离距刻度 | 把中央"填空"成仪表盘；素材 A 的微图形密度语言 |
| 外环辉光 | 环外侧磷光环带（r 200–232 径向渐变，峰值 0.21） | 黑底上的雷达玻壳辉光；素材 A 因底图明亮不需要 |
| 四角括号 | 虚线圈外 4 个 L 形取景角标（±236） | 照素材 A 的 `mg corners`/`frame` 取景角标 |

### 7.2 核心（DSH 元素）

- **官方鱼标**：`lib/assets/brand/whale.svg` 的 `<path>` **内联复制**（`WHALE_D` 常量，file:// 下不依赖异步 fetch），白色 `#f5f8fb`，宽 `clamp(72px, 9.8vmin, 104px)`（1600×900 ≈ 88px）；滤镜 = `brightness(1 + charge*0.85)` + 双层 drop-shadow（青 `#7ef0d4` + DSH 蓝 `rgba(87,168,255)`），呼吸光 `0.30–0.58`（`sin(t*1.85)`），P2 充能再增亮。
- **conic 进度环**：鱼标外圈 138% 的环形 conic-gradient（`from -90deg`），进度 `calc(var(--vy-sync) * 1turn)`；`--vy-sync = clamp01((t-1.0)/1.95)`（与现有 SYNC 读数同源，P2 前已到 100%）；mask 抠出 2px 环带 + 青蓝 drop-shadow。
- **字标**：`DEEPSEEK HARNESS`，`Share Tech Mono`，`clamp(11px, 2.0vmin, 20px)`，字距 0.28em，白色 + 蓝辉光；下方 `BOOT CORE · CMD\LN` 小字（`clamp(7px, 1.02vmin, 10px)`，0.26em）。
- 核心整体在环心上方（`top: 46.2%`），使鱼标中心落在约 50%/44%，与 P0 信号层同一枚官标、同一竖轴。
- P2 舷窗打开后地球亮部会顶到核心后面：`.vy-hud-core-center::before` 加一层极淡暗色"仪表镜片"（`--vy-veil`，2.92–3.28 起淡入，随 core 一起淡出），只保字标/鱼标可读，不挡 iris。

### 7.3 底部控制带（AUDIO + 坐标 + SYNC 合并）

- 位置：`bottom: calc(var(--vyh-gy-bot) + 2px)`，宽度 `min(46vw, 820px)`（窄屏 38vw、竖屏 35vw / 手机竖屏只留 SYNC），居中于两块下窗之间；显隐与 P1 SYNC 同口径（0.96–1.42 淡入、3.02–3.56 淡出）。
- 第一行：`AUDIO · L/R · 128 BINS` + `PEAK 0.00`。
- 频谱：L/R 两行 × 32 根柱（还原自 `mgWave` 的 128 bins 概念），逐帧由确定性函数 `spectrumAt(i,t,ch)` 驱动（`scaleY`，低频高/高频低 + 移动峰 + 拍频），24fps 更新、`?t=` 定格可复现。
- 第二行：`X 0000 · Y 0000 · CMD\LN`（素材 A `mgCoords`，X/Y 按 t 慢速漂移，8fps 更新）+ `SYNC 000%` 读数与进度条（沿用 v0.1.0 的 1.00→2.95s 到 100%，现并入控制带）。

### 7.4 两侧竖向遥测流

- 位置：`50% ± clamp(300px, 34vmin, 400px)`，高 56%，低对比（`rgba(163,166,170,.55)`）。
- 组成：1px 竖线 + 22 格刻度（每 5 格长格）+ 2 个向上移动的数据包 + 竖排文本流（`writing-mode: vertical-rl`，内容为素材 A 文案：`TTY0 · 9600 8N1 · UTF-8 · LF · 13L · CMD\LN · UPLINK LOCAL ONLY · SRC LOCAL CALC`），52s 一轮缓慢上移。
- 唤回素材 A `bus` 组的两条竖向刻度轨（原 x=532/1068，比例 33.25%/66.75%）。

### 7.5 相位时间线（纯 `t` 函数，无 CSS 循环动画）

| t | 行为 |
|---|---|
| 0.95–1.45 | 环系 `opacity = smooth(progress(t,0.95,1.45))`（P0 信号层 0.66–0.94 退场之后） |
| 1.08–1.68 | 鱼标/字标 `opacity = smooth(progress(t,1.08,1.68))`（避免与 P0 双鱼标重影） |
| 3.05–3.60 | 充能：扫掠/虚线环加速、鱼标 `brightness` 最高 1.85、SIG→1.00、进度环 100% |
| 3.10–4.20 | 整体 `scale = 1 + 0.35*easeInOutCubic(...)`（放大 1.35×） |
| 3.26–4.16 | 整体淡出（与四窗外滑 3.10–4.34 / 3.34–4.16 同步） |
| 7.28–7.98 / 8.58–8.95 | P4 环回归淡入 / 淡出（容器 opacity 0.075；暗描 3.4px + 亮线 1.1px 双色雕刻线，保证亮地球与暗太空上都可读） |

reduced 分支：`renderReduced` 中 core / 控制带 / 侧栏 / echo 全部 `opacity=0`，CSS `[data-reduced="1"]` 再 `display:none`，不影响静帧终帧。

### 7.6 验收数据（1600×900，`?t=2.6`，证据 `_shots/round2-hud/`）

| 项 | 改前（v0.1.0 交付帧 `_shots/cdp-base-t26.png`） | 改后 | 门槛 |
|---|---|---|---|
| 中央区 x30–70% / y25–65% 非背景内容占比（lum>22） | **0.05%** | **25.32%** | ≥12% PASS |
| 同上（lum>30 / >35） | 0% / 0% | 17.11% / 13.87% | — |
| console error / exception | 0 / 0 | 0 / 0（22 关键帧 + reduced） | 0 |
| 定格可复现（同 t 两次） | — | 中央区逐像素一致（全屏仅实时时钟文本 0.05% 差异） | — |
| P4 终帧文本矩形重叠 | 0 | 0（#vyLockup 内 39 个文本叶子两两相交 0） | 0 |
| `node test/smoke-preview.mjs` | 122/122 | 122/122 PASS | 全绿 |
| HUD `update()` 单帧耗时 | — | 0.566 ms/次（headless 软件光栅，240 次） | 不明显劣化 |
| 页面帧时（headless，非真实 GPU） | v0.1.0 avg 19–31ms（旧报告） | 1600×900 avg 35.0ms / max 205.4ms；1440p avg 66.0ms（engine 软件光栅瓶颈） | 不明显劣化（见 §7.7） |

证据文件：`_shots/round2-hud/contact-sheet.png`（六相位总览）、`final-t{0.5…9.6}.png`、`before-t26-v010.png` vs `final-t2.6.png`、`size2-*.png`（1280×720 / 900×1400 / 700×1000 / 2560×1080）、`cropped-*.png`、`METRICS.md`。

### 7.7 已知限制 / 未验证项（Round2 追加）

- **严格阈值下的占比**：阈值 lum>40（约 16% 亮度）时中央占比 10.9%（改前 0%）；这是"把网格/辉光都算背景"的极严口径，若验收采用该阈值需再加密亮部内容。
- **外环辉光是新增艺术处理**：素材 A 的雷达在明亮底图上不需要辉光；本插件在 P1 黑场上加了外环磷光环带以填中央密度。若产品侧觉得过亮，调 `#vyCoreHalo` 的 stop 即可（一处 SVG 渐变）。
- **P0→P1 鱼标尺寸**：P0 信号层官标约 64px（`9.6vmin*74%`），P1 core 鱼标约 88px（`9.8vmin`），交棒 0.95–1.45s 是一次缓慢放大；同轴同位置，无双影，但"放大量"是否合观感待真机确认。
- **P2 core 与 iris 的重合窗口很短**：core 外环半径 198→267px（3.10–4.20），iris 洞半径 3.4s 左右 ≈205px 后迅速超出；"外环变成 iris 圆"只在 ~3.35–3.45s 视觉成立，之后 core 以淡出收场。
- **真机 iframe 性能/观感未测**：headless 为 SwiftShader 软件光栅，1440p 帧时不代表真机 GPU；外层辉光/大面积 SVG 在低端 GPU 上的光栅成本未验证。
- **本模块只改 `preview/js/hud.js` / `preview/css/hud.css` / 本文件**；`test/*.mjs`、`docs/design-spec.md`、`preview/index.html`、`preview/js/main.js`、`preview/js/timeline.js` 与其他模块文件未改动。
