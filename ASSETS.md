# 资产说明（完整素材开源版）

## 1. 仓库里有 / 没有哪些资产

本仓库 `lib/assets/` 共 **19 个**资产文件，逐个 size / sha256 / 尺寸 / 时长记录在 `lib/assets/manifest.json`（`fileCount=19`，`totalBytes=3,267,907`）。自 **v0.2.2** 起，全部资产随仓库与官方 GitHub Release 完整发布，安装后即是完整观感。

| 类别 | 文件 | 许可 | 随仓库 |
|---|---|---|---|
| 字体 × 8 | `Quicksand-Bold.otf`、`oxanium-200`、`share-tech-mono-400`、`jetbrains-mono-400/500`、`noto-sans-jp-500/900`、`montserrat-medium` | SIL OFL 1.1（见 `licenses/`） | ✅ |
| 音轨 × 2 | `audio/vyron-boot.wav`、`audio/handoff.wav`（程序化合成） | MIT | ✅ |
| 品牌 SVG × 5 | `brand/whale.svg`、`whale-official.svg`、`whale-silhouette.svg`、`lockup.svg`、`wordmark.svg` | © DeepSeek，标识用途，非 MIT | ✅ |
| 4K 底板 × 3 | `hero-4k.webp`、`hero-2k.webp`、`poster.webp` | 第三方游戏美术，权利归各自权利人 | ✅（v0.2.2 起） |
| 手写体 × 1 | `fonts/Anurati-Regular.otf` | Free for personal use，权利归作者，非 OFL | ✅（v0.2.2 起） |

### 缺失时的降级（无需改任何代码）

- **底板缺失 / 解码失败**：`preview/js/engine.js` 的加载链 `hiSrc → midSrc → posterSrc` 全部失败后进入 `fallback` 模式，
  绘制程序化深空渐变；云层视差合成层自动关闭（引擎注释明确「不拿兜底图冒充真实云纹」）。
  启动动画其余相位（终端 HUD / ORBIT CORE / 大白鱼 / 字标锁版 / 交接转场 / 音轨 / 四档皮肤）全部照常。
- **Anurati 缺失**：`preview/css/splash.css`、`preview/css/hud.css` 的 `@font-face` 请求 404，
  字体栈回退到 `Quicksand` / `Montserrat` / `sans-serif`。
- **测试**：`npm test` 以完整素材树为准（`manifest.json` 19 项）；这 4 项在 `test/smoke-assets.mjs`、`test/smoke-host.mjs` 中均有体积 / 像素尺寸 / MIME / 字体魔数断言。若人为删除素材，插件运行仍走上述降级链，但素材用例会 `skip`、manifest 完整性校验会报缺失。

## 2. 第三方素材来源与权利

| 文件 | 字节 | sha256 |
|---|---|---|
| `hero-4k.webp` | 554,658 | `86c51c85f44599919c2cf84d3a4f23d675a11e2228e46d222c2eeb5a6491cb6e` |
| `hero-2k.webp` | 267,042 | `5f06b1533dbc0048b8a89bede6c79dec4a4a68f98ed654f8b5349aa34bc2fef6` |
| `poster.webp` | 138,676 | `4e6c2104d72e128d81a398d8fed1372b8a0f43c4f492b4c0cb4ac13d06424e4a` |
| `Anurati-Regular.otf` | 8,176 | `9b6c41cb089ea9f682f177d2a5dc21e1828c39e6f20b9a4c11d999de912e00c3` |

- **3 张底板**：Wallpaper Engine 创意工坊项目 `3806012039`（《三角洲行动》威龙 VYRON 动态版 4K，无字版）的
  `scene.pkg` → mip0 PNG 提取；`hero-2k` / `poster` 由 4K 版 Lanczos 缩放。画面含游戏角色 / 场景美术，版权归原权利人。
- **Anurati**：字体作者 Emmeran Richard，随壁纸附带，授权为 **Free for personal use**（并非 SIL OFL）。
- **权利与责任**：上述素材的权利归各自权利人所有；**代码的 MIT 授权不覆盖素材**，维护者不主张对素材本身的任何权利。
  再分发、商用或公开演示前，请自行确认你有权使用；若你是权利人并认为随附发布不当，请开 Issue 联系维护者处理。
- 历史说明：v0.2.1 公开仓库曾排除这 4 个文件（当时按「仅本机自用」处理），v0.2.2 起改为随仓库与 Release 完整发布；
  v0.2.1 的对照记录见 [docs/PUBLIC-RELEASE.md](docs/PUBLIC-RELEASE.md)。

## 3. 兼容保留：本地恢复脚本

**正常克隆不需要这一步**——4 个文件已在仓库里。`scripts/prepare-local-media.ps1` 仅为兼容保留：
如果你使用的分发包裁掉了这 4 个文件、且你本机合法持有原素材，可用它在本地恢复（逐文件 SHA256 校验，不一致则拒绝写入）。

```powershell
# 1) 准备一个目录，内含 4 个同名文件：hero-4k.webp / hero-2k.webp / poster.webp / Anurati-Regular.otf
# 2) 在仓库根执行
pwsh -File scripts/prepare-local-media.ps1 -SourceDir "<你的素材目录>"
# 3) 重建本地资产清单（manifest.local.json，Git 已忽略）并跑全量测试
python scripts/build-manifest.py --local
npm test
```

## 4. 构建 / 校验入口

```bash
npm test              # 六套冒烟（host / splash / client / audio / assets / preview）
npm run check:public  # 公开门禁：无本机绝对路径 / 无密钥 / 版本一致 / 4 个第三方素材随仓库发布 / manifest 一致
python scripts/build-manifest.py --check   # 资产清单漂移检查（需 python）
python scripts/make-audio.py               # 重新合成两条音轨（固定种子，可复现）
```
