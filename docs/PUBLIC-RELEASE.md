# 公开仓库版对照与验证（v0.2.1）

> 生成：2026-11-06｜对象：本仓库首个公开提交（tag `v0.2.1`）｜本地完整版基线：`dsh-startup-vyron@0.2.1`（2026-11-03）

## 1. 结论

- **代码 100% 公开**：`lib/` 与 `preview/` 下的运行时代码 / 样式与完整版**逐字节一致**（唯一例外是资产清单 `lib/assets/manifest.json`，见 §4）。
- **仅剔除 4 个无授权第三方文件**：3 张 Wallpaper Engine 壁纸派生底图 + `Anurati-Regular.otf`（个人使用授权，非 OFL）。缺失时按既有降级链运行，不破坏任何功能路径。
- **逐文件对照**：本仓库 82 个文件 = **42 个与完整版字节一致** + **16 个有意修改**（文档口径 / 路径脱敏 / 清单重建 / 测试适配 / 元数据）+ **24 个新增**（公开仓库配套）。
- **本地完整版基线 68 个文件**：10 个未入公开仓库 = 4 个第三方素材 + 6 个本机交付相关文件（组合包脚本与说明，见 §3）。
- **验证**：`npm test` 577 PASS / 0 FAIL / 5 SKIP（干净仓库，无第三方素材）；`npm run check:public` 8/8 PASS；`manifest.json` 15 项 / 2,299,356 B 经 SHA256 全量复核。

## 2. 逐字节一致的 42 个文件（运行时逻辑，零改动）

包括但不限于：

- 宿主：`lib/index.js`、`lib/splash.js`、`lib/splash.css`、`lib/client.js`、`lib/skin.css`、`lib/audio.js`
- 启动页：`preview/index.html`、`preview/css/*.css`（4 个）、`preview/js/*.js`（6 个）
- 运行时资产：2 条程序化音轨、7 个 OFL 字体、5 个品牌 SVG、`locale/*.json`、`icon.svg`
- 其余：`cordis.patch.yml`、`docs/material-b.md`、`docs/motion-spec.md`、`test/_mocks.mjs`、`test/smoke-splash.mjs`、`test/smoke-client.mjs`、`test/smoke-audio.mjs`、`test/smoke-preview.mjs`

> 判别方法：对 68 个完整版源文件与本仓库同名文件逐个 SHA256 比对；上表为比对结果 = 完全一致。

## 3. 未入公开仓库的 10 个文件（按设计排除）

| 文件 | 类别 | 原因 |
|---|---|---|
| `lib/assets/hero-4k.webp` | 第三方视觉素材 | Wallpaper Engine 壁纸派生画面（含《三角洲行动》游戏美术），不可再分发 |
| `lib/assets/hero-2k.webp` | 第三方视觉素材 | 同上 |
| `lib/assets/poster.webp` | 第三方视觉素材 | 同上 |
| `lib/assets/fonts/Anurati-Regular.otf` | 第三方字体 | 作者 Emmeran Richard，授权为 **Free for personal use**，非 SIL OFL，不可再分发 |
| `combo/00-给DSH的安装说明.md` | 本机交付件 | 面向「含第三方素材的完整组合包」的安装说明，公开仓库不发布该二进制包 |
| `combo/01-使用说明与排错.md` | 本机交付件 | 同上 |
| `combo/tools/install-vyron.ps1` | 本机交付件 | 同上（含本机安装路径与 link: 迁移序列，仅适用于完整组合包） |
| `combo/tools/verify-vyron.ps1` | 本机交付件 | 同上 |
| `scripts/make-combo-package.ps1` | 本机交付件 | 打「含第三方素材的完整组合包」用，公开仓库无该产物 |
| `releases/dsh-startup-vyron-0.2.1.tgz` | 本机构建产物 | 含上述 4 个第三方素材，不可发布 |

> 本地完整版组合包仍在用户本机，不受影响；公开仓库的安装方式见 `INSTALL.md`。

## 4. 16 个有意修改的文件

| 文件 | 改动 | 说明 |
|---|---|---|
| `README.md` | 公开版重写 | 去掉「本机自用」口径，新增公开仓库说明 / 素材降级 / 安装 / 开发测试 / 许可章节 |
| `INSTALL.md` | 路径脱敏 + 素材章节 | 本机绝对路径 → 占位符；新增「公开仓库默认降级模式」与本地恢复步骤 |
| `LICENSE` | 纯 MIT | 移除原文件末尾的第三方声明行（已移至 `THIRD-PARTY-NOTICES.md`；MIT 正文与版权行未改动） |
| `THIRD-PARTY-NOTICES.md` | 公开版重写 | 明确「不随仓库发布」的 4 个文件、OFL 字体清单、DSH 商标声明、联系移除条款 |
| `CHANGELOG.md` | 顶部追加 `0.2.1-public` | 记录公开化改动；历史版本记录未改动 |
| `package.json` | 元数据 / 脚本 | 描述改公开口径；新增 `repository` / `homepage` / `bugs` / `author`；脚本路径 `_tools/` → `scripts/`，新增 `check:public` |
| `release.json` | 公开版声明 | `distribution: source`、`mediaIncluded: false`，不再指向本机 tgz |
| `lib/assets/manifest.json` | 重建 | 19 项 → **15 项公开资产**（移除 4 个本地专用文件），SHA256 / 尺寸 / 时长重新计算 |
| `test/smoke-assets.mjs` | 测试适配 | 4 个本地专用文件缺失时 `skip`；manifest 支持 `manifest.local.json`；清理清单断言改为动态 |
| `test/smoke-host.mjs` | 测试适配 | 静态 Range / MIME 断言改用随仓库发布的程序化音轨；WebP 契约在本地恢复后自动补测；mock cwd 去本机路径 |
| `docs/DELIVERY-REPORT.md` | 路径脱敏 | 仅把本机绝对路径替换为 `<repo>` / `<workspace>` / `<DSH_INSTALL>` 等占位符，内容未改 |
| `docs/audio-spec.md` | 路径脱敏 | 同上（ffmpeg / python 路径改通用命令） |
| `docs/design-spec.md` | 路径脱敏 | 同上（项目根 / 工具路径） |
| `docs/material-a.md` | 路径脱敏 | 同上（素材源目录） |
| `docs/skin-spec.md` | 路径脱敏 | 同上 |
| `docs/verify/combo-package-report.md` | 路径脱敏 | 同上（历史验收记录保留） |

> 运行时代码（`lib/*.js`、`lib/*.css`、`preview/**`）**没有任何一行业务逻辑改动**；测试适配只影响测试自身的 skip/选材逻辑。

## 5. 24 个新增文件（公开仓库配套）

- 仓库治理：`.gitignore`、`.gitattributes`、`.github/workflows/test.yml`、`.github/ISSUE_TEMPLATE/*`（3）、`.github/PULL_REQUEST_TEMPLATE.md`、`CONTRIBUTING.md`、`SECURITY.md`、`CODE_OF_CONDUCT.md`
- 素材与许可：`ASSETS.md`、`licenses/FONT-CREDITS.md`、`licenses/OFL-*.txt`（6：Quicksand / Montserrat / Oxanium / ShareTechMono / JetBrainsMono / NotoSansJP）
- 工具：`scripts/check-public.mjs`（公开门禁）、`scripts/prepare-local-media.ps1`（本地恢复 4 个素材，SHA256 校验）、`scripts/build-manifest.py`（公开版 + `--local` 本地版清单）、`scripts/make-audio.py`（音轨复现）
- 文档索引：`docs/README.md`、`docs/PUBLIC-RELEASE.md`（本文件）

## 6. 验证证据

| 项 | 结果 |
|---|---|
| `npm test`（干净仓库，无第三方素材） | **577 PASS / 0 FAIL / 5 SKIP**（host 132 / splash 134 / client 62 / audio 77 / assets 50 / preview 122；skip = 4K 底板 1 + 底图体积尺寸 3 + Anurati 1） |
| `npm run check:public` | **PASS 8/8**（无 4 个第三方文件、无 tgz/zip、无本机绝对路径 / token / 私钥、manifest 覆盖与 SHA256 全量一致、package/release 口径正确） |
| `python scripts/build-manifest.py --check` | PASS（15 files / 2.19 MB，与磁盘一致） |
| 逐文件 SHA256 对照 | 42 内容一致 / 16 有意修改 / 0 非预期缺失（§1）；其中 6 个源文件原为 CRLF，仓库按 `.gitattributes` 统一归一为 LF（文本内容逐行一致） |
| 运行时代码零改动 | `lib/*.js`、`lib/*.css`、`preview/**` 全部与 v0.2.1 字节一致 |
| GitHub Actions | **PASS**（commit `937d4900`，Node 20 / 22 双矩阵：`check:public` + `npm test`）。首轮 CI 曾暴露「manifest 按 CRLF 工作树生成、仓库按 LF 归一」导致的 `brand/whale.svg` 字节失配；已按仓库实际字节重建 manifest（3601 → 3600 B）并复跑通过 |

## 7. 已知限制 / 未验证项（如实标注，不标 ✅）

- **公开版默认「降级观感」未做真机重启人眼验收**：程序化深空渐变替代 4K 底板后的实际视觉（尤其 `breach` / `whale` 相位的云层视差缺失、终帧日期字体的 Anurati 回退）**待核实**；本地完整版（含原素材）的观感此前已由用户验收。
- **GitHub Actions**：已实际执行并通过（见 §6）；仓库页 Actions 中 `2362617c` 那次 failure 是修复前的首轮记录，保留可追溯。
- **非 Windows 平台**：测试为纯 node 逻辑，理论上跨平台；但真实 DSH 宿主安装验证仅 Windows 桌面版完成（与完整版一致）。
- 文档 `docs/*.md` 中涉及原始素材运动参数 / 像素坐标的段落保留自完整版设计记录，公开版缺底板时这些参数不参与降级渲染路径。
