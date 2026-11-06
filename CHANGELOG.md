# 变更记录

## 0.2.1-public — 2026-11-06（公开源码仓库）

**把 0.2.1 完整版无损开源**：代码 / 文档 / 配置 / 预览页 / 四档皮肤 / 程序化音轨与完整版逐字节一致；
只剔除 4 个无授权第三方文件（3 张 Wallpaper Engine 壁纸派生底图 + Anurati 字体，个人使用授权，非 OFL），
其余文件全量入库。插件缺这 4 个文件时按既有降级链运行（程序化深空渐变 / 字体栈回退）。

- 新增：`ASSETS.md`（资产边界与本地恢复说明）、`docs/PUBLIC-RELEASE.md`（逐文件对照与验证证据）、
  `licenses/`（8 款 OFL 字体的许可全文 + 版权汇总）。
- 新增：`scripts/check-public.mjs`（公开仓库门禁：无第三方素材 / 无本机绝对路径 / 无密钥 / manifest 一致）、
  `scripts/prepare-local-media.ps1`（合法持有原素材的用户在本地恢复原画，SHA256 校验，仅限本机自用）、
  `.github/workflows/test.yml`（Node 20/22 矩阵）与 Issue / PR 模板、CONTRIBUTING / SECURITY / 行为准则。
- 调整：`test/smoke-assets.mjs`、`test/smoke-host.mjs` 对缺失的 4 个本地素材按 `skip` 处理；
  `lib/assets/manifest.json` 重建为 15 个公开资产；`scripts/build-manifest.py` 支持 `--local`；
  `package.json` 脚本路径改为 `scripts/`；README / INSTALL / LICENSE / THIRD-PARTY-NOTICES 改写为公开版口径。
- 验证：`npm test` 全绿（干净仓库，无第三方素材）；`npm run check:public` 全绿；逐文件 SHA256 对照见
  `docs/PUBLIC-RELEASE.md`。

## 0.2.1 — 2026-11-03

**页面内全屏预览（用户反馈：想在这个操作页面预览，不想只在内嵌小窗里看）**。

### 新增

- 设置页「预览」组新增 **页面内全屏预览**（主按钮「全屏预览」）：在**当前页面**挂载真实启动层，完整播放一次与开机相同的动画 + 交接（高闪收束成光缝 → 黑幕展开 → UI 分区显影 → 回本页），实时套用上方**草稿参数**（速度 / 声音 / 音量 / 减弱动态），不写配置、不标记「本次会话已播放」，结束自动还原配置。
- 任意页面快捷键 **Ctrl+Alt+V** 直接触发页面内预览（无需进设置页）；宿主 API `window.__DSH_VYRON_API__.preview({speed,sound,volume,reduced})` 与自定义事件 `dsh-vyron:preview`（detail 同参数）同时可用。
- 预览强制 `allowSkip=true`（Esc / 点击 / SKIP 可退出）；预览进行中重复触发返回 false；错误/超时 40ms 快速释放。
- 修复：页面被 bootstrap 跳过（`vyron_nosplash` / 本会话已播 / 插件禁用）时，`lib/splash.js` 现在仍完整初始化 API 并支持懒加载预览（此前会提前 return 导致 API 缺失）。
- 内嵌预览保留为次要按钮「内嵌预览（小窗）」；文案区分两种预览的用途。

### 测试

- `test/smoke-splash.mjs` 新增 [14] 页面内预览断言 13 条（草稿参数透传、不写配置/结束还原、强制 allowSkip、reduced、自定义事件、Ctrl+Alt+V、跳过态懒加载），splash 套件 121→**134**；`npm test` 合计 **587/587 PASS**。
- 版本 0.2.1（`package.json` / `client.js` FALLBACK / `splash.js` 兜底同步）。

## 0.2.0 — 2026-11-03

**细节精修（Round2）**：用户验收 v0.1.0 后提出的动效 / 音效 / 逻辑三块问题，启动动画与 UI 皮肤同时优化。目标从"毛坯房"到"精装"，**接口、TOTAL=9.8、速度模型、reduced 语义、模块契约不变**。

### 启动动画（动效 / 逻辑）

- **开幕即有 DSH（图一）**：P0 中央新增官方鱼标（72–88px，环+光晕）+ `DEEPSEEK HARNESS` 字标 + 1px 光缝，第一帧就是 DSH 形状；0.66–0.94s 交棒给 HUD 中央 core（无重影）。
- **P1 中央 ORBIT CORE（图一"中间太空"）**：把素材 A 的中央大雷达/轨道图搬回画面正中——三层同心环 + 外圈虚线 + 十字准线 + 罗盘标签（IN·EVENTS / LUNA·ORBIT / SOL / SRC·LOCAL / SWEEP 8S / CONTACTS 3）+ conic 扫掠 + 回波点；核心=官方鱼标 + `--vy-sync` 进度环 + `DEEPSEEK HARNESS` + `BOOT CORE · CMD\LN`；底部 `AUDIO · L/R · 128 BINS` 频谱 + 坐标带；两侧竖向遥测流；P2 充能放大成 iris 圆；P4 以 7.5% 在字标后回归一次。**中央区非背景内容占比 0.05% → 25.32%**。
- **大白鱼重做（图二）**：轨迹改单条连续 Catmull-Rom（左下跃出 → 右上弧 → 一次连续侧倾大弧折返到 `#vyMarkSlot`，末速归零、末位误差 2.5px、0 次 >120°/0.1s 翻转，告别"乱窜"）；鲸体改 canvas 逐帧渲染（12 段体表渐变 / 背脊高光 / 腹部暖白 / 动态焦散 / 镜面扫光 / 三色边缘光 / 半透明鳍 / 虹膜高光 / 软投影 / squash）；尾迹改 4 层 tapered ribbon + ≤120 粒子；morph 粒子向 mark 汇聚 + 鱼标点亮。whale.update p95 2.8→2.0ms。
- **地球动起来（图二）**：新增云层/地表相对视差（地表 +0.85px/s、云层反向 9.3–11.0px/s，1 张合成层，构建期 4bit 云遮罩）、大气 limb 8.4s 呼吸 + 色温偏移、星点相机视差、两段斜向大气光扫、平台反光 ×1.22；修复 v0.1.0 "太阳闪光分支漏复位 globalAlpha"导致大气边缘被压到 3% 的遗留 bug。t=4.4 vs 6.4 地球区 **>8 灰阶像素占比 80%**（v0.1.0 判据 <2%）。
- **P5 收束成线 + 新宿主交接（图二"进入生硬"）**：P5 高闪后终帧向 y=50% 收束成一条光缝（9.02–9.62），宿主交接从 950ms→**1200ms**：光缝 → 上下黑幕从中央缝向上下滑开（露出宿主 UI = "从一条线展开操作页面"）→ 分区通电显影 → 声呐环从中央飞入 `[data-composer-card]` 矩形 → 竖直光带扫到顶栏（启动线变成 UI 时间轨）→ 清理；跳过/减弱动态/错误分支同步适配。
- 音轨见下；`?t=` / `?speed=` / `?reduced=` / `?probe=` QA 参数保持可用。

### 音效（听感"太单一、不够科幻太空"）

- `vyron-boot.wav` v2.1 重制：4 层全程铺底（35–55Hz sub / Dm9 pad+慢 LFO / 中心空气层 6–14k / 深空双段长混响）+ 16 个规格事件层次化（时间点 0.0ms 偏差）；四频段 mono 口径 **27.7 / 49.3 / 14.0 / 9.03%**（v1：33.9 / 60.0 / 6.0 / 0.16%）；−15.8 LUFS / true peak −4.6 dBFS / stereo corr 0.620。
- `handoff.wav` 1.45s：120ms 缝 click + 550ms 大调钟声 + 850ms bloom + 空气尾（cue 对齐 7/7）。生成脚本固定种子逐字节可复现。**听感未人耳验证**。

### UI 皮肤（图三：呼吸感 / 背景动态 / 对话框流光）

- **根因修复**：本机 Windows「动画效果」关闭 → Chromium/Electron 报 `prefers-reduced-motion: reduce`，v0.1.0 在 reduce 下把皮肤动画全部置 none ⇒ **用户真机皮肤 0 动态**。Round2 改为：`--static`（skinMotion=false 等）仍全静态；OS reduce 改为"减少动态"（停大位移/缩放/漂移，保留 8.4s opacity 呼吸 + composer 低速流光 + 交接 opacity 淡入）。
- **呼吸感明显化**：`va-sheen` 0.06↔0.52（+1.5% scale）、`va-earth` 0.55↔1.0（+2.2%）、`va-rim` 0.10↔0.62（+1.4%）；`va-sheen` 增加两层极光帘幕（84s/90s 横移，零新增 DOM）；星场 90s 慢漂 2.4vmax；日轨游标 / 侧栏 micrographics / ledger 呼吸。真机量化：同位置隔 3.6s 正文区亮度 +37.1%、视口边缘 75.2% 像素差 >3%。
- **对话框流光**：composer 环升级彗尾双弧（白热 34° + 生物青 166°，5.6s/圈，环亮 0.9–1.0）+ 反向 7.2s 副光晕 + 6.4s 呼吸 + 卡面 ≤0.06 斜向流光；focus-within ×1.2。真机 composer 环质心位移 364.8px、峰值亮度比 3.70（改前 1.15）。
- **交接分区显影**：sidebar 0ms → topbar 50ms → composer 240ms → 日轨增亮 340ms → ambient 900ms。`--static` 下 `document.getAnimations()=0`；reduce 下仍保留呼吸与流光；对比度 14.55:1（≥14:1）。

### 工程

- 版本 0.2.0；`HANDOFF_BASE_MS=1200` 在 `lib/splash.js` / `preview/js/timeline.js` 一致，`lib/index.js` / `lib/client.js` 兜底公式同步；manifest 重建。
- 测试：`npm test` 六套断言全绿（host 132 / splash 121 / client 62 / audio 77 / assets 60 / preview 122，共 574 条）；新增 P0 鱼标 / P5 收束 / 新交接装饰 / 版本号回归断言。
- 新增工具：`_tools/patch-mark-path.py`（鱼标 path 注入）、`_tools/cdp-screencast.mjs`（交接连续帧录制）；`_tools/cdp-shot.mjs` 增加 `--post-eval-wait` 与 awaitPromise eval。
- 文档：`docs/design-spec.md` 增 §3.1 收束与交接；`docs/{material-a,material-b,motion-spec,audio-spec,skin-spec}.md` 各模块 Round2 章节；交付报告 v0.2.0。

### 未验证项

- 真实开机观感 / 听感（需重启 DSH 由用户确认）；真实 GPU 帧率（headless 软件光栅 p95 不代表真机，engine 已内置自动降级）；4K/2x DPR 锐度；reduced-transparency 真机；真实登录后内容页的完整皮肤视觉。

## 0.1.0 — 2026-11-03

首个整合版：**启动动画 + UI 皮肤**。

### 启动动画

- P0–P5 六相位（动画秒 0–9.8，默认速度 85%），TOTAL / 交接 / 看门狗三段公式统一，支持 50–150% 速度（变速不变调）。
- 素材融合：Material A「CMD\LN」终端 HUD（日志流/遥测雷达/micrographics/月相/日轨/session ledger）× Material B「威龙 VYRON 4K」轨道地球底板（舷窗 iris 展开、镜头推近、星点、云层漂移、平台反射）。
- DSH 元素：官方大白鱼横越星海 → 撞镜头化为官方鱼标；`DEEPSEEK HARNESS` 字标 + 实时日期/时间 + 月相 + 宿主 facts（profile/model/workspace/sandbox/sessions）。
- 减弱动态、跳过（Esc/点击/SKIP）、每会话/每天/每次打开三档播放时机。
- 程序化音轨 10.4s（声呐 ping / 低频嗡鸣 / 终端蜂鸣 4 连 / 伺服升频 / 舷窗冲击 / 星海风噪 / 上升音墙 / 鲸叫 ×2 / 锁版和弦 / 功率下潜）+ 1.4s 交接钟声；自动播放降级与手势补播。
- 宿主侧交接转场：光缝展开 → 通电扫描 → UI 交叉显影（按速度缩放）。

### UI 皮肤

- 四档 `off / accent / full / glass`、三主题 `orbit / terra / abyss`，浅色宿主独立可读 token。
- `glass` 档动态星海背景 12 层（base/stars/earth/cloud×4/sea/sheen/grain/vignette/rim），纯 CSS，可调通透度，后台/低配/减弱动态/无 backdrop-filter 自动降级。
- `full` 档终端装饰：顶栏日轨、四角角标、micrographics 条、输入框声呐环。
- 设置页「VYRON · 星海鲸航」：播放 / 声音（含试听）/ 外观皮肤 / 内嵌预览。

### 工程

- 离线预览页 `preview/index.html`（`?t=` 定格、`?speed=`、`?probe=`、reduced/跳过参数）。
- 资产管线：`scene.pkg` → TEXV0005/TEXB0004 → PNG mip → 4K webp（555KB）+ 2K + poster；`_tools/tex_png_extract.py`、`_tools/build-manifest.py`、`_tools/cdp-shot.mjs`。
- 配置原子写 `~/.dsh/dsh-startup-vyron.json`；宿主路由 `/dsh-vyron/*`（splash/skin/audio/preview/assets/config，含 Range）。
- 六套冒烟断言（`npm test`）与独立验证报告（`docs/verify/`）。
