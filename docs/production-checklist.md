# 上线检查清单

适用于 Cloudflare Pages + Functions + D1 的正式发布前核对。

## 1. 代码与构建

- 本地工作区已确认需要保留的改动，没有临时调试文件。
- 已执行 `npm run check`，并确保 `lint`、函数测试、UI 测试、生产构建、`smoke:dist`、`check:release` 与 `check:cloudflare` 全部通过。
- 如构建时出现 Browserslist 数据过旧提示，已执行 `npm run update:browserslist` 并重新构建确认告警消失。
- 生产构建产物来自当前待发布提交，没有手工修改 `dist`。

## 2. Cloudflare 配置

- 如需单独复核，可再次执行 `npm run check:cloudflare`。
- Pages 项目已绑定 D1：变量名为 `DB`。
- 已配置 `SESSION_SECRET`。
- 已按需配置 `ADMIN_BOOTSTRAP_PASSWORD`、`APP_BOOTSTRAP_PASSWORD`、`STATS_API_KEY`。
- 如启用图片上传，已配置 `IMAGES_ACCOUNT_ID` 与 `IMAGES_API_TOKEN`，并确认交付域名可访问。
- `wrangler.toml` 中的变量与线上项目保持一致，不依赖本地临时值。
- 如本机已登录 wrangler，已执行 `npm run check:cloudflare:remote` 验证 Pages 项目与 D1 远端存在性。

## 3. 数据与安全

- 生产 D1 已完成备份。
- 已执行当前版本对应的 `schema.sql`，未误执行 `seed.dev.sql`。
- 管理员与应用访问密码已完成初始化，不再依赖默认口令。
- 已按 [security-migration.md](/Users/zhouzhou/Downloads/edit/diary-web/docs/security-migration.md) 完成密码迁移核验。

## 4. 发布验收

- Preview / Staging 地址已执行 `npm run smoke:remote -- https://你的-preview-域名` 并通过。
- 如已具备管理员口令，已执行 `SMOKE_ADMIN_PASSWORD='你的密码' npm run smoke:remote:admin -- https://你的-preview-域名` 并通过。
- 首页可正常打开，欢迎页/密码页流程符合当前配置。
- 键盘可访问性正常：`skip-link` 可聚焦，主要交互控件有明确焦点样式。
- 浏览器启用 `prefers-reduced-motion` 时，欢迎页和主界面不会保留强制动画。
- 管理员登录、退出登录正常。
- 新建、编辑、删除、隐藏/显示日记正常。
- 搜索、快速筛选、归纳视图、导出功能符合当前后台设置。
- 图片上传、回显、删除链路正常。
- 移动端输入、定位、滚动恢复正常。
- 生产环境浏览器控制台无新增未处理报错；定位/地图类诊断日志仅在开发环境输出。
- `GET /api/stats` 已按预期鉴权并返回数据。
- `favicon.svg`、`apple-touch-icon.png`、`icon-192.png`、`icon-512.png` 与 `manifest.webmanifest` 可访问，独立窗口模式入口正常。
- `sw.js` 可访问且成功注册，断网时仍可打开应用壳层与最近公开内容快照。
- 非 standalone 状态下，设备与离线卡片能显示浏览器安装按钮或“添加到主屏幕”提示。
- 浏览器响应头已生效：`Content-Security-Policy`、`Strict-Transport-Security`、`X-Content-Type-Options`。
- API 响应已返回 `Cache-Control: no-store`，登录态与设置接口不会被中间层缓存。

## 5. 发布后观察

- 检查 Cloudflare Pages Functions 日志，确认没有持续性报错。
- 抽查最近新增的一篇日记，确认读写一致。
- 已执行 `npm run report:release` 或按团队方式保存当次发布报告。
- 如有异常，按 [release-master-cutover.md](/Users/zhouzhou/Downloads/edit/diary-web/docs/release-master-cutover.md) 执行回滚。
