# dsh-startup-vyron 安装与排错

## 适用范围

- Windows（桌面 `desktop` profile / `web` profile 通用）。
- 启动动画在**页面加载时**注入播放；皮肤保存在配置里，刷新即生效。
- 同一 profile **只能启用一个启动插件**（本插件与 `dsh-startup-elisa` / `dsh-startup-yomi` / `dsh-startup-moss` / `dsh-startup-screen` 互斥）。

## 安装前备份（推荐）

```powershell
$p = Join-Path $env:USERPROFILE '.dsh\profiles\desktop'
$b = Join-Path $env:USERPROFILE ('.dsh\_backups\vyron-install-' + (Get-Date -Format yyyyMMdd-HHmmss))
New-Item -ItemType Directory -Force -Path $b | Out-Null
Copy-Item -LiteralPath "$p\package.json","$p\pnpm-lock.yaml","$p\cordis.patch.yml" -Destination $b
```

## 安装（二选一）

先取仓库（`<repo>` = 仓库在你机器上的绝对路径）：

```powershell
git clone https://github.com/QIFANAI/dsh-startup-vyron.git
```

**A. 会话内交给 agent（推荐，可热应用）**

在 DSH 会话里让 agent 执行：

```text
plugin_manager install_bundle target="<repo>"
```

它会完成 pnpm 安装、`dsh.profile.bundles` 登记与行插入。返回 `application: applied` 即已生效；
若返回 `restart-required`，退出并重开 DSH。

**B. 命令行**

```powershell
dsh plugin --profile desktop add "<repo>"
dsh plugin --profile desktop list
```

确认 profile 的 `package.json` 里 `dsh.profile.bundles` 含 `dsh-startup-vyron`。

## 停用冲突的旧启动插件（必读）

```text
plugin_manager set_plugin entryId="include:dsh-startup-elisa" enabled=false
```

或临时把 `%USERPROFILE%\.dsh\dsh-startup-elisa.json` 里 `"enabled": false`、`"skin": "off"` 保存（保留可回滚）。
两套启动插件同时激活会叠加两层启动画面 / 两套皮肤。

## 首次启动

1. 安装后**完全退出 DSH（含托盘）并重开**。
2. 默认 85% 速度下墙钟 ≈ 11.5 s + 约 1.3 s 交接：0–0.76 s 信号（DSH 鱼标开幕）→ 0.76–3.65 s 终端 HUD（中央 ORBIT CORE）
   → 3.65–6.0 s 舷窗展开（地球运动）→ 6.0–8.94 s 大白鱼横越落点 → 8.94–10.59 s 字标锁版
   → 10.59–11.5 s 高闪收束成光缝 → 交接 1.2 s（黑幕从光缝展开 → UI 分区显影 → 声呐环飞入输入框 → 光带扫到顶栏）→ 主界面「星海玻璃」皮肤。
3. 任意键 / 点击 / 右上「跳过 SKIP」/ Esc 可跳过（设置里可关）。
4. 完整退出后下次打开按 `mode` 决定是否重播（`session` 默认每个浏览器会话一次）。

## 素材：公开仓库默认「降级模式」

公开仓库不含 3 张第三方壁纸底图与 Anurati 字体（原因与清单见 [ASSETS.md](ASSETS.md)）。默认安装后：

- 启动动画照常播放，`breach` / `whale` 相位使用**程序化深空渐变**代替 4K 地球底板；
- 终帧 / HUD 的 Anurati 字体回退到 `Quicksand` / `Montserrat` / `sans-serif`；
- 皮肤（四档 × 三主题）不受影响。

若你合法持有原素材（Wallpaper Engine 订阅），可在本地恢复完整观感（**仅限本机自用，不得再分发**）：

```powershell
pwsh -File scripts/prepare-local-media.ps1 -SourceDir "<含 4 个素材文件的目录>"
python scripts/build-manifest.py
npm test
```

## 验证安装是否成功

```powershell
# 1) 配置接口可用（宿主内任意已登录页面执行）
#    浏览器控制台：fetch('/dsh-vyron/config').then(r=>r.json()).then(console.log)
# 2) 插件行已激活
#    会话内：plugin_manager list_plugins，找 moduleName=dsh-startup-vyron, fiberPhase=active
# 3) 皮肤类已挂上
#    浏览器控制台：document.documentElement.className 应含 dsh-vyron-skin dsh-vyron-skin--glass
#                document.documentElement.dataset.vyronTheme === 'orbit'
#                document.getElementById('dsh-vyron-ambient') 存在
```

## 排错

- **没有启动动画**：确认 `enabled=true`；若之前已播放过，`mode=session` 会在同一浏览器会话内跳过（开新会话或把 mode 改 `always`）；`?vyron_nosplash=1` 会主动跳过；看 console 是否有 `[dsh-vyron]` warn。
- **有画面没声音**：浏览器自动播放策略可能拦截，插件静音降级并在首次点击 / 按键后从当前进度补播；Electron 桌面默认允许自动播放。确认 `sound=true`、`volume>0`、系统未静音。
- **皮肤没变化**：`skin` 是否为 `glass` / `full`；`/dsh-vyron/skin.css` 是否 200（F12 Network）；宿主升级后 CSS Modules 类名后缀变化可能让部分装饰选择器降级（配色 token 不受影响，console 会 warn）。
- **玻璃变实心**：远程桌面 / 无 GPU / 浏览器不支持 `backdrop-filter` 时自动降级为实心（预期）。
- **背景不动**：`skinMotion=false`、`reducedMotion=true`、页面在后台、或 CPU ≤ 4 线程会强制静态（预期）。
- **地球底图是深空渐变**：公开仓库不含 4K 底板（见上文「素材」）；按 [ASSETS.md](ASSETS.md) 在本地恢复即可。
- **对比度不适**：调低通透度、换 `terra` / `abyss` 主题，或切 `accent` / `off`。
- **与旧插件冲突**：按上文停用冲突插件后重启。

## 卸载 / 回滚

```text
plugin_manager remove_bundle target="dsh-startup-vyron"
```

或命令行 `dsh plugin --profile desktop remove dsh-startup-vyron`；删除配置 `%USERPROFILE%\.dsh\dsh-startup-vyron.json` 恢复默认。
回滚旧插件：按其 INSTALL 重新启用即可。

## 素材合规

第三方素材仅用于本机界面装饰，不随公开仓库发布、不得二次分发；详见 [ASSETS.md](ASSETS.md) 与 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
