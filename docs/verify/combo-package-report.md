# 独立验收报告 — 「威龙·星海鲸航启动动画+UI皮肤组合包」v0.2.1 · 终版 v2（含 P0-LINK 事故回归 + P1 修复闭环）

- **验收时间**：2026-11-04 12:41–13:05（Asia/Shanghai）；v1 首轮 12:41–12:57，P1 修复后 v2 复验 12:50–13:05
- **验收人**：verifier（独立验收，不参与构建/安装器编写）
- **验收对象（终版 v2，当前交付件）**：`<workspace>\威龙·星海鲸航启动动画+UI皮肤组合包.zip`
  - 大小 **3,439,940 B**；SHA256 **`d32d4149cd25409efce0dcb9355b179cf87453c2ada8fa91948b3c38fc19e8e5`**；生成时间 2026-11-04 12:49:18
  - **旧 v1（`a013c4e7…`，3,439,937 B）已作废**：v1 缺 P1 修复，其全部结果不作为交付基线；本报告 §0.2 记录 P1 发现→修复→复验闭环
- **口径依据**：`_pkgtest\verify\checklist.md`（A–H + P0-LINK）、Lead 2026-11-04 三次口径更新（M3 安全序列 / link: 事故回归 / P1 重打 v2）
- **环境**：Windows x64；harness pwsh 7.6.9；被检安装器/核验器以 `powershell.exe`（5.1）调用（模拟真实用户环境）；Python 3.12.14 独立重算；7z 23.x / GNU tar 1.35；node v24.21.0（测试套件复核）
- **安全边界（已遵守并验证）**：所有写操作只在本工作区 `_pkgtest\verify\` 与新临时 DSH_HOME；真实 `%USERPROFILE%\.dsh` **只读**（三次快照一致，见 §5）；link: 目标只用一次性副本；未改交付件、未改插件源码、未联网装依赖

## 0. 结论摘要

### 0.1 结论表（v2 基线）

| 分组 | 内容 | 结果 |
|---|---|---|
| A | 黑盒复演（按 zip 内 00 文档操作，含 §2.3 自动定位） | **PASS**（主路径 + 自动定位均 8/8） |
| B | 无损安装（隔离 home + 预置自定义配置） | **PASS 18/18** |
| C | 功能/无阉割（隔离 `dsh web` HTTP 探针） | **PASS 30/30**（删除 stage/zip 后复测仍 30/30） |
| D | 配置与外插件保护（含真实 home 只读前后对比） | **PASS** |
| E | 回滚（备份/卸载/核验 FAIL/还原重装） | **PASS 17/17** |
| F | 负向断言（篡改 tgz / 篡改已装文件 / 缺失文件） | **PASS 14/14**（断言非恒真） |
| G | 独立重算（Python / 7z / PS5.1 三工具互证） | **PASS 37/37** |
| H | 文档一致性（00/01 ↔ 实测/源码；含 587 测试实跑） | **PASS**（H1–H10 一致） |
| P0-LINK | 事故回归（link:→file: M3 迁移 + 受控危险序列） | **PASS 22/22**（链接目标 60/60 未变） |
| P1 闭环 | 修复后的 `-DryRun` 四形态 + 冲突插件 | **PASS 23/23**（0 剩余 P0/P1） |
| **总体判定** | **v2 终版 PASS（A–H + P0-LINK 全绿，无遗留 P0/P1/P2）** | **可交付** |

### 0.2 P1 发现→修复→复验闭环（Lead / installer-author / verifier）

| 阶段 | 内容 | 证据 |
|---|---|---|
| ① 发现（verifier，v1 验收） | v1 `install-vyron.ps1` **第 654 行** `SayC ("将暂存到   : " + $stagedTgz)` 缺颜色参数，仅「已安装 file: + `-DryRun`」分支触发 `ParameterBindingException`，exit 1（零落盘；主安装路径不受影响）。定级 **P1**，立即报 Lead，未改交付件 | `work\formal\DEFECT-P1-dryrun-repro.log`（v1） |
| ② 修复（Lead） | 该行补 `'Yellow'`；源文件 56,966 → 56,975 B（+9 B），源 SHA256 `2ad064e49bdfc67925fd8f692bc9e9162b6ee594fa805446dc50c0bfd8aeddf9` | Lead 独立实测 4 形态 DryRun **16/16 PASS**（`_pkgtest\lead-tools\dryrun-4forms-v2.log`） |
| ③ 复核（installer-author） | 修复后源文件进入 combo\tools 冻结；packager 重打 v2 | packager 复核 28/28 + 23/23 + 20/20（`_pkg\release\*.log`） |
| ④ 复验（verifier，v2 终版） | v2 包内 install（BOM 版 56,978 B，SHA `aa4d9946…`）：654 行已含 `'Yellow'`；全脚本 83 处 `SayC` 缺参扫描 = **0**；`-DryRun` 四形态（未安装 / file: 已装 / link: / orphan）+ 冲突插件 **23/23 PASS**，四形态均 exit 0、计划完整（含「8 项」「结论: DRYRUN」）、**零落盘**（内容/存在性哈希口径） | `work\formal-v2\dryrun4-result.json`（23/23）、`dryrun4-form{1..4}-*.log` |

## 1. 被检文件与哈希（v2，独立重算）

| 文件 | 大小 | SHA256 |
|---|---|---|
| **交付 zip（v2）** | 3,439,940 B | `d32d4149cd25409efce0dcb9355b179cf87453c2ada8fa91948b3c38fc19e8e5` |
| zip 内 `dsh-startup-vyron-0.2.1.tgz` | 3,399,458 B | `fe95e5023d9968bf24cd5a1fb3dd814590ba10461c435ce409344cab8d7143b8` |
| zip 内 `校验清单.sha256` | 5,616 B | `448dc3b7fc52520f258d607469254ec35b0908d4b3ad6d6702ba016ed8f43e24` |
| zip 内 `00-给DSH的安装说明.md` | 22,609 B | `56432af412dc6b38847f98cca8c9eb019d5701565fa974114b348c83afddff70` |
| zip 内 `01-使用说明与排错.md` | 11,330 B | `bbff34616f563c82154d2224e33a2827b398ae835841f7274ebe2ae57b52095a` |
| zip 内 `tools\install-vyron.ps1`（BOM 版，**已含 P1 修复**） | 56,978 B | `aa4d9946a1b34175435b90b6707684628851ac6fa01e3bc5acdd04b04c1534dc` |
| zip 内 `tools\verify-vyron.ps1`（BOM 版） | 13,677 B | `2574cdf70243ed9fec5992014bb2a14880da1441ffc6aa47669c78113da814af` |
| 工作区 `release.json`（交叉核对，不在 zip 内） | 679 B | `dd96b201b900d4b82e707e540b9cce951a365328002ead50a5eaa3cbc5f4bc4f` |

- v2 复制到无关临时目录后哈希不变；zip 条目 8 个，与规定完全一致。
- **v2 与 v1 差异**（独立核对）：仅 install 工具变化（56,969 → 56,978 B，+9 B）；其余 7 条目哈希与 v1 **完全一致**（docs / tgz / manifest / verify 逐字节相同）。
- zip 内 BOM 版 tools 与 `combo\tools\` 源文件**忽略 BOM 后逐字节一致**（install 56,975 B 源；verify 13,674 B 源）；00/01 与 combo 源**逐字节一致**。
- 限制说明：v1 zip 已被 v2 同名覆盖、未保留副本，故无法做 v1↔v2 逐字节 diff；差异口径依据 packager 冻结记录 + 我方在 v2 上的修复落点/扫描复核（654 行已含 `'Yellow'`、缺参 SayC=0、M3 关键函数与防呆全部在位）。

## 2. A. 黑盒复演（v2，只按 zip 内 00 文档操作）

方法：v2 zip 复制到 `%TEMP%\vyron-v2-20261104-125014\`（与项目无关），先通读 00 全文再按 §2.1/§2.2 操作；因禁写真实 `~\.dsh`，按文档 **§3** 的 `-DshHome/-Profile` 参数在隔离 home 执行。

| 项 | 判据 | 实测（v2） |
|---|---|---|
| A1 | 先读 00 再执行、不引用私货知识 | 已通读；执行命令均可在文档 §2/§3 找到原文依据 |
| A2 | 文档自足（定位/解压/安装/参数/退出码/找不到 zip） | **PASS**：主路径安装 **exit 0 / 验收 8/8**；**§2.3 自动定位分支**（tools 单独、zip 放 `%TEMP%` 根）→ 自动定位并解压安装 **exit 0 / 8/8** |
| A3 | 文档路径/文件名与实际 zip 一致 | **PASS**：00 §0 清单与 v2 条目（大小/文件名）逐项吻合 |
| A4 | 「安装期间 DSH 可继续运行 / 重启后生效」 | 安装期间真实 DSH 桌面版在运行、隔离安装全部成功 → 支持「可继续运行」；「重启后生效」需用户重启真实 DSH，**未验证**（用户动作） |

证据：`work\formal-v2\A-install.log`、`A2-autolocate.log`。

## 3. B. 无损安装（v2，隔离 home + 预置自定义配置）

隔离 home：`_pkgtest\verify\home-formal-v2-B`；预置 `dsh-startup-vyron.json` 自定义值（splashSpeed=66 / glassTransparency=77 / skinTheme=terra / volume=42，SHA `ac16463e…`，与真实用户值不同）。

| # | 检查 | 结果（v2） |
|---|---|---|
| B1 | install 退出码 0；自报验收 8/8 | **PASS** |
| B2 | verify exit 0、ok=true、60/60 | **PASS**（missing/mismatch/extra 均 0） |
| B3 | Python 独立复核 60/60 | **PASS**（`check-install.py`：60 文件、缺失/不一致/多余=0） |
| B4 | 版本 0.2.1；bundles 含插件；依赖 `file:`→`_packages`；安装目录真实目录（LinkType/Target 空）且在 profile node_modules 内 | **全 PASS** |
| B5 | 暂存 tgz 哈希 = `fe95e502…` | **PASS** |
| B6 | **删除解压 stage 与 zip 副本后仍完整** | **PASS**：删除 `%TEMP%\vyron-v2-…`（`exists=False`）后，全新解压的只读核验器 verify **exit 0 / 60/60 / 自包含**；启动探针 **30/30 PASS** |
| B7 | 重复执行默认跳过；`-Force` 重装 | **PASS**（跳过 exit 0、文件 60、配置未变；-Force exit 0 + 复验 60/60） |
| B8 | 用户配置全程未改 | **PASS**（全程 SHA `ac16463e…`） |

证据：`work\formal-v2\B-result.json`（18/18）、`B-independent-install-check.json`、`B6-verify-after-delete.log`。

## 4. C. 功能性/无阉割（v2，隔离 DSH_HOME 真机启动）

- **30/30 PASS**（两次：安装后 `C-probe`、删除 stage/zip 后 `C-probe-after-delete`），启动 3683ms
- 首页注入 6 项：`__DSH_VYRON_VERSION__`=0.2.1、`__DSH_VYRON__`、`__DSH_VYRON_BOOT__`、`#dsh-vyron-root`、`/dsh-vyron/splash.js`、critical CSS
- `/dsh-vyron/config`：200 JSON、version=0.2.1、config 11 键、`file` 指向隔离 home；**与预置自定义配置逐键一致**
- **字节级无阉割**：splash.css 5,717 B｜splash.js 23,033 B｜skin.css 116,692 B｜lib/audio.js 18,206 B｜preview/index.html 8,780 B｜preview/css/splash.css 28,461 B｜vyron-boot.wav 1,834,604 B（RIFF/WAVE）｜hero-4k.webp 554,658 B｜Quicksand-Bold.otf 29,324 B —— HTTP 返回 SHA256 与安装文件逐一致
- Range `bytes=0-99` → **206** + 正确 `Content-Range`；未知 `/dsh-vyron` 路由 → **404**（反向断言）
- 日志：skippedBundles 不含本插件、加载错误 0、整体错误关键词 0；启动前后用户配置哈希不变

证据：`work\formal-v2\C-probe\probe-result.json`、`C-probe-after-delete\probe-result.json`。

## 5. D. 配置与外插件保护（v2）

| 项 | 结果 |
|---|---|
| D1 配置装前/装后/重装/探针后哈希不变 | **PASS**（`ac16463e…` 全程一致） |
| D2 其它依赖/bundles 不受影响 | **PASS**（-Force 前后其它 bundles `[@deepseek-ai/dsh-base, @deepseek-ai/dsh-web-app]` 一致；无其它依赖，属预期并如实记录） |
| D3 启动后 config 与预置值一致 | **PASS** |
| D4 **真实 `~\.dsh` 只读快照前后一致** | **PASS**：v2 验收后再取第三次快照 `logs\realhome-after-v2.json` 与基线 `realhome-before.json` **全字段一致**（用户配置 SHA `c6bec607…`、splashSpeed=70/glassTransparency=80/skinTheme=abyss 原样、elisa enabled=false、desktop profile package.json SHA `d806a3fe…`、依赖/bundles、link: 安装形态均未变） |
| D5 真实 profile 未被写 | 全验收过程未对真实 profile 执行任何 remove/add/删除；其 `link:` 形态将由用户运行正式安装器按 M3 迁移 |

> 风险提示：真实 profile 的 Junction 仍指向工作区；在其正式迁移前，任何人对其执行「remove 后直接 add」或递归删除仍可能重演 12:20 事故（本验收全程未碰）。

## 6. E. 回滚（v2）

E1 备份存在且含三件配置 + 用户配置 + 已装目录副本（`home-formal-v2-B\_backups\vyron-install-20261104-125329`）；E2 file: 直接 remove exit 0、目录消失、依赖移除、配置未动；E3 remove 后 verify exit 1（ok=false）；E4 备份还原 + 重装 exit 0、verify 60/60、状态恢复。**17/17 PASS**。证据：`work\formal-v2\DE-result.json`。

## 7. F. 反向断言（v2，证明断言非恒真）

| 用例 | 实测（v2） |
|---|---|
| F0 基线干净安装+核验 | PASS（install 0 / verify 0） |
| F1 篡改 tgz 单字节（大小不变） | install **exit 2**、无安装目录、依赖未写入（SHA `fe95e502…→3068f30b…`） |
| F2 篡改已安装文件（splash.js 中部翻字节） | verify **exit 1**，`mismatch=['lib/splash.js']` |
| F3 恢复后 | verify 回 **exit 0** |
| F4 删除 `locale/en.json` | verify **exit 1**，`missing=['locale/en.json']`；恢复后 exit 0 |

**14/14 PASS**。证据：`work\formal-v2\F-negative\negative-result.json`。

## 8. G. 独立重算（v2）

| # | 检查 | 结果（v2） |
|---|---|---|
| G1 | zip 条目恰 8 个且与规定一致 | **PASS** |
| G2 | UTF-8 文件名（中文/`·`/`+`/空格） | **PASS**（PS5.1 `ZipFile.ExtractToDirectory(...,UTF8)` 解出 6 文件 / 3,509,668 B，名称正确） |
| G3 | zip 内 tgz 哈希/大小 == 清单头 == release.json | **PASS**（三方 `fe95e502…` / 3,399,458 / 60） |
| G4 | tgz 内 60 文件逐文件 SHA256 == 清单 | **PASS**（缺失/不一致/多余 = 0） |
| G5 | tools 为 UTF-8 BOM | **PASS**（两文件前 3 字节 `efbbbf`） |
| G6 | 7z `t` + PS5.1 解压复核 | **PASS**（7z：`Everything is Ok`，Folders 2 / Files 6 / Size 3,509,668；PS5.1：6 文件 3,509,668 B） |
| G7 | release.json 交叉核对 | **PASS**（name/version/asset/size/sha256/fileCount=60/mediaIncluded=true） |

**37/37 PASS**。证据：`work\formal-v2\G-result-v2.json`；`check-package.py` 自测 7/7（非恒真）。

## 9. H. 文档一致性（v2）

| # | 检查 | 结果 |
|---|---|---|
| H1 | 版本/tgz 名/SHA256/大小/60 文件数与实测一致 | **PASS**（00/01 中 `0.2.1`、tgz 名、`fe95e502…`、`3,399,458 B`、`60/60` 全部一致；无冲突数字；9 字体/5 SVG/2 音轨/7 份文档 与 tgz 清单吻合；**「六套共 587 条测试」实跑复核 = 587 PASS / 0 FAIL**） |
| H2 | 退出码语义 0/1/2 | **PASS**（实测 install 成功 0、篡改 2、verify FAIL 1；源码语义与 00 §2.2 一致） |
| H3 | 00 工序（6 步 / 8 项验收）与实现 | **PASS**（输出 `[1/6]…[6/6]`、`结论: PASS（验收 8/8）`；源码第 6 步逐项实现 8 项） |
| H4 | **M3 口径**一致、无危险序列路径 | **PASS**（`Invoke-SafeUnlink` = `cmd /c rmdir` 只删链接本身；任何 remove/add 前 `Assert-NoReparseBeforeMutation`；解链前后 `Get-DirFingerprint`/`Compare-Fingerprint` 哈希+顶层条目快照，变化即中止；add 前 orphan 二次清除/中止；全源码无 link 状态直接 remove→add 路径；P0 动态实测通过） |
| H5 | 00 §6「手误序列」失败处理 | **PASS**（与安装器 orphan 检测 + M3 安全序列 + 快照守卫语义一致） |
| H6 | 00 §7 回滚口径 | **PASS**（E2 实测 file: 直接 remove 安全；§7 手动序列与 M3 同序；文档「校验目标文件数」弱于脚本「哈希+顶层条目」，无冲突） |
| H7 | 00 §8 红线与脚本行为 | **PASS**（两条红线均有对应代码防呆） |
| H8 | 01 配置键/默认值/档位/快捷键/预览 | **PASS**：01 表格 11 键默认值与 `lib/index.js` `DEFAULTS` 逐项一致；ENUMS/NUMBERS 一致；Ctrl+Alt+V 在 client.js/splash.js/测试中存在；预览方式与源码一致 |
| H9 | 「安装期间 DSH 可继续运行 / 重启后生效」 | **部分验证**：前半句有实测支持（真实 DSH 运行中安装成功）；「重启后生效」未验证（需用户重启真实 DSH） |
| H10 | 01「已知限制与未验证项」照实保留 | **PASS**（6 条未验证项保留、未夸大） |

**追加质量证据**：在 v2 安装产物副本上实跑六套冒烟测试：**HOST 132 + SPLASH 134 + CLIENT 62 + AUDIO 77 + ASSETS 60 + PREVIEW 122 = 587 PASS / 0 FAIL**（六套 exit 0）。证据：`work\formal-v2\test-smoke-*.mjs.log`。

**文档/行为不一致**：v2 未发现（H2–H8 与实测一致；v1 的 P1 已在 v2 关闭）。

## 10. P0-LINK. 事故回归（v2）

一次性副本 / 隔离 home：`link-source-v2\package`（60 文件 / 4,302,551 B）→ `home-link-v2`。

| # | 检查 | 结果（v2） |
|---|---|---|
| L1 | 副本 60 文件 SHA256 基线 | **PASS** |
| L2 | link: 安装（依赖 `link:`、node_modules 为 Junction→副本） | **PASS** |
| L3 | **★迁移后链接目标副本 60/60 哈希与文件数完全未变** | **PASS**（60→60 文件；4,302,551→4,302,551 B；缺失/不一致/多余 0） |
| L4 | 迁移结果：依赖 `file:`、安装目录 LinkType/Target 空、内容 60/60 | **PASS** |
| L5 | 安装器源码静态审阅（重解析点检测 + 快照守卫在 remove/add 前；无危险序列路径） | **PASS**（M3 关键段在 v2 中全部在位：`[M3-2]`/`[M3-3]` 各 2 行、`Invoke-SafeUnlink` 3 行、`Assert-NoReparseBeforeMutation` 3 行、`Get-DirFingerprint` 4 行、`Compare-Fingerprint` 2 行、`ORPHAN` 6 行） |
| L6 | 受控负向实验（另一一次性副本） | **复现成立**：`remove` 后副本 60 文件未变、orphan Junction 残留；直接 `add` 后副本被清空（60 文件/4,302,551 B → 0 文件/0 B）→ M3 必要性证据 |
| L7 | 备份安全：link: 场景不递归跟随链接目标 | **PASS**（备份仅 **7 文件 / 16,269 B** 元数据；未复制 4.3MB 目标内容） |
| L8 | 结束态无 link:/orphan，安装目录真实目录 | **PASS**（verify 60/60、依赖 file:、LinkType 空） |
| L9 | 真实 desktop profile 只读记录 + 迁移方案一致 | **PASS**（只读记录；未触碰） |

**22/22 PASS**。证据：`work\formal-v2\P0-link\link-migration-result.json`。

## 11. 缺陷清单（v2）

### P0
**无。**

### P1
**无**（v1 的 P1-1 已在 v2 修复并由本验收闭环验证；详见 §0.2）。

### P2
**无。**

观察项（非缺陷，不计入）：`dsh plugin list` 会在 profile `.plugin-manager\logs\` 留操作日志；安装文件为 pnpm store 硬链接（`fsutil hardlink list` 证实与 store 及其他 home 共享 inode），其 mtime 可能被**其他并发会话的 pnpm 操作**触碰——因此 DryRun「零落盘」断言以**内容/存在性哈希**为准（本报告口径），不是 mtime；受控最小复现中内容差异 = 0。

## 12. 还原与清理

| 项 | 状态 |
|---|---|
| 真实 `~\.dsh` | **未被改动**（三次只读快照全字段一致）；全程未执行任何写操作 |
| 真实 desktop profile 的 link: 形态 | 保持原样（未迁移、未 remove） |
| 交付件 zip | v2 未修改（验收前后哈希一致 `d32d4149…`） |
| 临时解压 stage / zip 副本 | v2 的已按 B6 要求删除；删除后 verify 60/60 + 探针 30/30 证明自包含 |
| 隔离 home / 一次性副本 | v2 证据保留（`home-formal-v2-B`、`home-link-v2`、`link-source-v2`、`work\formal-v2`）；v1 作废 home 已清理 |
| 工作区敏感目录 | 未删素材/`_handoff`/`_shots`/`_extract-b`；未改插件源码 |

## 13. 尚未验证项（明确声明，不得视为 PASS）

| # | 未验证项 | 原因 |
|---|---|---|
| U1 | 真实 desktop profile 实机安装/迁移 | 禁写真实 `~\.dsh`；隔离环境无法初始化 desktop profile 模板 → 用 `web` profile 全流程等价验证 + 真实 profile 只读基线；desktop 分支端到端未实测 |
| U2 | 装完重启真实 DSH 后的实际启动动画/皮肤 | 需重启用户当前 DSH（会中断本会话），属用户动作；隔离侧已用 HTTP 探针证明注入/路由/资源全就绪 |
| U3 | 真实开机观感/听感、真实 GPU 帧率、4K-2xDPR、reduced-transparency | 01 §7 已声明未验证；属用户主观/真机项 |
| U4 | install 的「验收 FAIL → exit 1」路径 | 仅源码审阅（末尾 exit 1 + 回滚配置逻辑）；未人为构造安装期 FAIL（篡改 tgz 命中前置拒绝 exit 2，属不同路径） |
| U5 | desktop profile 未初始化时 exit 2 提示 | 仅源码审阅；隔离环境无法构造 desktop profile |
| U6 | 安装期间 EBUSY/EPERM 提示路径 | 未构造文件占用场景（安装全部一次成功） |
| U7 | v1↔v2 逐字节 diff | v1 zip 已被同名覆盖；差异依据 packager 冻结记录 + v2 侧落点/扫描复核 |

## 14. 复验命令（v2 基线，可重复执行）

```powershell
# 0) 隔离 home（写操作只在 _pkgtest\verify\）
pwsh -NoProfile -File _pkgtest\verify\tools\setup-home.ps1 -DshHome _pkgtest\verify\home-formal-v2-B -Recreate -NoPlugin -PresetConfigPath _pkgtest\verify\work\formal-v2\preset-config.json
# 1) 无损安装 + 核验（v2 zip 解压后的 BOM 版 tools）
powershell -NoProfile -ExecutionPolicy Bypass -File "<v2 解压>\tools\install-vyron.ps1" -DshHome <workspace>\_pkgtest\verify\home-formal-v2-B -Profile web
powershell -NoProfile -ExecutionPolicy Bypass -File "<v2 解压>\tools\verify-vyron.ps1" -DshHome <workspace>\_pkgtest\verify\home-formal-v2-B -Profile web -Json
# 2) P1 四形态 DryRun（未安装/file: 已装/link:/orphan）预期均 exit 0、计划完整、零落盘
pwsh -NoProfile -File _pkgtest\verify\work\formal-v2\run-dryrun4.ps1
# 3) 功能探针 / 负向 / 独立重算 / P0 迁移
pwsh -NoProfile -File _pkgtest\verify\tools\probe-web.ps1 -DshHome ... -ExpectConfigPath ...
pwsh -NoProfile -File _pkgtest\verify\tools\negative-cases.ps1 -PkgRoot "<v2 解压>" -DshHome ... -WorkDir ...
python _pkgtest\verify\tools\check-package.py --zip "<v2 zip>" --release-json dsh-startup-vyron\release.json
pwsh -NoProfile -File _pkgtest\verify\tools\link-migration.ps1 -PkgRoot "<v2 解压>" -TgzPath "<…tgz>" -ReproRemoveOnLink
```

## 15. 证据索引（v2）

| 内容 | 路径（`<workspace>\` 下） |
|---|---|
| 证据汇总（全部哈希/分组结果） | `_pkgtest\verify\work\formal-v2\evidence-summary.json` |
| A 黑盒日志（主路径 + 自动定位） | `_pkgtest\verify\work\formal-v2\A-install.log`、`A2-autolocate.log` |
| B 无损安装 18/18 + 幂等/-Force | `_pkgtest\verify\work\formal-v2\B-result.json`、`B-*.log`、`B-independent-install-check.json` |
| P1 闭环（DryRun 4 形态 + 冲突）23/23 | `_pkgtest\verify\work\formal-v2\dryrun4-result.json`、`dryrun4-form{1..4}-*.log` |
| C 探针 30/30 ×2 | `_pkgtest\verify\work\formal-v2\C-probe\probe-result.json`、`C-probe-after-delete\probe-result.json` |
| D2+E 17/17 | `_pkgtest\verify\work\formal-v2\DE-result.json` |
| F 负向 14/14 | `_pkgtest\verify\work\formal-v2\F-negative\negative-result.json` |
| G 独立重算 37/37 | `_pkgtest\verify\work\formal-v2\G-result-v2.json` |
| P0-LINK 22/22 + 受控复现 | `_pkgtest\verify\work\formal-v2\P0-link\link-migration-result.json` |
| 587 测试复核 | `_pkgtest\verify\work\formal-v2\test-smoke-*.mjs.log` |
| 真实 home 只读快照（3 次） | `_pkgtest\verify\logs\realhome-before.json`、`realhome-after.json`、`realhome-after-v2.json` |
| v1 作废证据（含 P1 发现日志） | `_pkgtest\verify\work\formal\`（标注 v1，不作交付基线） |

---

**验收结论（v2 终版）**：按 `checklist.md` 的 A–H + P0-LINK 全部实测通过——无损安装、无阉割、自包含、可回滚、负向断言非恒真、独立重算一致、文档与实现一致、M3 事故回归通过（链接目标 60/60 未变、备份不跟随）；**v1 的 P1 已修复并经本验收闭环（DryRun 四形态 23/23 PASS）**；**无遗留 P0/P1/P2**。v2 终版 **PASS**，建议交付。尚未验证项见 §13（均为用户动作/真机主观项或环境受限项，不构成本次交付阻断）。
