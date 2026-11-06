# 贡献指南

## 环境

- Node.js **>= 20**（测试零依赖，不需要 `npm install`）。
- Python 3（可选，仅 `scripts/build-manifest.py` / `scripts/make-audio.py` 需要；音轨脚本需要 numpy）。
- Windows / Linux / macOS 均可；宿主侧真实安装验证仅 Windows DSH 桌面版。

## 跑测试

```bash
npm test              # 六套冒烟：host / splash / client / audio / assets / preview
npm run check:public  # 公开仓库门禁（必须全绿）
```

## 素材边界（硬性）

本仓库是**公开源码版**，以下文件**永不入库**（`.gitignore` 已忽略，`check:public` 会拦截）：

- `lib/assets/hero-4k.webp`、`hero-2k.webp`、`poster.webp`（第三方壁纸派生画面）
- `lib/assets/fonts/Anurati-Regular.otf`（个人使用授权，非 OFL）

插件在缺失这些文件时按既有降级链运行（见 [ASSETS.md](ASSETS.md)）。**不要**为了"补齐画面"把这些文件提交进 PR，
也不要在 Issue / PR 中上传第三方素材或游戏截图。

## 提交规范

- 一个 PR 只做一件事；说明「改了什么 / 为什么 / 怎么验证」。
- 行为变更请同步 `docs/` 下对应规格；**`docs/design-spec.md` 是唯一设计权威源**，冲突以它为准。
- 不要修改 `LICENSE` 与 `THIRD-PARTY-NOTICES.md` 中已声明的第三方权利归属；
  新增第三方素材 / 字体必须先在 PR 中说明来源与许可，且许可必须允许再分发。
- 提交信息建议：`feat(skin): ...` / `fix(splash): ...` / `docs: ...` / `test: ...` / `chore: ...`。
- 文档与示例里不要写本机绝对路径（盘符路径），`check:public` 会检查。

## 版本

版本号在 `package.json` / `release.json` / `lib/client.js` 兜底 / `lib/splash.js` 兜底中保持一致；
`CHANGELOG.md` 按 `0.x.y — 日期` 追加。发布走标签（`v0.2.1` 起），不发布含第三方素材的二进制包。
