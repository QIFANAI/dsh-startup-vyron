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

自 v0.2.2 起，本仓库是**完整素材开源版**：`lib/assets/` 下全部素材随仓库与 Release 完整发布，不再排除第三方底板与字体。

- 4 个第三方素材（`hero-4k.webp` / `hero-2k.webp` / `poster.webp` / `Anurati-Regular.otf`）已在仓库中，
  `check:public` 会断言它们随仓库发布且被 `manifest.json` 覆盖；**不要从 PR 中删除这些文件**。
- 这些素材的权利归各自权利人，代码的 MIT 授权不覆盖素材；插件在素材缺失时仍按既有降级链运行（见 [ASSETS.md](ASSETS.md)）。
- 新增或替换第三方素材 / 字体必须先在 PR 中说明来源与许可，且许可必须允许再分发；
  不要在 Issue / PR 中上传与本项目无关的第三方素材或游戏截图。

## 提交规范

- 一个 PR 只做一件事；说明「改了什么 / 为什么 / 怎么验证」。
- 行为变更请同步 `docs/` 下对应规格；**`docs/design-spec.md` 是唯一设计权威源**，冲突以它为准。
- 不要修改 `LICENSE` 与 `THIRD-PARTY-NOTICES.md` 中已声明的第三方权利归属；
  新增第三方素材 / 字体必须先在 PR 中说明来源与许可，且许可必须允许再分发。
- 提交信息建议：`feat(skin): ...` / `fix(splash): ...` / `docs: ...` / `test: ...` / `chore: ...`。
- 文档与示例里不要写本机绝对路径（盘符路径），`check:public` 会检查。

## 版本

版本号在 `package.json` / `release.json` / `lib/client.js` 兜底 / `lib/splash.js` 兜底中保持一致；
`CHANGELOG.md` 按 `0.x.y — 日期` 追加。发布走标签（`v0.2.1` 起）；自 v0.2.2 起 Release 资产与仓库素材逐字节一致。
