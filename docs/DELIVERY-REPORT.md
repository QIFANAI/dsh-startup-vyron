# VYRON · 星海鲸航 — 交付报告（v0.2.1 · Round2 细节精修 + 页面内全屏预览）

> 生成时间：2026-11-03 14:2x（Asia/Shanghai）｜项目根：`<repo>`
> v0.2.1 增量：新增**页面内全屏预览**（设置页「全屏预览」按钮 / 任意页面快捷键 **Ctrl+Alt+V** / `__DSH_VYRON_API__.preview()`）——直接在当前页面上按真实启动层播放一次（含交接回本页），实时套用草稿参数、不写配置。详见 `design-spec.md` §8.1、`CHANGELOG.md` 0.2.1。
> 设计权威源：`docs/design-spec.md`（v0.2 增 §3.1 收束与交接）｜模块规格：`docs/{material-a,material-b,motion-spec,audio-spec,skin-spec}.md`
> 独立验收：`_handoff/VERIFY-REPORT-2.md`（verifier）｜冒烟：`docs/verify/smoke-report.md`
> 一句话：**v0.1.0 的三条用户反馈（动效/音效/逻辑）已逐条落地——P1 中央不再空、开幕即有 DSH；大白鱼重做轨迹与质感、地球真正动起来、P5 收束成线 + 1200ms 宿主交接不再生硬；皮肤呼吸与对话框流光在用户真机 reduce 环境下也可见；音轨重制为深空科幻层次。已装入本机 desktop profile，重启 DSH 验收。**

## 1. 本轮定位

v0.1.0 交付后用户给出三张截图与听感反馈，本轮**只做细节精修，不重做、不改契约**：

| 用户原话（截图） | 本轮处理 | 证据 |
|---|---|---|
| 图一「中间位置太空…应该在开幕就有 dsh 的元素在」 | P0 中央鱼标+字标开局；P1 中央 **ORBIT CORE**（把素材 A 的中央大雷达/轨道图搬回画面正中，核心为 DSH 鱼标 + 进度环 + 字标）；中央区非背景内容占比 **0.05% → 25.32%** | `_shots/round2-hud/`（`contact-sheet.png`、`before-t26-v010.png` vs `final-t2.6.png`、`METRICS.md`） |
| 图二「大白鱼…最后结束前在乱窜」「质感太草率、太廉价」 | 轨迹改单条连续 Catmull-Rom：左下跃出 → 右上弧 → 一次连续侧倾大弧折返到字标鱼标位（末位误差 **2.5px**、0 次 >120°/0.1s 翻转、末速归零）；鲸体改 canvas 逐帧渲染（12 段体表渐变/焦散/镜面/三色边缘光/半透明鳍/虹膜高光/软投影），尾迹 4 层 tapered ribbon + 粒子；morph 粒子向 mark 汇聚 | `_shots/round2-whale/`（`round2-whale-contact-sheet.jpg`、`path-smoothness.txt`、`*-bench.json`） |
| 图二「让地球动起来」 | 云层/地表相对视差（地表 +0.85px/s、云层反向 9.3–11.0px/s，1 张合成层）、limb 8.4s 呼吸 + 色温偏移、星点相机视差、两段大气光扫、平台反光 ×1.22；修复 v0.1.0 太阳闪光漏复位 globalAlpha 的遗留 bug。t=4.4 vs 6.4 地球区 **>8 灰阶像素占比 80%** | `_shots/round2-engine/`（`diff-montage-final-gate.png`、`cloud-filmstrip-t44-t64.png`、`limb-breathing.png`） |
| 图二「高闪→归成一条线→进入操作页面思路好，但要优化逻辑，进入太生硬」 | P5 高闪后终帧 9.02–9.62 收束成一条光缝；宿主交接 950→**1200ms**：光缝→上下黑幕从中央缝滑开（"从线展开 UI"）→300ms 分区显影→420ms 声呐环飞入输入框→700ms 光带扫到顶栏→1200ms 清理 | 见 §5 交接逐帧证据（本报告 `handoff-final/`、`sc2/handoff-contact.jpg`） |
| 图三「背景动态要搞，呼吸感要强、观感明显，对话框的流光动态也要有」 | 根因修复：本机 Windows 动画效果=关 → `prefers-reduced-motion: reduce` → v0.1.0 皮肤在用户真机 **0 动态**。Round2 改为 `--static` 全静态 / OS reduce "减动态"（保留低频呼吸+低速流光）；呼吸振幅翻倍以上 + 极光帘幕；composer 彗尾双弧流光。真机（reduce 档）同位置隔 3.6s 正文区亮度 **+37.1%**、composer 环质心位移 **364.8px**、峰值亮度比 3.70（改前 1.15） | `_shots/round2-skin/`（`cmp-reduce.png`、`cmp-composer.png`、`after/reduce-measure-3600.json`、`static-probe.json`） |
| 听感「太单一、不够科技科幻太空」 | 音轨 v2.1 重制：4 层全程铺底 + 16 事件层次化 + 深空双段混响；四频段 mono 口径 **27.7 / 49.3 / 14.0 / 9.03%**（v1：33.9 / 60.0 / 6.0 / 0.16%）；−15.8 LUFS / TP −4.6 / corr 0.620；handoff 1.45s cue 对齐 7/7 | `_shots/round2-audio/`（`old-vs-new.png`、`metrics-v2-final.json`、`handoff-cues.png`） |

## 2. 交付物

| 交付 | 位置 | 状态 |
|---|---|---|
| 插件包 `dsh-startup-vyron@0.2.1` | `<repo>` | 已安装进 `desktop` profile（`include:dsh-startup-vyron` = active） |
| 启动动画（P0–P5 + 1200ms 交接） | `preview/` + `lib/splash.{js,css}` | 离线定格 14 帧 + 真机交接 screencast 实测（0 error/0 exception） |
| 程序化音轨 v2.1 | `lib/assets/audio/vyron-boot.wav`（10.4s / −15.8 LUFS / sha `d5dd49c2…`）+ `handoff.wav`（1.45s / sha `5c2e4635…`） | 四频段/LUFS/peak/cue 实测；**听感未人耳验证** |
| 星海终端皮肤（四档×三主题 + Round2 呼吸/流光/显影） | `lib/skin.css`（116,692B / 2376 行）+ `lib/client.js` | 真机隔离实例 + harness 双路实测（含 reduce 口径） |
| 设置页「VYRON · 星海鲸航」 | `lib/client.js` → `settings.section` id=`startup-vyron` order=27 | 已注册；预览页随新版本更新 |
| 文档 | `docs/design-spec.md`（§3.1 收束/交接）、六份模块规格 Round2 章节、`README` / `INSTALL` / `CHANGELOG` | 齐全 |
| 测试 | `test/smoke-{host,splash,client,audio,assets,preview}.mjs` | **587/587 PASS**（host 132 / splash 134 / client 62 / audio 77 / assets 60 / preview 122） |
| 证据 | `_shots/round2-{hud,whale,engine,skin,audio,lead}/` | 各模块 before/after + 量化 JSON + 可复现脚本 |

## 3. 启动时间轴与交接（动画秒；TOTAL=9.8 不变）

`signal 0–0.65`（中央鱼标 + DSH 字标 + 光缝）→ `console 0.65–3.10`（四窗 + **中央 ORBIT CORE**：环系/罗盘/conic 扫掠/鱼标核心/进度环/频谱/遥测流）→
`breach 3.10–5.10`（core 充能放大成 iris 圆，4K 地球展开；云层视差/大气呼吸/光扫）→
`whale 5.10–7.60`（5.06 跃出 → 6.30 右上 → 7.35 侧倾折返到字标鱼标位 → 7.35–7.52 悬停收尾）→
`lockup 7.60–9.00`（白闪 7.52–7.92 → 粒子化鱼标 → 字标 + 日期/月相/facts；HUD 环 7.5% 回归）→
`bloom 9.00–9.80`（高闪 9.02 → 收束成一条光缝 → 9.20–9.62 全场压黑只剩光缝）→ 宿主交接 **1200ms × IMPACT**。

交接编排（基准 ms，`HANDOFF_BASE_MS=1200`，详见 design-spec §3.1）：
`0` 光缝；`120` 上下黑幕从中央缝向上下滑开（930ms）；`300` `html.vyron-enter` UI 分区显影；`420` 声呐环飞向 `[data-composer-card]`；`700` 竖直光带扫到顶栏；`1200` 清理。跳过 600ms / reduced 380ms / 错误 40ms。

## 4. 皮肤

- 四档 `off / accent / full / glass`；三主题 `orbit / terra / abyss`；明暗宿主双 token 套。
- Round2：**呼吸感明显化**（sheen 0.06↔0.52、earth 0.55↔1.0、rim 0.10↔0.62，8.4s 呼吸 + 1.4–2.2% scale + 极光帘幕 84s/90s）；**对话框彗尾流光**（5.6s/圈双弧 + 反向 7.2s 副光晕 + 6.4s 呼吸 + 卡面流光 + focus ×1.2）；交接 `html.vyron-enter` 分区显影（sidebar 0ms → topbar 50ms → composer 240ms → 日轨 340ms → ambient 900ms）。
- **降级语义（关键修复）**：`--static`（skinMotion=false / reducedMotion 设置 / ≤4 线程）全静态（`document.getAnimations()=0`）；OS `prefers-reduced-motion` 改为"减动态"（保留低频呼吸与低速流光，停大位移/缩放/漂移）；`--paused` 全暂停；`--noblur` / reduced-transparency / 无 backdrop-filter 路径不变。
- 对比度：deep 正文峰值 14.55:1（v0.1.0 14.87，仍 ≥14:1）。

## 5. 验证矩阵

| 项 | 证据 | 结果 |
|---|---|---|
| 冒烟 | `npm test` | **574/574 PASS，exit 0** |
| 离线关键帧（Lead 集成） | `_shots/round2-lead/final/` + `final-contact.png`（14 帧：0.4/1.6/2.6/3.3/4.4/5.6/6.4/7.0/7.45/7.7/8.2/8.8/9.3/9.6） | 0 console error/exception；P5 收束/黑场正确 |
| 真机交接（最终构建） | `_shots/round2-lead/sc2/`（Page.startScreencast 16.6s/248 帧）+ `handoff-final/` | 高闪→光缝→黑场→黑幕展开→UI 显影→环/光带；0 error；cleanup 后 `vyron-lock` 撤销、皮肤保留 |
| 鲸鱼轨迹 | `_shots/round2-whale/path-smoothness.json/.txt` | 7/7 PASS：6.30 落点误差 0.0px、最大方向变化 80.8°/0.1s、0 翻转、末位距 mark 2.5px、单峰归零 |
| 鲸鱼质感 | `_shots/round2-whale/round2-whale-contact-sheet.jpg` + 同帧 A/B | 12 段体表渐变/焦散/镜面/半透明鳍/虹膜；相对 v0.1.0 平涂剪影明显升级 |
| 地球运动 | `_shots/round2-engine/diff-montage-final-gate.png` 等 | t4.4 vs t6.4：meanAbs 35.8、>8 灰阶占 **80.0%**（判据 ≥2%）；同 t 两次 0.000；reduced 两次 0.000；新增合成层 1 |
| 皮肤（真机 reduce=用户环境） | `_shots/round2-skin/reduce-*` + `after-measure-3600.json` | 同位置隔 3.6s：正文区 +37.1%、视口边缘 75.2% 像素差 >3%；composer 环位移 364.8px、亮度比 3.70；`--static` getAnimations=0；0 error |
| 音频 v2.1 | `_shots/round2-audio/metrics-v2-final.json` + `docs/audio-spec.md` | 四频段 mono 27.7/49.3/14.0/9.03%；−15.8 LUFS；TP −4.6 dBFS；corr 0.620；handoff cue 7/7 |
| 测试反向验证 | verifier `_handoff/verify2/tools/reverse-check.py` | 6/6 用例先红后绿（防恒真断言） |
| 安装 | `plugin_manager`（已安装 `link:` 本工作区；重启加载 v0.2.1） | desktop profile 行 `dsh-startup-vyron` active；`/dsh-vyron/config` 200；client slot `startup-vyron` order 27；用户配置 splashSpeed=70 / glassTransparency=80 |
| **独立验收（verifier）** | `_handoff/VERIFY-REPORT-2.md`（286 行）+ `_handoff/verify2/round2/final-summary.json` | 用户 5 条反馈**全部通过**（F2b 质感为代理指标 + A/B，最终观感由用户确认）；无 P0/P1/P2 缺陷；真机探针交接 7/7 判定、cleanup 偏差 2.2%、真机全链路 223 帧 0 error；`--static` getAnimations=0；反向验证 6/6；未验证项照实 |

## 6. 未验证项（照实）

1. **真实开机观感与听感**：启动动画只能在重启 DSH 后看到；音轨仅做波形/频谱/响度实测，**未人耳试听**（8k 以上空气层是否偏亮、pad 低频是否浑浊需用户确认）。
2. **真实 GPU 帧率**：headless 为软件光栅（SwiftShader），1440p p95 +9%（engine 新增云层合成 1 层）；真实 GPU 未测，engine 已内置自动降级兜底。engine 在 1080p 软件光栅有 +1 vsync 台阶（50ms），真机 GPU 不应触发。
3. 4K / 2x DPR 下鲸体与鱼标锐度、云层缓存 0.5–0.7× 的软化未测。
4. 真机 `reduced-transparency`；真实登录后内容页（长对话/代码块/弹窗）的完整皮肤视觉由用户确认。
5. 皮肤 terra/abyss 与浅色宿主的主观观感未由用户确认。
6. 真机交接在隔离实例上落到登录页（深色空界面），"露出后的 UI 内容"可读性以 harness + API 时序判定；用户真实界面内容更丰富，观感需重启确认。

## 7. 如何验收 / 回滚

1. **完全退出 DSH（含托盘）并重开** → 启动动画（约 11.5s + 1.3s 交接 @85%；用户配置 70% 时约 14.0s + 1.4s）+ 默认「星海玻璃」皮肤；重启后应能明显看到：开幕鱼标、中央 ORBIT CORE、鲸鱼平滑落点、地球云层在动、P5 收束成线、UI 从线里展开、皮肤呼吸与 composer 流光。
2. 设置 →「VYRON · 星海鲸航」：播放/声音/皮肤档位/主题/通透度/速度/内嵌预览；`减弱动态` 静帧终帧 2.2s。
3. **预览方式**（v0.2.1）：设置页 →「VYRON · 星海鲸航」→ 预览组 →「全屏预览」= 在当前页面按真实启动层完整播放一次（含交接回本页，实时套用草稿参数、不写配置）；任意页面也可按 **Ctrl+Alt+V** 直接预览。原「内嵌预览（小窗）」保留为次要按钮。
4. 回滚：`plugin_manager set_bundle dsh-startup-vyron enabled=false`（或 remove_bundle）；旧插件 `dsh-startup-elisa` 已停用，可 `set_bundle enabled=true` 恢复（互斥，勿同时启用）。
4. 配置文件：`~/.dsh/dsh-startup-vyron.json`（缺省自动生成默认值）。

## 8. 变更记录

见 `CHANGELOG.md`（0.2.0 / 0.2.1 条目）与 `docs/design-spec.md` §3.1 / §8.1。第三方素材许可与合规见 `THIRD-PARTY-NOTICES.md`（本机自用，不二次分发）。
