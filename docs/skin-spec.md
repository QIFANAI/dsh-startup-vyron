# VYRON · 星海鲸航 — UI 皮肤规格（skin-spec）

> 交付物：`lib/skin.css`（单文件、自包含）+ 本规格。
> Owner：skin-glass｜设计权威源：`docs/design-spec.md` §2.1 调色板 / §4 皮肤规格 / §7 契约。
> 生成时间：2026-11-03｜`lib/skin.css` 依据：`v0.2.0` **116692 bytes / 2376 行**（v0.1.0 为 101258 bytes / 2108 行；含 2026-11-03 verifier 验收的 static 伪元素补覆盖）。
> 宿主版本：`@deepseek-ai/dsh-web-frontend` 0.2.1-rc.5（与 elisa 同代），宿主事实从 `<DSH_INSTALL>\resources\app.asar` 提取核对 + 隔离实例真机 DOM 实测。
> 本轮（v0.2.0）重点：**呼吸感明显化 + composer 彗尾流光 + `.vyron-enter` 分区显影 + reduce 档"减动态"口径**（详见 §6 / §7 / §7.5 / §8.1 / §10.8 / §12.1 / §14）。

## 0. 一句话

把 Material A 的「CMD\LN 终端 HUD」语言移植成 DSH 主界面皮肤：**深空底 + 云白字 + DSH 蓝强调**，四档（off/accent/full/glass）× 三主题（orbit/terra/abyss）＋ 浅色宿主昼面套；glass 档是 12 层纯 CSS 星海背景 + 整窗毛玻璃 + 可调通透度。

## 1. 档位 / 主题 / 宿主矩阵

| 档位 | 装饰层 | 动态星海背景 | 毛玻璃 | 主题生效 | 说明 |
|---|---|---|---|---|---|
| `off` | ✗ | ✗ | ✗ | ✗ | 原版宿主；html 无 `dsh-vyron-skin` → 本文件零命中 |
| `accent` | ✗ | ✗ | ✗ | ✓ | 只覆盖设计 token（113 alias/specific + 50 个 static 色阶重映射），无任何新增层 |
| `full` | ✓ | ✗ | ✗ | ✓ | accent + 顶栏日轨/ledger、四角角标、侧栏 micrographics、声呐环 |
| `glass` | ✓ | ✓ | ✓ | ✓ | full + 12 层星海背景 + `#root` 单层毛玻璃 + 通透度可调 |

主题在明暗两套宿主下都成立：

| 主题 | 底（暗面） | 高光 | 强调（business/link/rim） | 品牌锚点 `--v-brand` | 浅色宿主昼面 |
|---|---|---|---|---|---|
| `orbit`（默认） | `#050a16` 太空深蓝 | 大气青蓝 `#57a8ff` | DSH 蓝阶（business `#6f9bff` / link `#7aaaff`） | `#4d6bfe` | 冷蓝白 `#eef4fb` |
| `terra` | `#070d16` 地球蓝 + 沙金 | 云暖白 `#f1e6d2` | DSH 蓝阶（business `#7fa4ff` / link `#8bb5ff`） | `#4d6bfe` | 暖白 `#fbf5ec` + 沙金 |
| `abyss` | `#02040a` 近黑 | 生物光青 `#46d3e0` | 青蓝阶（business/rim `#46d3e0` / link `#6fe0ff`） | `#4d6bfe`（品牌锚点不随主题改） | 冷青白 `#eef7f5` |

> 说明：`accent/full` 的主题属性当前由 client.js 只在 glass 档写入（见 §11 未验证项）；本 CSS 对 `html[data-vyron-theme]` 的选择器在属性存在时即生效，client.js 补写后自动启用，无需改 CSS。

## 2. class / 属性 / 变量契约（client.js ↔ skin.css）

| 契约项 | 注入方式 | 本 CSS 读取方式 |
|---|---|---|
| 作用域根 | `html.classList.add('dsh-vyron-skin')` | 全部规则以 `html.dsh-vyron-skin` 开头 |
| 档位 | `--accent` / `--full` / `--glass` class | `:is(.dsh-vyron-skin--full, .dsh-vyron-skin--glass)` = full 及以上 |
| 主题 | `html[data-vyron-theme="orbit|terra|abyss"]` | §4 主题变量覆盖 |
| 降级 | `--static` / `--paused` / `--noblur` | §8 降级路径 |
| 通透度 | html 行内 `--vyron-glass-t`（原始 0–100）+ `--vyron-glass-alpha`（归一化 0.55–1.45）；CSS 侧优先读契约别名 `--vyron-glass-a` | `--vyron-a: var(--vyron-glass-a, calc(1.45 - 0.009 * var(--vyron-glass-t, 50)))` |
| 星海背景 | body 首子节点 `div#dsh-vyron-ambient`，12 个子层：`va-base / va-stars / va-earth / va-cloud.va-c1..c4 / va-sea / va-sheen / va-grain / va-vignette / va-rim` | 选择器同时兼容 `va-c1..c4` 与当前 client 的 `vc1..vc4` 两种类名 |
| 交接显影 | `html.classList.add('vyron-enter')`（splash.js：done+~300ms 加、~1300ms 移除） | §7.5 分区显影：ambient 900ms 淡入 + sidebar/topbar/composer 分时显影（全部 ≤900ms，fill both） |
| 明暗宿主 | 宿主 `<body data-ds-dark-theme>`（浅色=无属性） | 浅色套用 `body:not([data-ds-dark-theme])`（特异性 0,2,2 > 深色基座 0,1,2） |

## 3. 设计调色板（design-spec §2.1 锁定值）

| token | 值 | 用途 |
|---|---|---|
| `--v-space` | `#050a16` | 太空底 / 皮肤底（`--dsw-alias-bg-base`） |
| `--v-space-2` | `#0a1424` | 深空层 / 面板基色（`bg-layer-1`） |
| `--v-ocean` | `#1d4f8c` | 地球海 / 主蓝 |
| `--v-rim` | `#57a8ff` | 大气边缘 / 焦点环 / 装饰边缘光 |
| `--v-cloud` | `#eef2f6` | 云白 / 深色宿主主文字 |
| `--v-cream` | `#f1e6d2` | 云暖 / 高光文字、声呐环白热弧 |
| `--v-sand` | `#c9a46a` | 沙漠暖 / 次强调（terra 主题放大） |
| `--v-steel` | `#8b9aab` | 平台钢 / 次级文字、装饰标签 |
| `--v-brand` | `#4d6bfe` | DSH 蓝 / 品牌锚点（按钮、选中、brand-primary-new）；三主题不变 |
| `--v-ink-1/2/3` | `#e8e9ea / #a3a6aa / #85888c` | 终端灰阶（Material A 原值，装饰用） |
| `--v-bio` | `#7ef0d4` | 生物光青 / 扫描线、当前项、声呐副弧、success 点缀 |

## 4. Token 映射（宿主 113 层全覆盖）

宿主 `ui-theme` 把 **77 个 `--dsw-static-*` 色阶** 与 **113 个 `--dsw-alias-*` + `--dsw-specific-*` + `--dsw-menu-*` 语义 token** 声明在 `body` / `body[data-ds-dark-theme]` 上。本皮肤：

1. 每个 alias 都映射到主题变量 `var(--vy-*)`（深色）/ `var(--vy-l-*)`（浅色），主题只改这层变量 → 不会出现"主题把玻璃覆盖回实色"；
2. 覆盖点同时落在 `html` 与 `body`（`html.dsh-vyron-skin body` 特异性 0,1,2 高于宿主 `body[data-ds-dark-theme]` 的 0,1,1）；
3. 深色静态色阶（bluish/neutral/deepseek/blue 共 50 项）单独重映射，让少数直接消费 static token 的组件同色相；语义色阶（red/green/amber）保持宿主原值。

### 4.1 逐 token 映射表（深色 / 浅色 / 玻璃档）

> 下表「深色 / 浅色」列均为 **orbit 主题缺省值**；`terra` / `abyss` 只重定义 §5 列出的主题变量（表面/文字/强调/背景光色），token 表达式不变，故不重复 113 行。


#### 表面 / 容器

| 宿主 token | 深色宿主（暗面） | 浅色宿主（昼面） | 玻璃档（暗面） |
|---|---|---|---|
| `--dsw-alias-bg-base` | #050a16 | #eef4fb | rgba(var(--vy-g-base), calc(max(0.3, 0.42 *... |
| `--dsw-alias-bg-document-preview` | #03060e | #f6fafd | rgba(var(--vy-g-doc), calc(max(0.34, 0.5 * ... |
| `--dsw-alias-bg-document-selection` | rgba(77, 107, 254, 0.34) | rgba(59, 85, 217, 0.18) | rgba(77, 107, 254, calc(0.38 * var(--vyron-... |
| `--dsw-alias-label-document-preview` | #c7d4e3 | #3a4f68 | 沿用深色值 |
| `--dsw-alias-bg-layer-1` | #0a1424 | #ffffff | rgba(var(--vy-g-l1), calc(max(0.34, 0.52 * ... |
| `--dsw-alias-bg-layer-2` | #0e1a2e | #ffffff | rgba(var(--vy-g-l2), calc(max(0.42, 0.62 * ... |
| `--dsw-alias-bg-layer-3` | #13233c | #f6fafd | rgba(var(--vy-g-l3), calc(max(0.48, 0.7 * v... |
| `--dsw-alias-bg-module-platform` | #0b1728 | #f4f8fd | rgba(var(--vy-g-platform), calc(max(0.4, 0.... |
| `--dsw-alias-bg-multi-select` | #16263e | #eaf1f9 | rgba(var(--vy-g-multi), calc(max(0.42, 0.62... |
| `--dsw-alias-bg-overlay` | #1a2c47 | #e2ebf6 | rgba(var(--vy-g-overlay), calc(max(0.5, 0.7... |
| `--dsw-alias-bg-skeleton` | rgba(238, 242, 246, 0.06) | rgba(10, 22, 40, 0.08) | 沿用深色值 |
| `--dsw-alias-bg-mask-1` | rgba(0, 0, 0, 0.55) | rgba(8, 16, 30, 0.42) | rgba(var(--vy-g-mask), calc(0.55 * var(--vy... |
| `--dsw-alias-bg-mask-2` | rgba(0, 0, 0, 0.30) | rgba(8, 16, 30, 0.22) | rgba(var(--vy-g-mask), calc(0.30 * var(--vy... |
| `--dsw-alias-bg-mask-3` | rgba(0, 0, 0, 0.65) | rgba(8, 16, 30, 0.56) | rgba(var(--vy-g-mask), calc(0.65 * var(--vy... |
| `--dsw-alias-bg-mask-photo` | rgba(0, 0, 0, 0.90) | rgba(8, 16, 30, 0.88) | 沿用深色值 |
| `--dsw-alias-bg-mask-drop` | rgba(16, 27, 45, 0.72) | rgba(255, 255, 255, 0.78) | rgba(var(--vy-g-menu), calc(max(0.62, 0.86 ... |
| `--dsw-specific-sidebar-fill` | #040911 | #e7eff8 | rgba(var(--vy-g-sidebar), calc(max(0.3, 0.5... |
| `--dsw-specific-input-major` | #0b1626 | #ffffff | rgba(var(--vy-g-input), calc(max(0.36, 0.62... |
| `--dsw-specific-bubble` | #0d1a2c | #eaf2fb | rgba(var(--vy-g-bubble), calc(max(0.34, 0.5... |
| `--dsw-specific-bubble-highlight` | #16283f | #dce8f6 | rgba(var(--vy-g-bubble-hi), calc(max(0.4, 0... |
| `--dsw-specific-menu` | var(--dsw-menu-surface-fill) | var(--dsw-menu-surface-fill) | 随 menu-surface-fill 半透 |
| `--dsw-specific-selector` | #16283f | #dce8f6 | rgba(var(--vy-g-selector), calc(max(0.42, 0... |
| `--dsw-specific-tip` | #16283f | #eaf1f9 | rgba(var(--vy-g-tip), calc(max(0.46, 0.66 *... |
| `--dsw-specific-login-input` | #070e1b | #ffffff | rgba(var(--vy-g-login), calc(max(0.5, 0.7 *... |
| `--dsw-specific-sidebar-nav-item-active` | #132640 | #dbe8f7 | rgba(var(--vy-g-nav-active), calc(max(0.4, ... |
| `--dsw-specific-sidebar-nav-item-active-accent` | #1b3352 | #cfe0f6 | rgba(var(--vy-g-nav-accent), calc(max(0.42,... |
| `--dsw-specific-sidebar-nav-item-hover` | #101f33 | #e8f0fa | rgba(var(--vy-g-nav-hover), calc(max(0.34, ... |
| `--dsw-menu-surface-fill` | rgba(var(--vy-menu), var(--vy-menu-alpha)) | rgba(var(--vy-l-menu), var(--vy-l-menu-alpha)) | rgba(var(--vy-g-menu), calc(max(0.62, 0.78 ... |
| `--dsw-alias-menu-group-header-fill` | rgba(12, 23, 41, 0.95) | rgba(255, 255, 255, 0.96) | rgba(var(--vy-g-menu-group), calc(max(0.72,... |

#### 文字

| 宿主 token | 深色宿主（暗面） | 浅色宿主（昼面） | 玻璃档（暗面） |
|---|---|---|---|
| `--dsw-alias-label-primary` | #eef2f6 | #0a1628 | #eef2f6 |
| `--dsw-alias-label-primary-bluish` | #eaf2ff | #102a52 | 沿用深色值 |
| `--dsw-alias-label-primary-dimmed` | #dbe4ee | #22344d | #dbe4ee |
| `--dsw-alias-label-primary-foreground` | #050a16 | #f7fbff | 沿用深色值 |
| `--dsw-alias-label-primary-inverted` | #16243a | #ffffff | 沿用深色值 |
| `--dsw-alias-label-secondary` | #b3c1d1 | #33465c | #cfdbe8 |
| `--dsw-alias-label-tertiary` | #93a3b6 | #465a72 | #b0c0d3 |
| `--dsw-alias-label-caption` | #8496ab | #566b84 | #a3b6ca |
| `--dsw-alias-label-dimmed` | #3f4f63 | #b9c9da | 沿用深色值 |
| `--dsw-alias-label-shimmer` | color-mix(in srgb, #ffffff 42%, transparent) | rgba(10, 22, 40, 0.28) | 沿用深色值 |
| `--dsw-alias-label-deep-diving` | color-mix(in srgb, #4d6bfe 55%, #8b9aab) | color-mix(in srgb, var(--vy-l-brand) 62%, #... | 沿用深色值 |
| `--dsw-alias-label-deep-diving-shimmer` | color-mix(in srgb, var(--vy-rim) 65%, var(-... | color-mix(in srgb, var(--vy-l-brand) 45%, #... | 沿用深色值 |
| `--dsw-alias-menu-icon` | #dbe4ee | #22344d | 沿用深色值 |

#### 品牌 / 按钮

| 宿主 token | 深色宿主（暗面） | 浅色宿主（昼面） | 玻璃档（暗面） |
|---|---|---|---|
| `--dsw-alias-brand-primary` | #eef2f6 | #0a1628 | 沿用深色值 |
| `--dsw-alias-brand-primary-invert` | #050a16 | #0a1628 | 沿用深色值 |
| `--dsw-alias-brand-primary-new-colorprimary-new-color` | #4d6bfe | #3b55d9 | 沿用深色值 |
| `--dsw-alias-brand-text` | #eef2f6 | #0a1628 | 沿用深色值 |
| `--dsw-alias-button-contrast-fill` | #eef2f6 | #0a1628 | 沿用深色值 |
| `--dsw-alias-button-primary-fill` | #eef2f6 | #0a1628 | 沿用深色值 |
| `--dsw-alias-button-primary-hover` | #d7e1ec | #22344d | 沿用深色值 |
| `--dsw-alias-button-primary-dimmed` | #26364a | #b9c9da | 沿用深色值 |
| `--dsw-alias-button-info-fill` | #4d6bfe | #3b55d9 | 沿用深色值 |
| `--dsw-alias-button-info-hover` | color-mix(in srgb, var(--vy-brand) 82%, #ff... | color-mix(in srgb, var(--vy-l-brand) 84%, #... | 沿用深色值 |
| `--dsw-alias-button-floating-fill` | #0c1729 | #ffffff | rgba(var(--vy-g-card), calc(max(0.4, 0.62 *... |
| `--dsw-alias-button-floating-hover` | #101f33 | #e8f0fa | 沿用深色值 |
| `--dsw-alias-button-elevated-fill` | #13233c | #ffffff | rgba(var(--vy-g-l3), calc(max(0.48, 0.66 * ... |
| `--dsw-alias-button-ghost-active-fill` | #132640 | #f6fafd | 沿用深色值 |
| `--dsw-alias-button-ghost-active-hover` | #1b3352 | #eaf1f9 | 沿用深色值 |
| `--dsw-alias-button-ghost-active-border` | #3f5a7a | #8ba3bf | 沿用深色值 |
| `--dsw-alias-button-tool-bar-fill` | rgba(90, 120, 160, 0.32) | rgba(29, 79, 140, 0.14) | 沿用深色值 |
| `--dsw-alias-button-tool-bar-fill-invisible` | rgba(4, 9, 17, 0.42) | rgba(255, 255, 255, 0.5) | 沿用深色值 |
| `--dsw-alias-button-tool-bar-hover` | rgba(90, 120, 160, 0.48) | rgba(29, 79, 140, 0.22) | 沿用深色值 |

#### 交互 / 描边

| 宿主 token | 深色宿主（暗面） | 浅色宿主（昼面） | 玻璃档（暗面） |
|---|---|---|---|
| `--dsw-alias-interactive-bg-hover` | rgba(87, 168, 255, 0.08) | rgba(29, 79, 140, 0.07) | 沿用深色值 |
| `--dsw-alias-interactive-bg-hover-solid` | #13233a | #e3edf8 | rgba(var(--vy-g-nav-active), calc(max(0.4, ... |
| `--dsw-alias-interactive-bg-active` | rgba(87, 168, 255, 0.14) | rgba(29, 79, 140, 0.12) | 沿用深色值 |
| `--dsw-alias-interactive-bg-hover-accent` | rgba(77, 107, 254, 0.22) | rgba(59, 85, 217, 0.16) | 沿用深色值 |
| `--dsw-alias-interactive-bg-hover-danger` | rgba(242, 90, 90, 0.16) | rgba(198, 40, 40, 0.09) | 沿用深色值 |
| `--dsw-alias-switch-thumb` | #b3c1d1 | #6f849c | 沿用深色值 |
| `--dsw-alias-turn-trigger-bg` | rgba(87, 168, 255, 0.08) | rgba(29, 79, 140, 0.07) | 沿用深色值 |
| `--dsw-alias-turn-trigger-bg-hover` | rgba(87, 168, 255, 0.14) | rgba(29, 79, 140, 0.12) | 沿用深色值 |
| `--dsw-alias-border-l1` | rgba(238, 242, 246, 0.06) | rgba(10, 22, 40, 0.08) | 沿用深色值 |
| `--dsw-alias-border-l2` | rgba(238, 242, 246, 0.11) | rgba(10, 22, 40, 0.13) | 沿用深色值 |
| `--dsw-alias-border-l3` | rgba(238, 242, 246, 0.17) | rgba(10, 22, 40, 0.19) | 沿用深色值 |
| `--dsw-alias-border-l4` | rgba(238, 242, 246, 0.25) | rgba(10, 22, 40, 0.27) | 沿用深色值 |
| `--dsw-alias-border-l2-darkmode-thin` | rgba(238, 242, 246, 0.06) | rgba(10, 22, 40, 0.08) | 沿用深色值 |
| `--dsw-alias-border-inverted` | transparent | transparent | 沿用深色值 |
| `--dsw-alias-border-inverted2` | transparent | transparent | 沿用深色值 |

#### 语义状态

| 宿主 token | 深色宿主（暗面） | 浅色宿主（昼面） | 玻璃档（暗面） |
|---|---|---|---|
| `--dsw-alias-state-business-primary` | #6f9bff | #2f4fd6 | 沿用深色值 |
| `--dsw-alias-state-business-tertiary` | #14294a | #dbe7fb | 沿用深色值 |
| `--dsw-alias-state-success-primary` | #34d399 | #0a7a53 | 沿用深色值 |
| `--dsw-alias-state-success-secondary` | #7ef0d4 | #0f8a5f | 沿用深色值 |
| `--dsw-alias-state-success-tertiary` | #10362c | #d7f0e4 | 沿用深色值 |
| `--dsw-alias-state-warn-primary` | #f5b13d | #96530a | 沿用深色值 |
| `--dsw-alias-state-warn-secondary` | #f7c76a | #b26810 | 沿用深色值 |
| `--dsw-alias-state-warn-label` | #e8b25e | #8a4e00 | 沿用深色值 |
| `--dsw-alias-state-warn-tertiary` | #33280f | #f8ead2 | 沿用深色值 |
| `--dsw-alias-state-error-primary` | #f25a5a | #c62828 | 沿用深色值 |
| `--dsw-alias-state-error-secondary` | #ff8a8a | #a71d1d | 沿用深色值 |
| `--dsw-alias-state-idle-primary` | #5f7389 | #6f849c | 沿用深色值 |
| `--dsw-alias-code-diff-added` | rgba(52, 211, 153, 0.16) | rgba(10, 122, 83, 0.12) | 沿用深色值 |
| `--dsw-alias-code-diff-deleted` | rgba(242, 90, 90, 0.16) | rgba(198, 40, 40, 0.10) | 沿用深色值 |
| `--dsw-alias-file-diff-added-bg` | #1b3025 | #e6f5ec | 沿用深色值 |
| `--dsw-alias-file-diff-added-gutter` | #122018 | #d6ecdf | 沿用深色值 |
| `--dsw-alias-file-diff-added-marker` | #41c977 | #0a7a53 | 沿用深色值 |
| `--dsw-alias-file-diff-deleted-bg` | #341d1a | #fbe9e9 | 沿用深色值 |
| `--dsw-alias-file-diff-deleted-gutter` | #241210 | #f5dcdc | 沿用深色值 |
| `--dsw-alias-file-diff-deleted-marker` | #fa423e | #c62828 | 沿用深色值 |

#### Markdown / 代码

| 宿主 token | 深色宿主（暗面） | 浅色宿主（昼面） | 玻璃档（暗面） |
|---|---|---|---|
| `--dsw-alias-markdown-code-block` | #070d19 | #f3f7fc | 沿用深色值 |
| `--dsw-alias-markdown-code-block-banner` | #0b1626 | #e8f0f8 | 沿用深色值 |
| `--dsw-alias-markdown-code-segment-selected` | #16283f | #dce8f6 | 沿用深色值 |
| `--dsw-alias-markdown-code-segment-unselected` | #0a1424 | #f3f7fc | 沿用深色值 |
| `--dsw-alias-markdown-inline-code` | #0f1f33 | #edf3f9 | 沿用深色值 |
| `--dsw-alias-markdown-placeholder` | #0c1729 | #eef4fa | 沿用深色值 |
| `--dsw-alias-markdown-tag` | #0d1a2c | #eaf1f8 | 沿用深色值 |
| `--dsw-alias-markdown-citation` | #12233a | #e3edf8 | 沿用深色值 |

#### 链接 / 滚动条 / 浮层

| 宿主 token | 深色宿主（暗面） | 浅色宿主（昼面） | 玻璃档（暗面） |
|---|---|---|---|
| `--dsw-alias-link` | #7aaaff | #2f4fd6 | 沿用深色值 |
| `--dsw-alias-scrollbar-bg-l1` | #22354d | #c3d1e2 | rgba(var(--vy-g-scrollbar), calc(0.14 * var... |
| `--dsw-alias-scrollbar-bg-l2` | #2f4a68 | #9fb3ca | rgba(var(--vy-g-scrollbar), calc(0.22 * var... |
| `--dsw-alias-scrollbar-hover-l1` | #3f668f | #8fa7c4 | rgba(var(--vy-g-scrollbar), calc(0.30 * var... |
| `--dsw-alias-scrollbar-hover-l2` | #4d6bfe | #3b55d9 | rgba(var(--vy-deco-rgb), calc(0.55 * var(--... |
| `--dsw-alias-toast-bg` | #16283f | #0f1e33 | rgba(var(--vy-g-toast), calc(max(0.68, 0.84... |
| `--dsw-alias-toast-label` | #eef2f6 | #f7fbff | 沿用深色值 |
| `--dsw-alias-tooltip-bg` | #1a2c47 | #0f1e33 | rgba(var(--vy-g-tooltip), calc(max(0.72, 0.... |
| `--dsw-alias-tooltip-key-bg` | color-mix(in srgb, var(--vy-tooltip), #ffff... | color-mix(in srgb, var(--vy-l-tooltip), #ff... | 沿用深色值 |

#### 扩展 token（主题插件补充，宿主 113 层之外）

| 宿主 token | 深色宿主（暗面） | 浅色宿主（昼面） | 说明 |
|---|---|---|---|
| `--dsw-alias-settings-card-fill` | var(--vy-card) | var(--vy-l-card) | 沿用宿主语义，仅换色相 |
| `--dsw-alias-settings-card-stroke` | var(--vy-border-4) | var(--vy-l-border-4) | 沿用宿主语义，仅换色相 |
| `--dsw-alias-onboarding-accent` | — | — | 沿用宿主原值（未覆盖） |
| `--dsw-alias-onboarding-card-fill` | — | — | 沿用宿主原值（未覆盖） |
| `--dsw-alias-onboarding-secondary-fill` | — | — | 沿用宿主原值（未覆盖） |
| `--dsw-alias-onboarding-checkbox-border` | — | — | 沿用宿主原值（未覆盖） |
| `--dsw-linear-gradient-think` | — | — | 沿用宿主原值（未覆盖） |
| `--dsw-linear-think-select` | — | — | 沿用宿主原值（未覆盖） |

### 4.2 玻璃档 alpha 口径

| 通透度 t | `--vyron-a` | bg-base alpha | 说明 |
|---|---|---|---|
| 0 | 1.45 | 0.608（0.42×1.45） | 最实（接近不透明） |
| 50（默认） | 1.00 | 0.42 | 标准玻璃 |
| 100 | 0.55 | **0.30**（下限钳制，原 0.231） | 最透；下限保证动态背景最亮处正文仍可读 |

- 所有表面 alpha 形如 `rgba(var(--vy-g-base), calc(max(0.30, 0.42 * var(--vyron-a))))`；alpha>1 由浏览器按 [0,1] 钳制。
- 玻璃档文字微调亮且**随主题**（`--vy-glass-label-*`：orbit `#cfdbe8/#b0c0d3/#a3b6ca`、terra 暖灰、abyss 青灰），为动态背景兜可读性；浅色宿主仍用 §2.2 的深字套。

### 4.3 无语义改动的部分

- 字号 / 行高 / 字体栈 / 字重 / 圆角：**一个都没改**（无 `@font-face`，装饰文字用系统等宽栈）。
- 语义色语义：error 仍红（`#f25a5a`）、warn 仍琥珀（`#f5b13d`）、success 用生物光青绿（`#34d399`/`#7ef0d4`）点缀；不挪用强调蓝。
- shiki 代码高亮 token、elevation 阴影结构：宿主原值（仅 glass 档给抬升描边换玻璃高光）。

## 5. 主题

| 主题 | 底（暗面） | 高光 | 强调（business/link/rim） | 品牌锚点 `--v-brand` | 浅色宿主昼面 |
|---|---|---|---|---|---|
| `orbit`（默认） | `#050a16` 太空深蓝 | 大气青蓝 `#57a8ff` | DSH 蓝阶（business `#6f9bff` / link `#7aaaff`） | `#4d6bfe` | 冷蓝白 `#eef4fb` |
| `terra` | `#070d16` 地球蓝 + 沙金 | 云暖白 `#f1e6d2` | DSH 蓝阶（business `#7fa4ff` / link `#8bb5ff`） | `#4d6bfe` | 暖白 `#fbf5ec` + 沙金 |
| `abyss` | `#02040a` 近黑 | 生物光青 `#46d3e0` | 青蓝阶（business/rim `#46d3e0` / link `#6fe0ff`） | `#4d6bfe`（品牌锚点不随主题改） | 冷青白 `#eef7f5` |

浅色宿主（昼面）不是简单反色：星海切"昼面轨道"（浅空蓝白底 + 白色云 + 海蓝地球弧 + 暖阳光），玻璃表面改亮色半透（`rgba(238,244,251,…)`）、文字改深色（`#0a1628`），全部 token 在 §4.1 表内逐项给出。三主题的昼面分别偏冷蓝 / 暖沙 / 冷青。

**abyss 去绿修订（2026-11-03，真机 `skin-accent-abyss.png` 反馈）**：原 abyss 的 bio 青 `#7ef0d4` 与成功绿同屏时读作偏绿。现把 abyss 的"强调"从绿青移到**青蓝**：`business/rim → #46d3e0`、`link → #6fe0ff`、装饰主/辅色 `--vy-deco-rgb → 70,211,224`、环境光 `--vy-a1 → 70,211,224`、地球弧 `--vy-earth-rgb → 60,160,210`，星点改冷白 `210,235,255`；品牌锚点 `--v-brand #4d6bfe` 不变，成功色仍是语义绿 `#34d399`（不参与"强调"）。

## 6. 动态星海背景（glass 档，12 层纯 CSS）

| # | 层 | 内容 | 动画（v0.2.0） |
|---|---|---|---|
| 1 | `va-base` | 深空渐变：顶部大气冷光 + 深空蓝 + 底部压暗 | 静态 |
| 2 | `va-stars` | 双层 box-shadow 星场（22 亮星 + 26 细星，确定性坐标） | 容器 90s 慢漂 2.4vmax×1.6vmax + 两层 opacity 6.8s / 9.6s 错相闪烁 |
| 3 | `va-earth` | 底部 78% 地球大气边缘光（径向渐变 + 生物光内晕） | **opacity 0.55↔1.0 + scale 0.995↔1.022（8.4s）** |
| 4–7 | `va-cloud.va-c1..c4` | 4 团超大模糊云（62/54/70/40vmax） | transform+opacity 66/84/72/90s 错相漂移（不变） |
| 8 | `va-sea` | 底部平台反射水平线 + 湿光 | 静态 |
| 9 | `va-sheen` | 屏级呼吸光 + **2 层极光帘幕（::before / ::after，84s/90s 横移）** | **opacity 0.06↔0.52 + ±1.5% scale（8.4s）** |
| 10 | `va-grain` | SVG 噪点（soft-light） | 静态 |
| 11 | `va-vignette` | 暗角 | 静态 |
| 12 | `va-rim` | 视口边缘呼吸光 | **opacity 0.10↔0.62 + ±1.4% scale（8.4s）** |

- **v0.2.0 呼吸口径（ROUND2-PLAN §4.6，用户反馈"呼吸感要强/观感明显"）**：8.4s 单频为基准，rim/earth/sheen 的 opacity 振幅全部翻倍以上，并各自叠加 1.4–2.2% 的 scale 呼吸；`va-sheen` 内部新增 2 层「极光帘幕」伪元素（斜向青蓝/云暖色带，84s / 90s 交替横移 4.5–5vmax，只动 transform，不新增 DOM）；星场由"只闪烁"升级为"90s 慢漂 + 闪烁"。
- `va-sheen` 加**中央正文带蒙版**（中心 alpha 0.52 → 外缘 1.0）：呼吸亮场主要落在四周/上下，正文区背景峰值被压住，这是"对比度不回退"的关键保险（实测见 §10.8 / §13.5）。
- 漂移周期仍全部落在规格 §4.3 的 **60–90s**；呼吸为 **8.4s 单频**（earth/sheen/rim 同频同相，0%/100% 暗、50% 亮）。
- 前层 18 颗边缘星点（`#root::before`）不变。

- 漂移周期全部落在规格 §4.3 的 **60–90s**；呼吸为 **8.4s 单频**（earth/sheen/rim 同频同相，0%/100% 暗、50% 亮）。
- **真机可辨度修订（2026-11-03，首轮真机截图反馈"偏黑偏静"）**：① `#root` 毛玻璃 `blur(26px)` → **`blur(13px)`**（26px 会把星点/云糊成纯雾）；② 星场改"大而稀"：22 颗亮星（3px + spread≤2.5px）+ 26 颗细星，颜色走 `--vy-star-rgb`；③ 新增 **前层 18 颗边缘星点**（`#root::before`，mask 挖空中央内容区，见 §7）；④ 云层 alpha +0.08~0.15、`va-sheen` 0.24→0.32、`va-rim` 0.28→0.36、`va-earth` 主光 0.22→0.30 并新增一道清晰弧线。
- 背景层 `position:fixed; z-index:-1; contain:strict; pointer-events:none`；body 透明、`#root` 单层 `backdrop-filter: blur(26px) saturate(150%) brightness(0.96)`。
- 星点用极小点状光，不构成面状背景，不参与正文对比度计算（保守计入"最坏背景"叠加已剔除）。

## 7. full 档装饰层（全部 pointer-events:none、零布局位移）

| 装饰 | 实现 | 零布局依据 |
|---|---|---|
| 顶栏日轨条 | `header[data-window-drag]` 的 4 层 background（主刻度 60px / 次刻度 12px / 当前时刻游标 / 底线） | 只写 `background-*`，不设 padding/高度；游标读可选变量 `--vyron-day-progress`（0–100，缺省 50 居中） |
| 顶栏日轨游标呼吸（v0.2.0） | `header::before`：36×12px 放射光晕贴在游标位置，8.4s opacity 0.22↔0.96 + scale 0.78↔1.2 | 伪元素 absolute，`pointer-events:none`，只压 header 下缘 12px，不碰按钮/文字 |
| session ledger 标签 | `header::after`，9px 等宽装饰文字 "SESSION LEDGER" + 生物光点，8.4s 呼吸（v0.2.0 振幅 0.60↔1.0） | 伪元素 absolute，`pointer-events:none`；header 仅补 `position:relative`（不改布局） |
| 四角角标 `⌜⌝⌞⌟` | `html::before` 8 条 1px 渐变（四角各两条）+ 顶部大气边缘光；fixed 层 z-index 900 | fixed 装饰层，不占文档流；低于宿主弹窗 1000 |
| 扫描线 + 颗粒 + 侧缘刻度 | `html::after`，3px 扫描线 + SVG 噪点 + 两侧 16px 刻度列，opacity 0.04 / soft-light | fixed 层 z-index 901，`pointer-events:none` |
| 侧栏 micrographics 条 | `[class*="sidebarCol"]::after` 底部 6px（正好落在侧栏 6px 垂直内边距内）+ `::before` 右缘 3px 数据刻度列；v0.2.0 两者 8.4s/6.8s 呼吸，位流 16s 横向漂移（background-position） | 伪元素 absolute；侧栏补 `position:relative` |
| 输入框彗尾流光（v0.2.0） | `[data-composer-card]::before` 1.6px conic 环：2 段窄高亮弧（白热 34° / 生物青 166°）+ 低亮底环，5.6s/圈，环亮 0.9–1.0，6.4s 呼吸；`::after` 同组弧 `blur(7px)` 副光晕，**反向** 7.2s/圈 + 6.4s 呼吸 0.28–0.72；聚焦整体亮度 ×1.2 | 宿主卡片已 `position:relative`；两伪元素 absolute + `pointer-events:none`；不新增 backdrop-filter |
| 输入卡斜向流光（v0.2.0） | 卡片 `background-image` 增加一层 112° 极淡光带（alpha ≤0.06），`background-position` 9.6s 扫过一次后停留，循环无跳变 | 只动背景层（content 之上），文字/控件在 content 层；`--static`/reduce 下停用 |
| 当前项 / tab 强调 | 会话行左缘 2px 生物光条、当前 tab 底部 2px 生物光线、当前页导航 | 仅 `box-shadow: inset` / `background-image`，不改尺寸 |
| 前层边缘星点（仅 glass） | `#root::before`：18 颗径向渐变星点（颜色 `--vy-star-rgb`），mask 挖空中央 58%×52% 内容区 | fixed 层 `pointer-events:none`、z-index:5（低于宿主弹层 100+）；只出现在视口边缘，不覆盖正文/输入区 |

## 7.5 交接分区显影（`.vyron-enter`，v0.2.0 新增，配合 Lead 的 lib/splash.js）

宿主 `lib/splash.js` 在交接 done 后 ~300ms 给 `<html>` 加 `.vyron-enter`，~1300ms 移除（ROUND2-PLAN §4.5）。皮肤侧只提供 CSS，不加 DOM：

| 相对加类时刻 | 目标 | 动画 | 时长/位移 |
|---|---|---|---|
| 0ms | `#dsh-vyron-ambient`（仅 glass） | `vy-ambient-in`：opacity 0→1 + scale 1.035→1 | 900ms |
| 0ms | `[class*="sidebarCol"]` | `vy-enter-sidebar`：opacity 0→1 + 10px 横向滑入 | 520ms |
| 50ms | `#root header[data-window-drag]` | `vy-enter-topbar`：opacity 0→1 + 6px 纵向落位 | 500ms |
| 240ms | `[data-composer-seat]`（含输入卡/标题块） | `vy-enter-composer`：opacity 0→1 + 8px 上浮 + scale 0.996→1 | 560ms |
| 340ms | 同一 topbar | `vy-daybar-ignite`：日轨下缘冷光 box-shadow 脉冲后收掉（"竖直光带落到顶栏"） | 540ms |

- 全部动画总时长 ≤900ms + `animation-fill-mode: both`：class 在 ~1300ms 被移除时动画已结束（或保持终态），无跳变。
- 只动 opacity / transform / box-shadow；`pointer-events` 不变、布局不变、点击不变。
- `--static` 下显影动画直接 `none`（直接显示终态）；`prefers-reduced-motion: reduce` 下保留 opacity 淡入、`transform` 置 none（见 §8）。
- 真实实例证据（模拟加类，CDP 逐帧）：`_shots/round2-skin/cmp-reveal.png`（+0/+150/+400/+700/+900ms）。

## 8. 降级矩阵

| 触发条件 | 注入方 | class / 媒体查询 | 皮肤行为 |
|---|---|---|---|
| `skinMotion=false` | client.js | `.dsh-vyron-skin--static` | **全静态**：星海 12 层动画 `none`（保留完整静态构图一帧）；声呐环/ledger/日轨游标/侧栏 micrographics/卡面流光停动画；**含 ambient 伪元素**（星场 twinkle / 极光帘幕，2026-11-03 verifier 验收补覆盖，见 §8.1 末）；释放 `will-change` |
| `reducedMotion=true` | client.js | `.dsh-vyron-skin--static` | 同上 |
| `navigator.hardwareConcurrency ≤ 4`（低配） | client.js | `.dsh-vyron-skin--static` | 同上 |
| 页面后台（`document.hidden`） | client.js | `.dsh-vyron-skin--paused` | 全部动画（含 v0.2.0 新增的日轨游标/侧栏/卡面）`animation-play-state: paused`，回前台继续 |
| `!CSS.supports('backdrop-filter')` | client.js | `.dsh-vyron-skin--noblur` | `#root` 去模糊；玻璃表面 token 改实心（暗/浅两套）；背景层保留但不透出 |
| 系统减弱动态（v0.2.0 口径，Lead 裁决） | CSS 兜底 | `@media (prefers-reduced-motion: reduce)` | **减动态 ≠ 全灭**：停大位移/缩放/漂移（ambient 内 `transform:none !important`；星场/极光帘幕漂移 `animation:none`；卡面斜向流光停用；显影位移置 none，保留 opacity 淡入）；**保留** 8.4s 低频 opacity 呼吸 + composer 低速流光（9s/圈、亮度 ×0.82）+ 6.4s 呼吸 + 6.8s 侧栏刻度呼吸。理由见 §8.1 与 §13.5 |
| 系统减弱透明 | CSS 兜底 | `@media (prefers-reduced-transparency: reduce)` | `#root` 降为 `blur(8px)`；表面 token 改 94–98% 实心 |
| 浏览器不支持 backdrop-filter | CSS 兜底 | `@supports not ((backdrop-filter…) or (-webkit-…))` | 等同 noblur（核心表面实心化） |
| 浏览器不支持 mask-composite | CSS 兜底 | `@supports not ((mask-composite:exclude) or (-webkit-mask-composite:xor))` | 声呐环退化为 1px 实色内描边，泛光隐藏 |
| off 档 | client.js | 无 `dsh-vyron-skin` class | 本文件零命中 |

### 8.1 为什么 reduce 档要"减动态"而不是"全灭"（2026-11-03 真机根因）

- 本机 Windows「设置→辅助功能→视觉效果→动画效果」为**关**（PowerShell `SystemParametersInfo(SPI_GETCLIENTAREAANIMATION)` 返回 False，`SPI_GETUIEFFECTS` 同为 False）；Chromium 把它映射成 `prefers-reduced-motion: reduce`（headless Chrome 实测 `matchMedia` 为 true，data: URL 空页同）。
- v0.1.0 的 CSS 兜底把 ambient/composer/ledger 全部 `animation:none` ⇒ **用户真机皮肤完全静态**，这正是用户"背景动态要搞、呼吸感要强、对话框流光要有"反馈的直接原因（不只是振幅小）。
- 而用户显式配置 `skinMotion=true` 优先于 OS 默认；8.4s 低频呼吸远低于 WCAG 闪烁风险阈值，大位移（漂移/缩放）才是前庭风险源，故 reduce 档只停位移类、保留明暗类。`--static`（插件自身开关/低配）仍保持全静态兜底。
- **2026-11-03 verifier 验收修正（静态档伪元素覆盖）**：CSS 里 `#dsh-vyron-ambient *` 只匹配**元素**、不匹配伪元素，v0.2.0 首版 `--static` 下 `.va-stars::before/::after`（twinkle 6.8s/9.6s）与 `.va-sheen::before/::after`（极光帘幕 84s/90s）仍会跑。已补 `#dsh-vyron-ambient *::before, *::after { animation: none !important }`；同理 `--paused` 补 `*::before/::after { animation-play-state: paused !important }`。真机复测（`_shots/round2-skin/static-probe.json`）：`--static` 下 `document.getAnimations()` = **0**；`--paused` 下 21 个动画全部 `playState: paused`（含 `va-stars::before/::after`）。

## 9. 选择器命中依据

宿主全部事实来自 `app.asar` 提取（ui-theme / ui-layout / ui-conversation / ui-workspace / ui-sidebar / ui-plugin-manager / dsh-web-frontend 的 CSS 与 markup），不靠猜测：

| # | 选择器（皮肤侧） | 用途 | 命中依据（宿主 0.2.1-rc.5 实测） | 未命中时 |
|---|---|---|---|---|
| 1 | `html.dsh-vyron-skin` | 全部规则的作用域根 | `lib/client.js` applySkin：`html.classList` 加 `dsh-vyron-skin` | off 档无此 class → 皮肤零生效 |
| 2 | `.dsh-vyron-skin--accent/--full/--glass` | 四档 | client.js `SKIN_MODE_CLASS` | 档位不生效，只剩 accent token |
| 3 | `.dsh-vyron-skin--static/--paused/--noblur` | 降级 class | client.js `SKIN_*_CLASS`（static/noblur 仅 glass 档写入） | 依赖 `prefers-reduced-motion` / `@supports` 兜底 |
| 4 | `html[data-vyron-theme="orbit|terra|abyss"]` | 三主题 | client.js `html.setAttribute('data-vyron-theme', …)`；**当前实现仅 glass 档写入**，accent/full 回落 orbit | accent/full 主题不切换（见 §11 未验证项） |
| 5 | `#root header[data-window-drag]` | 顶栏日轨条 + ledger 标签 | ui-conversation：`<header class="an3WzG_header" data-window-drag>`；ui-plugin-manager `pageHead`/`moreHead` 同属性 | 顶栏装饰消失，其余不受影响 |
| 6 | `#root header[data-window-drag]::after` | SESSION LEDGER chip | 同上（header 由本皮肤设 `position:relative` 作包含块） | 同上 |
| 7 | `[class*="sidebarCol" i]` | 侧栏右缘刻度 + 底部 micrographics | ui-layout `AppFrame.module.css`：`.mP3x-q_sidebarCol`（宿主 CSS Modules 哈希前缀无关，只匹配语义后缀） | 侧栏装饰消失 |
| 8 | `[data-composer-card]` | 输入卡声呐环（1.6px + conic 光场） | ui-conversation `InputBar` markup：`data-composer-card`，宿主已 `position:relative` + `border-radius:var(--dsw-radius-panel)` | 声呐环消失（不影响输入可用性） |
| 9 | `[data-composer-seat]` | （预留，当前未使用） | 同上：`data-composer-seat` | — |
| 10 | `[role="tablist"] [role="tab"][aria-selected="true"]` | 当前 tab 底部 2px 生物光短线 | ui-conversation `viewTabs`：`role="tablist"` + 按钮 `role="tab" aria-selected` | 当前 tab 强调消失 |
| 11 | `[role="treeitem"][aria-selected="true"]` | 当前会话行左缘 2px 光条 | ui-workspace `Rows`：会话行 `role="treeitem"` + `aria-selected` | 当前行强调消失 |
| 12 | `[aria-current="page"]` / `[aria-current="true"]` | 当前页导航强调 | ui-* 两个包实测 `"aria-current": active ? "page" / "true"` | 强调消失 |
| 13 | `[class*="viewsMoreMenu" i]` / `[class*="moreMenu" i]` / `[class*="addMenu" i]` / `[role="menu"]` | 菜单/浮层玻璃高光 | ui-conversation `viewsMoreMenu`、ui-sidebar `moreMenu`、ui-plugin-manager `addMenu`（module map 实测存在） | 菜单仍由 `--dsw-specific-menu` token 着色，仅少一层描边高光 |
| 14 | `dialog` / `[class*="_dialog" i]` / `[class*="_mask" i]` | 弹窗/遮罩玻璃 | dsh-web-frontend `index-*.css`：`._dialog_o6lrb_33` / `._mask_o6lrb_18`；各 ui 包的 `<dialog>` | 弹窗仍由 `--dsw-alias-bg-layer-2` / `--dsw-mask-blur` token 着色 |
| 15 | `.md-code-block` | 代码块左缘 2px 大气光导轨 | dsh-web-frontend `index-*.css` 全局类 `.md-code-block`（markdown 渲染器输出） | 只剩 token 底色 |
| 16 | `:not([data-input-modality="pointer"]) :focus-visible` | 键盘焦点环兜底色 | ui-theme `focus.css`：`html[data-input-modality=pointer] body :focus-visible:not(:read-write){--dsw-focus-ring-color:transparent}` | 焦点环仍由宿主令牌渲染（business-primary=蓝） |
| 17 | `html.vyron-enter` | 交接分区显影（900ms 内） | 本插件 `lib/splash.js` 交接时加、~1300ms 移除（与 `lib/splash.css` 同一 class；时序见 §7.5） | 背景直接出现，无显影 |
| 18 | `--dsw-alias-*` / `--dsw-static-*` / `--dsw-specific-*` | 113 token 覆盖 | ui-theme `lib/client.js`：77 static + 113 alias 声明在 `body` / `body[data-ds-dark-theme]`；`--dsw-radius-panel` 等 8 个在 `:root` | 宿主原版配色 |
| 19 | `[class*="navCell" i][class*="active" i]` | 旧宿主导航兜底 | **当前 0.2.1-rc.5 未找到 navCell 类名**（elisa 代际后备选择器） | 无影响（aria 钩子已覆盖） |
| 20 | `html.dsh-vyron-skin--glass:not(:has(body[data-ds-dark-theme]))` | 浅色宿主的 html 兜底底色 | `:has()` Chrome 105+；宿主为现代 Chromium/Electron | 浅色交接 900ms 内 html 底色偏深（仅过渡帧） |

## 10. 对比度实测

方法：WCAG 2.x 相对亮度公式（sRGB→线性化）计算。玻璃档给**两个解析界**（按 §6 图层定义逐层合成、并按实际 alpha 含下限合成表面）：
- **全层峰值叠加（理论最坏上界）** `#417bac`，亮度 0.1827：地球亮弧 + 云 + 呼吸光 + 基色光斑在同一点同时取峰值（物理上不可能全部重合，属保守上界）；
- **主对话区最亮带（现实上界）** `#1f3957`，亮度 0.0391：基色光斑 + 云 + 呼吸光叠加，不含底部地球亮弧（该区域由输入卡/侧栏更实的表面覆盖）；
- 常规背景 `#0c1a2f`。
宿主还会经过 `#root` 的 blur(13px)，局部亮点被进一步平均，故上述界均偏保守。

阈值：正文 / 链接 / 状态文字 **≥4.5:1**；装饰文字与图形 **≥3:1**；纯装饰细线（1px 刻度、边缘光）按 WCAG 1.4.11 豁免（不承载信息）。

### 10.1 深色宿主：文字 × 表面

| 深色表面 | 底色 | primary | secondary | tertiary | caption | business | link | success | warn | error |
|---|---|---|---|---|---|---|---|---|---|---|
| bg_base | #050a16 | 17.59 | 10.8 | 7.68 | 6.53 | 7.36 | 8.5 | 10.29 | 10.59 | 6.02 |
| layer1 | #0a1424 | 16.4 | 10.07 | 7.16 | 6.09 | 6.86 | 7.92 | 9.6 | 9.87 | 5.61 |
| layer2 | #0e1a2e | 15.48 | 9.51 | 6.76 | 5.75 | 6.48 | 7.48 | 9.06 | 9.32 | 5.3 |
| layer3 | #13233c | 14.0 | 8.6 | 6.12 | 5.2 | 5.86 | 6.77 | 8.19 | 8.43 | 4.79 |
| sidebar | #040911 | 17.74 | 10.9 | 7.75 | 6.59 | 7.42 | 8.57 | 10.38 | 10.68 | 6.07 |
| input | #0b1626 | 16.13 | 9.91 | 7.05 | 5.99 | 6.75 | 7.8 | 9.44 | 9.71 | 5.52 |
| menu | #0a1424 | 16.4 | 10.07 | 7.16 | 6.09 | 6.86 | 7.92 | 9.6 | 9.87 | 5.61 |
| code | #070d19 | 17.27 | 10.61 | 7.55 | 6.41 | 7.23 | 8.35 | 10.11 | 10.4 | 5.91 |
| inline | #0f1f33 | 14.77 | 9.07 | 6.45 | 5.48 | 6.18 | 7.14 | 8.64 | 8.89 | 5.05 |
| tooltip | #1a2c47 | 12.48 | 7.67 | 5.45 | 4.64 | 5.22 | 6.03 | 7.31 | 7.52 | 4.27 |

### 10.2 浅色宿主：文字 × 表面

| 浅色表面 | 底色 | primary | secondary | tertiary | caption | business | link | success | warn | error |
|---|---|---|---|---|---|---|---|---|---|---|
| bg_base | #eef4fb | 16.38 | 8.74 | 6.4 | 4.95 | 5.91 | 5.91 | 4.84 | 5.36 | 5.08 |
| layer1 | #ffffff | 18.13 | 9.67 | 7.08 | 5.48 | 6.54 | 6.54 | 5.35 | 5.93 | 5.62 |
| layer2 | #ffffff | 18.13 | 9.67 | 7.08 | 5.48 | 6.54 | 6.54 | 5.35 | 5.93 | 5.62 |
| layer3 | #f6fafd | 17.28 | 9.22 | 6.75 | 5.22 | 6.23 | 6.23 | 5.1 | 5.66 | 5.36 |
| sidebar | #e7eff8 | 15.63 | 8.34 | 6.1 | 4.72 | 5.64 | 5.64 | 4.62 | 5.12 | 4.85 |
| input | #ffffff | 18.13 | 9.67 | 7.08 | 5.48 | 6.54 | 6.54 | 5.35 | 5.93 | 5.62 |
| menu | #ffffff | 18.13 | 9.67 | 7.08 | 5.48 | 6.54 | 6.54 | 5.35 | 5.93 | 5.62 |
| code | #f3f7fc | 16.85 | 8.99 | 6.58 | 5.09 | 6.08 | 6.08 | 4.98 | 5.52 | 5.23 |
| inline | #edf3f9 | 16.22 | 8.65 | 6.34 | 4.9 | 5.85 | 5.85 | 4.79 | 5.31 | 5.03 |

### 10.3 关键对与装饰

| 实测项 | 前景 | 背景 | 对比度 | 阈值 | 结论 |
|---|---|---|---|---|---|
| dark 正文: label-primary / bg-base | #eef2f6 | #050a16 | 17.59:1 | 4.5 | ✅ 通过 |
| dark 正文: label-primary / layer-3(最深浮层) | #eef2f6 | #13233c | 14.00:1 | 4.5 | ✅ 通过 |
| dark 二级: label-secondary / layer-3 | #b3c1d1 | #13233c | 8.60:1 | 4.5 | ✅ 通过 |
| dark 三级: label-tertiary / layer-3 | #93a3b6 | #13233c | 6.12:1 | 4.5 | ✅ 通过 |
| dark 链接: link / layer-2 | #7aaaff | #0e1a2e | 7.48:1 | 4.5 | ✅ 通过 |
| dark 强调: business-primary / layer-2 | #6f9bff | #0e1a2e | 6.48:1 | 4.5 | ✅ 通过 |
| dark 错误: error / layer-3 | #f25a5a | #13233c | 4.79:1 | 4.5 | ✅ 通过 |
| dark 主按钮: label-primary-foreground(#050a16) / button-primary-fill(#eef2f6) | #050a16 | #eef2f6 | 17.59:1 | 4.5 | ✅ 通过 |
| dark 发送键图形: #fff / button-info-fill(#4d6bfe) | #ffffff | #4d6bfe | 4.33:1 | 3.0 | ✅ 通过 |
| dark 装饰文字: 四角角标复色 / bg-base | #407cbe | #050a16 | 4.56:1 | 3.0 | ✅ 通过 |
| dark 装饰文字: ledger chip 文字复色 / chip 底 | #818fa0 | #070e1c | 5.85:1 | 3.0 | ✅ 通过 |
| dark 装饰图形: 侧栏 micrographics 复色 / sidebar | #47887c | #040911 | 4.83:1 | 3.0 | ✅ 通过 |
| dark 装饰细线: 日轨主刻度复色 / bg-base (纯装饰线，WCAG 1.4.11 豁免) | #383d47 | #050a16 | 1.82:1 | 1.0 | ✅ 通过 |
| dark 占位符: label-tertiary / 输入底 | #93a3b6 | #0b1626 | 7.05:1 | 4.5 | ✅ 通过 |
| light 正文: label-primary / bg-base | #0a1628 | #eef4fb | 16.38:1 | 4.5 | ✅ 通过 |
| light 正文: label-primary / sidebar | #0a1628 | #e7eff8 | 15.63:1 | 4.5 | ✅ 通过 |
| light 二级: label-secondary / sidebar | #33465c | #e7eff8 | 8.34:1 | 4.5 | ✅ 通过 |
| light 三级: label-tertiary / sidebar | #465a72 | #e7eff8 | 6.10:1 | 4.5 | ✅ 通过 |
| light 链接: link / layer-1 | #2f4fd6 | #ffffff | 6.54:1 | 4.5 | ✅ 通过 |
| light 强调: business / layer-1 | #2f4fd6 | #ffffff | 6.54:1 | 4.5 | ✅ 通过 |
| light 成功: success / sidebar | #0a7a53 | #e7eff8 | 4.62:1 | 4.5 | ✅ 通过 |
| light 警告: warn / sidebar | #96530a | #e7eff8 | 5.12:1 | 4.5 | ✅ 通过 |
| light 错误: error / sidebar | #c62828 | #e7eff8 | 4.85:1 | 4.5 | ✅ 通过 |
| light 主按钮: #ffffff / label-primary(#0a1628) | #ffffff | #0a1628 | 18.13:1 | 4.5 | ✅ 通过 |
| light 装饰文字: ledger chip 复色 / chip 底 | #435569 | #ffffff | 7.66:1 | 3.0 | ✅ 通过 |
| light tooltip 文字: #eef2f6 / tooltip 深底 #0f1e33 | #eef2f6 | #0f1e33 | 14.89:1 | 4.5 | ✅ 通过 |
| light toast 文字: #f7fbff / toast 深底 #0f1e33 | #f7fbff | #0f1e33 | 16.11:1 | 4.5 | ✅ 通过 |
| dark tooltip 文字: #eef2f6 / tooltip 深底 #1a2c47 | #eef2f6 | #1a2c47 | 12.48:1 | 4.5 | ✅ 通过 |
| dark toast 文字: #eef2f6 / toast 深底 #16283f | #eef2f6 | #16283f | 13.24:1 | 4.5 | ✅ 通过 |

### 10.4 玻璃档（深色宿主）：全层峰值叠加（理论最坏上界）× 各通透度档

| 通透度档 | 表面 | 实际 alpha | 合成底色 | primary | secondary | tertiary | caption |
|---|---|---|---|---|---|---|---|
| 通透度 0（最实） | bg_base | 0.61 | #1c3651 | 11.01 | 8.82 | 6.68 | 5.96 |
| 通透度 0（最实） | sidebar | 0.75 | #132537 | 13.85 | 11.1 | 8.41 | 7.5 |
| 通透度 0（最实） | input | 0.9 | #102034 | 14.6 | 11.7 | 8.86 | 7.9 |
| 通透度 0（最实） | layer3 | 1.01 | #12223a | 14.19 | 11.36 | 8.61 | 7.68 |
| 通透度 50（标准） | bg_base | 0.42 | #284c6d | 7.96 | 6.38 | 4.83 | 4.31 |
| 通透度 50（标准） | sidebar | 0.52 | #21405b | 9.58 | 7.67 | 5.81 | 5.18 |
| 通透度 50（标准） | input | 0.62 | #203c59 | 10.08 | 8.07 | 6.12 | 5.45 |
| 通透度 50（标准） | layer3 | 0.7 | #213d5e | 9.86 | 7.89 | 5.98 | 5.33 |
| 通透度 100（最透） | bg_base | 0.3 | #2f597f | 6.54 | 5.23 | 3.97 | 3.54 |
| 通透度 100（最透） | sidebar | 0.3 | #2f597d | 6.56 | 5.25 | 3.98 | 3.55 |
| 通透度 100（最透） | input | 0.34 | #2f597e | 6.55 | 5.24 | 3.97 | 3.54 |
| 通透度 100（最透） | layer3 | 0.48 | #2b5176 | 7.35 | 5.88 | 4.46 | 3.97 |

注：上表 layer3 在通透度 0 档计算值 1.01>1，浏览器按 CSS Color 4 规则钳制为 1（完全不透明），表中按 1.0 参与对比度计算。

### 10.5 玻璃档（深色宿主）：主对话区最亮带（现实上界）

| 通透度档 | 表面 | 实际 alpha | 合成底色 | primary | secondary | tertiary | caption |
|---|---|---|---|---|---|---|---|
| 通透度 0（最实） | bg_base | 0.61 | #0f1c2f | 15.21 | 12.18 | 9.23 | 8.23 |
| 通透度 0（最实） | sidebar | 0.75 | #0b1522 | 16.31 | 13.06 | 9.9 | 8.83 |
| 通透度 0（最实） | input | 0.9 | #0d1a2b | 15.56 | 12.46 | 9.44 | 8.42 |
| 通透度 50（标准） | bg_base | 0.42 | #14253c | 13.73 | 11.0 | 8.33 | 7.43 |
| 通透度 50（标准） | sidebar | 0.52 | #112033 | 14.6 | 11.7 | 8.86 | 7.9 |
| 通透度 50（标准） | input | 0.62 | #132339 | 14.07 | 11.27 | 8.53 | 7.61 |
| 通透度 100（最透） | bg_base | 0.3 | #172b44 | 12.74 | 10.2 | 7.73 | 6.89 |
| 通透度 100（最透） | sidebar | 0.3 | #172b42 | 12.78 | 10.24 | 7.75 | 6.92 |
| 通透度 100（最透） | input | 0.34 | #182d46 | 12.42 | 9.95 | 7.54 | 6.72 |

### 10.6 玻璃档（浅色宿主，昼面）

| 通透度档 | 实际 alpha | 合成底色 | primary | secondary | tertiary |
|---|---|---|---|---|---|
| t0 | 0.84 | #e9f1fa | 15.91 | 8.49 | 6.21 |
| t50 | 0.58 | #e1ecf9 | 15.17 | 8.09 | 5.92 |
| t100 | 0.42 | #dceaf9 | 14.83 | 7.91 | 5.79 |

**结论**：深色正文最低 14.00:1、浅色正文最低 15.63:1、装饰文字最低 4.56:1。
玻璃档：**主对话区（现实上界）**在通透度 0/50/100 下 primary 12.74–15.21:1、secondary 10.20–12.18:1、tertiary 7.73–9.23:1，全部 ≥4.5:1；
**理论最坏上界（全层峰值同点叠加）**通透度 50 档 primary 7.96:1 / secondary 6.38:1 / tertiary 4.83:1（均 ≥4.5:1），通透度 100 档 primary 6.54:1、secondary 5.23:1、tertiary 3.97:1（≥3:1 支持性文字阈值）。
平铺表面无失败项；玻璃档在极端通透度 + 理论最坏叠加下仅 tertiary 从 4.5 降到 ≥3.9，属支持性文字且该叠加不可全点同时发生。

### 10.7 工具提示 / 吐司（明暗宿主都是深底浅字）

宿主设计里 `--dsw-alias-tooltip-bg`（浅色宿主为 `#2c2c2e` 级深色）与 `--dsw-alias-toast-bg` 在明暗两套宿主下都保持深底，因此本皮肤对 `[role="tooltip"]` 兜底文字 `--vy-tooltip-label`（`#eef2f6`），`toast-label` 显式给 `#f7fbff`；实测 tooltip/toast 四组对比度 12.48–16.11:1（见 §10.3）。§10.2 浅色表不含 tooltip 行（tooltip 不继承 label-primary）。

### 10.8 v0.2.0 玻璃档真机实测（加强呼吸后对比度不回退）

方法：隔离 DSH 实例（宿主真实运行）→ CDP `Emulation.setEmulatedMedia` 覆盖为 `prefers-reduced-motion: no-preference` → 把 html 行内变量覆写为用户真实配置 `glassTransparency=80`（模拟，非实例配置）→ 用 Web Animations API 把全页动画 `pause + seek` 到指定相位再截图。正文对比度按 WCAG 公式，label-primary `#eef2f6`（L=0.8834）对「正文可能落位区（x 20–93%、y 10–44%，已避开 composer 装饰环）」与「composer 下方空白区」的第 98 百分位亮度（现实最亮背景）计算，同一页面同布局 A/B。

| 区域 / 相位 | v0.1.0 P50 / P98 | v0.2.0 P50 / P98 | 结论 |
|---|---|---|---|
| 正文区 呼吸最暗相位（t=0） | 17.29 / 16.32 | 17.37 / 16.34 | 不回退（略升） |
| 正文区 呼吸峰值相位（t=3.6s） | 17.29 / **14.87** | 17.37 / **14.55** | -0.32，仍 ≥14:1 |
| composer 下方空白区 峰值 | — / 13.76 | — / 13.55 | 纯装饰区（无正文） |
| 实色 token 表面（权威表 §10.1） | 14.00–17.59 | 14.00–17.59 | 未改任何 token，完全不变 |

> 说明：v0.1.0 的玻璃档"理论最坏上界"本身低于 14:1（§10.4），14:1 是深色**实色**表面的设计门槛。上表是 v0.2.0 呼吸加强后的真机实测对照：正文区最亮背景在呼吸峰值仍 14.55:1，呼吸最暗相位与 v0.1.0 持平；composer 下方装饰区（无正文）13.55:1 远高于 WCAG AA 的 4.5:1。**`va-sheen` 的中央正文带蒙版**是这组数值的主要保险。

## 11. 性能（composited layer 数量）

| 合成层来源 | 数量 | 逐帧动画 | 说明 |
|---|---|---|---|
| `#root { backdrop-filter }` | 1 | 否 | 整窗唯一 blur 层（规格 §4.4「只给应用容器加」） |
| `.va-stars` 容器（v0.2.0 新增慢漂） | 1 | transform（90s） | 整层慢移 2.4vmax×1.6vmax；内容为两层 box-shadow 星点 |
| `.va-stars::before/::after` | 2 | opacity（6.8s / 9.6s 交替） | 双层 box-shadow 星场（22 亮星 + 26 细星） |
| `.va-earth` | 1 | opacity+transform（8.4s） | 地球大气边缘光呼吸 |
| `.va-cloud.va-c1..c4` | 4 | transform+opacity（66/84/72/90s） | 四团超大模糊云，`will-change` 精确限定在这 4 个元素 |
| `.va-sheen` | 1 | transform+opacity（8.4s） | 屏级呼吸光（mix-blend-mode: screen；中心蒙版为静态） |
| `.va-sheen::before/::after`（v0.2.0 极光帘幕） | 2 | transform（84s / 90s） | 斜向色带横移，无 filter，只动 transform |
| `.va-grain` | 1 | 否 | 静态噪点层（mix-blend-mode: soft-light） |
| `.va-rim` | 1 | opacity+transform（8.4s） | 视口边缘呼吸光 |
| `html::before` / `html::after` | 2 | 否 | 四角角标 / 扫描线颗粒 fixed 装饰层（z-index 900/901） |
| `header::after`（ledger chip） | 1 | opacity（8.4s） | 小面积 chip |
| `header::before`（v0.2.0 日轨游标光晕） | 1 | opacity+transform（8.4s） | 36×12px 小面积光晕 |
| `#root::before`（前层边缘星点） | 1 | 否 | 18 颗径向渐变星点 + mask，静态绘制；只在视口边缘 |
| **合计（glass 档，动画运行时）** | **≤19** | — | 相比 v0.1.0 的 ≤15 增加 4 层：星场容器、2 层极光帘幕、日轨游标光晕；full/accent 档只有 html 装饰层 + ledger chip + 日轨光晕 + 声呐环 |
| 声呐环 2 个伪元素 | 0（主线程重绘） | `@property` 角度（5.6s / 反向 7.2s）+ 呼吸（6.4s） | 只重绘 2 个边框环，不新增 backdrop-filter；`--static` 下停动画 |
| 输入卡斜向流光（v0.2.0） | 0（主线程重绘） | `background-position`（9.6s，每循环只扫一次） | 只重绘输入卡背景（≈0.1MP），文字在 content 层不受影响 |

- 全部循环动画只用 `transform`/`opacity`（声呐环角度为注册自定义属性、输入卡流光为 `background-position`，均为 Chromium 主线程重绘，面积小）；新增的呼吸全部是 opacity/scale，不逐帧改 filter/blur。
- `blur()/filter` 均为静态声明，不参与逐帧动画；星场/星海为一次性绘制后只动 opacity/transform。
- `--static` 下：动画 `none` + `will-change:auto` → 常驻合成层回落到 ~3（背景容器 + `#root` blur + 固定装饰层）。
- `prefers-reduced-motion: reduce` 下：漂移/缩放动画停止、保留 opacity 呼吸 → 活跃合成层比 no-preference 少（star/aurora/cloud drift 停），面积仍在 v0.1.0 同量级。
- **性能实测未做**（见 §13）：新增 4 个合成层均为大面积但只做 transform/opacity；1440p p95 帧时长本轮未测，交由 verifier 用 `_tools/cdp-screencast.mjs` 抽测。

## 12. 静态断言与 CSS 解析报告

生成与校验脚本（不入包，仅工作区）：`_recon/build_skin.py`（组装+结构断言）、`_recon/validate-css.mjs`（headless Chrome CSSOM 解析）、`_recon/verify-tokens.mjs`（used-value 计算）、`_recon/contrast_final.py`（对比度）。

| 断言 | 结果 | 证据 |
|---|---|---|
| 括号配平（`{}` 与 `()`） | ✅ | 本地解析：`{`=`}`=…、`(`=`)` |
| 规则数（Chrome CSSOM 顶层） | 111 | `_recon/css-parse-report.json` → `parsedTopLevelRules` |
| 样式规则数（含 @media/@supports 内） | 98 | 本地解析（`style_rule_count`） |
| 选择器全部以 `html.dsh-vyron-skin` 开头 | ✅ 0 例外 | 本地断言 `scope_violations = []` |
| 宿主元素无布局/字号类属性 | ✅ 0 例外 | 本地断言 `forbidden_property_violations = []`（仅 sidebarCol/header 设 `position:relative` 作装饰包含块） |
| 关键帧只含 transform/opacity/自定义属性 | ✅ 0 例外 | `keyframe_property_violations = []` |
| 113 个宿主 alias/specific token 全覆盖 | ✅ 深色 113/113、浅色 113/113 | `dark_token_coverage` / `light_token_coverage` |
| Chrome 解析失败的选择器 | ✅ 0 | `css-parse-report.json` → `missingSelectors: []`（期望 88 条全命中） |
| @keyframes 数 | 18 | `css-parse-report.json` → `keyframeCount` |
| @property 注册 | 1（`--vyron-sonar-angle`） | `css-parse-report.json` → `propertyRules` |
| 媒体/特性查询 | 4 | `prefers-reduced-motion` / `prefers-reduced-transparency` / backdrop-filter 负向 / mask-composite 负向 |
| `!important` 使用 | 3 处 | 仅降级路径（static/paused/reduced-motion） |
| 文件体积 / 行数 | 101258 字节 / 2108 行 | `lib/skin.css` |
| 可计算的 token 值（Chrome used-value） | ✅ | `--vyron-a` t=0/50/100 → 0.608/0.42/0.30；玻璃底 `rgba(5,10,22,0.42)` @t50；浅色宿主 primary `rgb(10,22,40)`；声呐环 RGB 三元组展开 `rgba(87,168,255,…)`；日轨游标 `calc(50% - 5px)` |


CSS 解析用 headless Chrome 的 `CSSStyleSheet.replaceSync()`（只做语法/选择器解析，不构造 DOM、不是 mock shell）；能力探针在本机 Chrome：`backdrop-filter=true`、`mask-composite=true`、`prefers-reduced-transparency` 可识别。

### 12.1 v0.2.0 追加断言（2026-11-03，真机隔离实例实测）

| 断言 | 结果 | 证据 |
|---|---|---|
| 括号配平（`{}` / `()`） | ✅ 217/217、1578/1578 | 本地解析 |
| 规则规模 | 116692 字节 / 2376 行；@keyframes 30、@media 4、@supports 5、@property 2、`!important` 9（仅降级路径） | 本地解析 |
| 新增选择器在真实 DOM 全部命中且生效 | ✅ | 真机 computed：`.va-stars` transform=matrix（90s 慢漂）、`.va-sheen` 0.06↔0.52、`.va-earth` 0.55↔1.0、`.va-rim` 0.10↔0.62、`header::before` 0.22↔0.96、侧栏 `::before/::after` 0.28↔0.72 / 0.35↔0.85、composer `::before` 0.9↔1.0 + 角度 0→231°(5.6s)、`::after` 反向 360→180°(7.2s)、卡面 `animation: vy-composer-sweep` |
| 零 console error / exception | ✅ 0 / 0 | 每次真机采集报告 `consoleErrors: []`、`exceptions: []` |
| `--static` 全静态降级保留 | ✅ | 加 class 后 computed：sheen/earth/rim/ring/halo/侧栏/卡面 `animation: none`，静态帧 opacity 0.30/0.85/0.36/0.95/0.42/0.55 |
| **`--static` 下 `document.getAnimations()` = 0**（2026-11-03 verifier 验收补覆盖 ambient 伪元素后复测） | ✅ 0（修复前 2：`va-stars::before/after` twinkle） | `_shots/round2-skin/static-probe.json`（static.count=0） |
| `--paused` 暂停保留 | ✅ | 加 class 后 sheen/card/ring/halo/ledger/header::before/侧栏/星场伪元素 `animation-play-state: paused`；`document.getAnimations()` 21 个全部 `paused`（`static-probe.json` + `degrade-probe.json`） |
| `prefers-reduced-motion: reduce` 减动态口径 | ✅ | 真机 reduce 环境下：ambient 全部 `transform: none`、star/aurora 漂移 `animation: none`、卡面流光 `none`；sheen 仍 0.06↔0.52、ring 9s 旋转、显影 opacity 保留 |
| 呼吸亮度差 ≥3%（判据） | ✅ | 同位置隔 3.6s：正文区平均亮度 +2.38pp（相对 +37.1%）、composer 下方 +3.35pp（+43.7%）、顶部远空「亮度差>3% 的像素占比」0.46%→10.5%、视口边缘 0%→75.2%（`after-measure-3600.json`）；reduce 档同样 +2.40pp/+3.32pp 且无位移（`reduce-measure.json`） |
| composer 环流光可量化移动 | ✅ | 卡片外框环带亮像素质心位移 364.8px（相位 0→3.6s）；峰值亮度比 3.70（改前 1.15）；`cmp-composer.png` |
| 正文对比度不回退 | ✅ | 见 §10.8（正文区峰值 14.87→14.55，仍 ≥14:1） |

## 13. 覆盖范围与未验证项

**已覆盖（CSS 层面）**：应用三列框架、侧栏、顶栏/tab、会话列表、输入卡、菜单/浮层、弹窗/遮罩、代码块、Markdown token、滚动条、选区、焦点、占位符、开关/按钮/链接/状态色、浅色宿主、四档三主题、全部降级路径；v0.2.0 追加：呼吸振幅加强（rim/earth/sheen）、极光帘幕 2 层、星场慢漂、彗尾流光双弧 + 反向副光晕、卡面斜向流光、日轨游标呼吸、侧栏 micrographics 呼吸、ledger 呼吸加强、`.vyron-enter` 分区显影、reduce 减动态口径。

**v0.2.0 已在真机隔离实例验证（headless CDP，宿主真实运行）**：
1. 选择器命中：`#root header[data-window-drag]`、`[class*="sidebarCol"]`、`[data-composer-card]`、`[data-composer-seat]`、`#dsh-vyron-ambient` 12 层全部命中；新增伪元素/动画 computed 值见 §12.1。
2. 动态证据：呼吸相位差截图的量化（§12.1）、composer 环位移 364.8px、显影 5 连帧（`cmp-reveal.png`）。
3. 降级：`--static` / `--paused` / `reduce` 三路 computed 断言通过；零 console error/exception。
4. **真机 OS 环境事实**：本机 Windows「动画效果」为关 → 系统级 `prefers-reduced-motion: reduce`（详见 §8.1），因此真机皮肤走 reduce 减动态档；证据另拍 reduce 套（`_shots/round2-skin/reduce-*.png`）。

**未验证 / 需继续确认**：
1. **听感/观感的主观验收**：8.4s 呼吸在真机上是否"够明显但不烦"、极光帘幕色彩是否抢戏，需用户/verifier 主观确认；本轮只给像素级量化。
2. **浅色宿主昼面**：隔离实例只有深色宿主；浅色套（`body:not([data-ds-dark-theme])`）的呼吸/极光帘幕/流光未真机截图（CSS 静态推断：screen 混合在亮底上几乎不可见，风险低）。
3. **性能实测**：合成层数量为静态估算（§11，≤19）；1440p p95 帧时长、DevTools Layers 未测。新增 4 个合成层均为大面但只动 transform/opacity；输入卡背景 `background-position` 为主线程重绘（面积≈0.1MP），预期可接受但未实测。
4. **三主题（terra/abyss）**：呼吸/流光用的是主题变量（`--vy-a1/a2/a3/warm/ring-*`），色相自动跟随；但本机实例只拍了 orbit，terra/abyss 真机未截图。
5. **其他降级分支**：`prefers-reduced-transparency`、`@supports not (backdrop-filter)`、`@supports not (mask-composite)` 仍只做 CSS 静态断言，未在真机 OS 设置下验证。
6. **`html.vyron-enter` 真实交接时序**：本模块用"模拟加 class + CDP seek"验证 CSS 时序（0/150/400/700/900ms）；与 Lead 在 `lib/splash.js` 的真实加/移除时刻（~300ms / ~1300ms）联调以 Lead 实现为准。
7. **字体**：装饰文字用系统等宽栈；若希望 ledger chip 用 Share Tech Mono，需要 skin.css 引用 `/dsh-vyron/lib/assets/fonts/*`（当前未做）。
8. **宿主多页（设置页/插件页）**：`header[data-window-drag]` 在插件页同样存在，日轨/游标/显影会同样命中；未逐页截图。

## 14. 变更记录

- 2026-11-03 v2.0（ROUND2 细节精修 · 真机反馈"背景动态要搞/呼吸感要强/对话框流光要有"）：
  ① **根因**：本机 Windows 动画效果关闭 → 系统 reduce → v0.1.0 的 reduce 全静态兜底让用户真机 0 动态；顺带发现历史真机截图全是静态帧。
  ② **呼吸振幅翻倍以上**：rim 0.10↔0.62（+1.4% scale）、earth 0.55↔1.0（+2.2% scale）、sheen 0.06↔0.52（±1.5% scale）；新增 `.va-sheen::before/::after` 2 层极光帘幕（84s/90s 横移）、星场 90s 慢漂 2.4vmax、日轨游标 8.4s 呼吸、侧栏 micrographics 呼吸 + 位流漂移、ledger 呼吸 0.60↔1.0。
  ③ **composer 彗尾流光**：`::before` 2 段窄高亮弧（白热 34°/生物青 166°）5.6s/圈、环亮 0.9–1.0；`::after` 反向 7.2s 副光晕 + 6.4s 呼吸 0.28↔0.72；focus-within ×1.2；卡面斜向流光（≤0.06）9.6s 扫过。
  ④ `.vyron-enter` 分区显影：sidebar 0ms / topbar 50ms / composer 240ms / 日轨增亮 340ms / ambient 900ms 淡入，全部 ≤900ms + fill both。
  ⑤ **reduce 口径改为"减动态"**（Lead 裁决）：停位移/缩放/漂移，保留 opacity 呼吸 + 低速流光；`--static` 仍全静态。
  ⑥ 对比度保险：`va-sheen` 中央正文带蒙版；正文区呼吸峰值对比度 14.55:1（v0.1.0 14.87:1，仍 ≥14:1）。
- 2026-11-03 v1.1（真机首轮截图精修）：① `#root` 毛玻璃 26→13px、星场改大而稀（22 亮星 + 26 细星）、新增 `#root::before` 18 颗前层边缘星点、云/sheen/rim/earth 亮度上调（目标：真机一眼看到星+地球弧+云）；② abyss 去绿——强调由 bio 绿青改青蓝（business/rim `#46d3e0`、link `#6fe0ff`、装饰/环/星点冷色化）；③ 玻璃档文字提亮改为主题变量 `--vy-glass-label-*`；④ 主题契约与 client.js 对齐（skin≠off 全档写入）；⑤ 对比度按"现实上界/理论最坏上界"双界重测。
- 2026-11-03 v1.0：首版交付。四档×三主题×明暗宿主；113 alias/specific token 全映射；12 层星海背景；full 装饰；声呐环；9 条降级路径；对比度实测无失败项。
