# 第三方素材与许可声明

本仓库（`dsh-startup-vyron`）的**代码、文档与程序化音轨**以 MIT 许可发布（见 [LICENSE](LICENSE)）。
**第三方视觉 / 字体素材不在 MIT 范围内**，权利归各自权利人。自 **v0.2.2** 起，全部素材随仓库与官方
GitHub Release 完整发布；缺失时由插件的降级链接管。完整资产口径见 [ASSETS.md](ASSETS.md)。

## 1. 随仓库与 Release 发布的第三方素材

| 文件 | 来源 | 权利状态 | 仓库处理 |
|---|---|---|---|
| `lib/assets/hero-4k.webp`（3840×2160，554,658 B） | Wallpaper Engine 创意工坊项目 `3806012039`（《三角洲行动》威龙 VYRON 动态版 4K，无字版）的 `scene.pkg` → mip0 PNG 提取 | 含游戏角色 / 场景美术，版权归原权利人 | ✅ 随仓库与 Release 发布 |
| `lib/assets/hero-2k.webp`（1920×1080，267,042 B） | 同上，Lanczos 缩放 | 同上 | ✅ 随仓库与 Release 发布 |
| `lib/assets/poster.webp`（1280×720，138,676 B） | 同上，Lanczos 缩放 | 同上 | ✅ 随仓库与 Release 发布 |
| `lib/assets/fonts/Anurati-Regular.otf`（8,176 B） | 素材作者随壁纸附带；作者 Emmeran Richard，授权为 **Free for personal use**（并非 SIL OFL） | 权利归作者 | ✅ 随仓库与 Release 发布 |

这 4 个文件随仓库提交，并与官方 Release 资产逐字节一致（`lib/assets/manifest.json` 记录 size / sha256）。
**代码的 MIT 授权不覆盖这 4 个文件**，维护者不主张对素材本身的任何权利。再分发、商用或公开演示前，
请自行确认你有权使用；若你是权利人并认为随附发布不当，请开 Issue 联系维护者处理，核实后会立即移除。

[scripts/prepare-local-media.ps1](scripts/prepare-local-media.ps1) 为兼容保留：正常克隆已含这 4 个文件，
仅在你自己裁掉素材时，才需要用本机合法持有的原素材按 SHA256 校验恢复。

## 2. Material A — CMD\LN V1.03（Wallpaper Engine 壁纸，`3804048141`）

- 本插件**重新实现**其终端 HUD 视觉语言（活动日志 / 遥测 / micrographics / 月相 / 日轨条 / session ledger / 灰阶色板），
  未搬运原包 HTML / CSS / JS。
- 字体 `Oxanium`、`Share Tech Mono`、`JetBrains Mono`：SIL Open Font License 1.1，随仓库分发，
  许可全文在 [licenses/](licenses/)。
- 背景照片来源为 [Pixabay](https://pixabay.com)（Pixabay Content License，可商用、免署名；
  不得将图片作为独立素材再分发到图库站）；本插件未使用其照片文件。
- 月相算法参考 Jean Meeus《Astronomical Algorithms》第 49 章；在线数据源 US Naval Observatory，插件运行期不联网。
- 原壁纸灵感：Terminal 02 by sheet4.vn。

## 3. Material B — 三角洲行动 威龙 VYRON 动态版 4K（Wallpaper Engine 场景，`3806012039`）

- 本插件参考其**构图与动效参数**（正交投影 3840×2160 底板、地平线、平台反射、风粒子与 fog、日期 / 时间排版语言），
  使用 canvas 自行实现；相关参数取自其 `scene.json` 档案。
- 原包画面、`scene.pkg` 解包件**不随本仓库发布**；由其派生的 3 张 WebP 自 v0.2.2 起随仓库与 Release 发布（见 §1）。
- 字体 `Quicksand`：SIL OFL 1.1，随仓库分发。

## 4. 随仓库分发的字体（均为 SIL OFL 1.1，字形未修改）

| 文件 | 字体 | 版权行 |
|---|---|---|
| `lib/assets/fonts/Quicksand-Bold.otf` | Quicksand Bold | Copyright (c) 2011, Andrew Paglinawan (www.andrewpaglinawan.com), with Reserved Font Name "Quicksand". |
| `lib/assets/fonts/oxanium-200.woff2` | Oxanium 200 | 见 [licenses/OFL-Oxanium.txt](licenses/OFL-Oxanium.txt) |
| `lib/assets/fonts/share-tech-mono-400.woff2` | Share Tech Mono | 见 [licenses/OFL-ShareTechMono.txt](licenses/OFL-ShareTechMono.txt) |
| `lib/assets/fonts/jetbrains-mono-400.woff2`、`-500.woff2` | JetBrains Mono 400 / 500 | 见 [licenses/OFL-JetBrainsMono.txt](licenses/OFL-JetBrainsMono.txt) |
| `lib/assets/fonts/noto-sans-jp-500.woff2`、`-900.woff2` | Noto Sans JP 500 / 900 | 见 [licenses/OFL-NotoSansJP.txt](licenses/OFL-NotoSansJP.txt) |
| `lib/assets/fonts/montserrat-medium.woff2` | Montserrat Medium | 见 [licenses/OFL-Montserrat.txt](licenses/OFL-Montserrat.txt) |

## 5. DeepSeek Harness 品牌元素

- 大白鱼（FishLogo）与 `DEEPSEEK HARNESS` 字标取自 DSH 客户端资源，仅用于**标识本插件是 DSH 的配套
  启动 / 皮肤插件**（nominative use），**不在 MIT 范围内**；商标与美术版权归 DeepSeek（深度求索）。
- 字标字体 `Montserrat`：SIL OFL 1.1（见上表）。
- `DEEPSEEK HARNESS` / `DEEPSEEK` / 深度求索 为 DeepSeek 的商标 / 名称。

## 6. 本插件自有部分

- 代码 / 文档 / 配置 / 预览页 / 四档皮肤 × 三主题：MIT。
- 程序化音轨 `lib/assets/audio/vyron-boot.wav`（10.4 s）、`handoff.wav`（1.45 s）：
  由 [scripts/make-audio.py](scripts/make-audio.py) 用 numpy 纯合成（固定种子、逐字节可复现），无第三方采样，随 MIT 发布。
- 资产清单与校验：`lib/assets/manifest.json`（逐个 size / sha256 / 尺寸 / 时长，共 19 项）。
  4 个第三方素材的权利归属见 §1，不在 MIT 范围内。

## 7. 联系

若你是权利人对本仓库内容有异议，请开 Issue，我们会在核实后立即移除相关内容。
