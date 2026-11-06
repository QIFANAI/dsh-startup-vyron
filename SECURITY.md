# 安全策略

## 报告问题

- 一般缺陷：直接开 [Issue](https://github.com/QIFANAI/dsh-startup-vyron/issues)。
- 安全敏感问题（XSS 注入、目录穿越、权限越界、配置写入竞争、任意文件读取等）：
  请**不要**在公开 Issue 中贴完整利用代码，先通过 GitHub 私信 / Security Advisory 联系维护者。

## 本插件的安全边界（设计即约束）

- 宿主侧只注册 `/dsh-vyron/*` 路由；静态文件只允许 `lib/assets` 与 `preview` 两个根，带目录穿越守卫。
- 配置只写 `%USERPROFILE%\.dsh\dsh-startup-vyron.json`，原子写；不接受任意路径。
- 启动层为同源 iframe，注入内容来自本地构建产物，不加载远程脚本；运行期零外部网络请求。
- 音轨为本地 WAV，无第三方采样。

## 支持版本

| 版本 | 支持 |
|---|---|
| 0.2.x | ✅ |
| < 0.2 | ❌ |
