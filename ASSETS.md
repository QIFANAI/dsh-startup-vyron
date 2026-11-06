# 资产说明（公开仓库版）

## 1. 仓库里有 / 没有哪些资产

本仓库 `lib/assets/` 共 **15 个**资产文件，逐个 size / sha256 / 尺寸 / 时长记录在 `lib/assets/manifest.json`：

| 类别 | 文件 | 许可 | 随仓库 |
|---|---|---|---|
| 字体 × 8 | `Quicksand-Bold.otf`、`oxanium-200`、`share-tech-mono-400`、`jetbrains-mono-400/500`、`noto-sans-jp-500/900`、`montserrat-medium` | SIL OFL 1.1（见 `licenses/`） | ✅ |
| 音轨 × 2 | `audio/vyron-boot.wav`、`audio/handoff.wav`（程序化合成） | MIT | ✅ |
| 品牌 SVG × 5 | `brand/whale.svg`、`whale-official.svg`、`whale-silhouette.svg`、`lockup.svg`、`wordmark.svg` | © DeepSeek，标识用途，非 MIT | ✅ |
| 4K 底板 × 3 | `hero-4k.webp`、`hero-2k.webp`、`poster.webp` | 第三方游戏美术，不可再分发 | ❌ |
| 手写体 × 1 | `fonts/Anurati-Regular.otf` | Free for personal use，不可再分发 | ❌ |

### 缺失时的降级（无需改任何代码）

- **底板缺失**：`preview/js/engine.js` 的加载链 `hiSrc → midSrc → posterSrc` 全部失败后进入 `fallback` 模式，
  绘制程序化深空渐变；云层视差合成层自动关闭（引擎注释明确「不拿兜底图冒充真实云纹」）。
  启动动画其余相位（终端 HUD / ORBIT CORE / 大白鱼 / 字标锁版 / 交接转场 / 音轨 / 四档皮肤）全部照常。
- **Anurati 缺失**：`preview/css/splash.css`、`preview/css/hud.css` 的 `@font-face` 请求 404，
  字体栈回退到 `Quicksand` / `Montserrat` / `sans-serif`。
- **测试**：`npm test` 对这 4 项按 `skip` 处理（`test/smoke-assets.mjs`、`test/smoke-host.mjs`），
  干净仓库（无素材）仍然全绿；`npm run check:public` 会断言这 4 个文件**不得**出现在仓库里。

## 2. 本地恢复原画（仅限合法持有原素材的用户）

如果你是 Wallpaper Engine 用户并已订阅对应创意工坊项目，可以在本机恢复完整版观感。
恢复后的素材**仅限本机自用**，不得提交到本仓库或再分发（`.gitignore` 已忽略）。

```powershell
# 1) 准备一个目录，内含从你自己的本机素材里提取的 4 个文件：
#    hero-4k.webp / hero-2k.webp / poster.webp / Anurati-Regular.otf
# 2) 在仓库根执行（逐文件校验 sha256，不一致则拒绝写入）
pwsh -File scripts/prepare-local-media.ps1 -SourceDir "<你的素材目录>"
# 3) 重建本地资产清单（manifest.local.json，Git 已忽略）并跑全量测试
python scripts/build-manifest.py --local
npm test
```

期望字节与 sha256（必须逐字节一致）：

| 文件 | 字节 | sha256 |
|---|---|---|
| `hero-4k.webp` | 554,658 | `86c51c85f44599919c2cf84d3a4f23d675a11e2228e46d222c2eeb5a6491cb6e` |
| `hero-2k.webp` | 267,042 | `5f06b1533dbc0048b8a89bede6c79dec4a4a68f98ed654f8b5349aa34bc2fef6` |
| `poster.webp` | 138,676 | `4e6c2104d72e128d81a398d8fed1372b8a0f43c4f492b4c0cb4ac13d06424e4a` |
| `Anurati-Regular.otf` | 8,176 | `9b6c41cb089ea9f682f177d2a5dc21e1828c39e6f20b9a4c11d999de912e00c3` |

> **为什么这样处理**：这 3 张底板是 Wallpaper Engine 第三方壁纸的派生画面（含《三角洲行动》游戏美术），
> Anurati 的授权是个人使用（并非 SIL OFL）。公开托管 = 二次分发，与本项目自己的许可声明冲突，
> 也有 DMCA 下架风险。除这 4 个文件外，公开仓库与 `v0.2.1` 完整版源码**逐字节一致**
> （对照表见 [docs/PUBLIC-RELEASE.md](docs/PUBLIC-RELEASE.md)）。

## 3. 构建 / 校验入口

```bash
npm test              # 六套冒烟（host / splash / client / audio / assets / preview）
npm run check:public  # 公开仓库门禁：无第三方素材、无本机绝对路径、无密钥、manifest 一致
python scripts/build-manifest.py --check   # 资产清单漂移检查（需 python）
python scripts/make-audio.py               # 重新合成两条音轨（固定种子，可复现）
```
