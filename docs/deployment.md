# 部署与上线

本文档覆盖 Cloudflare Pages 部署、环境变量、图片上传、地图、统计接口、安全迁移、上线检查和回滚。仓库默认不提交 `wrangler.toml`，生产绑定与变量由 Cloudflare Pages Dashboard 管理；只有采用命令行部署或固定本地 Wrangler 配置时，才复制 `wrangler.example.toml`。

## 快速路径

1. 在 Cloudflare Pages 创建项目，连接仓库。
2. 构建命令设为 `npm ci && npm run build`，输出目录设为 `dist`。
3. 在 Pages Dashboard 绑定 D1，变量名固定为 `DB`。
4. 在 D1 Console 执行 `schema.sql`，生产环境不要执行 `seed.dev.sql`。
5. 配置 `SESSION_SECRET`，并按需配置管理员、应用访问、同步、统计和图片相关变量。
6. 本地执行 `npm run check`，再部署 Preview / Staging 验收。
7. 备份生产 D1 后切换生产部署。

## 本地与配置源

默认本地开发不需要 `wrangler.toml`：

```bash
npm ci
npm start
```

本地预览 Cloudflare Functions / D1 行为：

```bash
npm run db:init
wrangler d1 execute diary-db --local --file=seed.dev.sql
npm run start:remote
```

如需命令行部署或固定本地 Wrangler 配置：

```bash
cp wrangler.example.toml wrangler.toml
```

填入真实 `database_id`、D1/R2 绑定和变量后再使用 Wrangler 部署。带着 `wrangler.toml` 使用 Wrangler 部署时，Cloudflare 会把它视为项目配置真源。

## Cloudflare 配置

必需绑定与 secrets：

- D1 绑定：`DB`
- Secret：`SESSION_SECRET`

建议配置：

- `ADMIN_BOOTSTRAP_PASSWORD`：首次管理员登录或重置管理员密码
- `APP_BOOTSTRAP_PASSWORD`：首次应用访问密码或重置应用访问密码
- `SYNC_ACCESS_TOKEN`：APK / 本地设备手动同步到线上
- `STATS_API_KEY`：跨域或外部读取统计接口

可选变量：

- `APP_TIMEZONE`：默认 `Asia/Shanghai`
- `VITE_AMAP_WEB_KEY`
- `VITE_AMAP_JS_KEY`
- `VITE_AMAP_SECURITY_CODE`

## 数据库与迁移

新库直接执行：

```bash
wrangler d1 execute diary-db --remote --file=schema.sql
```

旧库升级到当前版本时，至少确认执行过：

```bash
wrangler d1 execute diary-db --remote --file migrations/2026-04-18-add-entry-uuid.sql
wrangler d1 execute diary-db --remote --file migrations/2026-04-19-add-entry-deleted-at.sql
```

发布前备份生产 D1：

```bash
wrangler d1 export diary-db --remote --output backups/diary-db-$(date +%F-%H%M).sql
```

## 安全迁移

当前版本使用服务端会话和密码哈希：

- 管理员密码与应用密码不再明文下发到前端。
- 管理接口与写接口依赖服务端会话。
- 统计接口默认不匿名开放。
- 旧 `admin_password` / `app_password` 会在成功登录后自动迁移为哈希。

忘记密码或需要主动失效旧密码时：

1. 配置 `ADMIN_BOOTSTRAP_PASSWORD`。
2. 如需重置应用访问密码，配置 `APP_BOOTSTRAP_PASSWORD`。
3. 执行 `reset-password.sql`。
4. 使用 bootstrap 密码登录。
5. 立即在管理员面板中改成正式密码。

确认迁移完成后，可清理旧明文字段：

```sql
DELETE FROM app_settings WHERE setting_key IN ('admin_password', 'app_password');
```

## 图片上传

推荐使用 R2。Pages Dashboard 中添加 R2 bucket binding：

- 变量名：`IMAGES_BUCKET`
- Bucket：选择你的图片桶

R2 模式下，上传接口返回站内地址：

```text
/api/images/{key}
```

如果没有绑定 `IMAGES_BUCKET`，系统会回退到 Cloudflare Images，需要：

- Secret：`IMAGES_API_TOKEN`
- 变量：`IMAGES_ACCOUNT_ID`
- 可选变量：`IMAGES_DELIVERY_URL`、`IMAGES_VARIANT`（默认 `public`）

验收：管理员登录后上传 1 张图片，保存并刷新页面；未登录调用 `POST /api/uploads/image` 应返回 `401`，R2 图片地址 `/api/images/{key}` 应返回 `200`。

## 高德地图

本地配置：

```bash
cp .env.example .env.local
```

在 `.env.local` 或 Cloudflare Pages 环境变量中配置：

```bash
VITE_AMAP_WEB_KEY=你的web服务key
VITE_AMAP_JS_KEY=你的js-key
VITE_AMAP_SECURITY_CODE=你的security-js-code
```

Preview 与 Production 建议使用不同 key。验收时打开地图选点弹窗，确认地图加载、定位、选点和地址回填正常。

## 统计接口

`GET /api/stats` 返回日记总数、记录天数、连续记录天数和起止时间。访问必须满足以下其一：

- 已登录管理员会话
- 有效 `STATS_API_KEY`

跨域读取只能使用 API Key。支持两种传递方式：

```text
Authorization: Bearer YOUR_API_KEY
X-API-Key: YOUR_API_KEY
```

接口返回 `Cache-Control: no-store`。不配置 `STATS_API_KEY` 时，仅允许管理员登录后访问。

## 上线检查

本地检查：

```bash
npm run check
```

`npm run check` 已包含 lint、函数测试、UI 测试、生产构建、构建产物 smoke、发布配置校验与 Cloudflare 本地配置检查。默认 Dashboard 管理模式下，`check:release` 和 `check:cloudflare` 会通过并提示人工核对 Dashboard 绑定；这不是失败。

如需单独复核：

```bash
npm run check:cloudflare
```

如已登录 Wrangler，且没有本地 `wrangler.toml`：

```bash
npm run check:cloudflare:remote -- --database diary-db
```

如使用本地 `wrangler.toml` 作为配置真源：

```bash
npm run check:cloudflare:remote
```

Preview / Staging 验收：

```bash
npm run smoke:remote -- https://你的-preview-域名
SMOKE_ADMIN_PASSWORD='你的密码' npm run smoke:remote:admin -- https://你的-preview-域名
```

人工核对项：

- 首页、欢迎页、密码页流程正常。
- 管理员登录、退出、新建、编辑、删除、隐藏/显示日记正常。
- 搜索、快速筛选、归纳视图、导出符合后台设置。
- 图片上传、回显、删除链路正常。
- 移动端输入、定位、滚动恢复正常。
- `favicon.svg`、`apple-touch-icon.png`、`icon-192.png`、`icon-512.png`、`manifest.webmanifest` 与 `sw.js` 可访问。
- 响应头包含 `Content-Security-Policy`、`Strict-Transport-Security`、`X-Content-Type-Options`。
- API 响应返回 `Cache-Control: no-store`。

## 发布与回滚

推荐先部署 Preview / Staging，验收后再切生产。历史版本切到最新版时：

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c master || git switch master
git merge --ff-only main
npm run check
git push origin master
```

如果 `master` 已存在且不是快进关系，使用普通 merge。发布前记录上一版提交，例如 `PREV_SHA`。

如需回滚，优先使用 revert：

```bash
git switch master
git revert --no-edit RELEASE_SHA
git push origin master
```

如出现数据异常，使用发布前 D1 备份恢复。

发布后检查 Cloudflare Pages Functions 日志，抽查最近新增的一篇日记，确认读写一致。需要留档时执行：

```bash
npm run report:release
```
