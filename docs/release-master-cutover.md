# 历史版本到最新版的发布切换（含 master 切换）

本文档用于把线上历史版本平滑过渡到最新版，并将最新版作为 `master` 发布基线。

## 目标

1. 数据不丢失（先备份 D1）
2. 先验收再切流（先 Preview / Staging）
3. 回滚可执行（保留前一个生产版本提交）

## 0. 前置条件

1. 本地分支已经是最新版代码，且 `npm run check` 通过。
2. 已准备好 Cloudflare Secrets：
`SESSION_SECRET`、`ADMIN_BOOTSTRAP_PASSWORD`、`APP_BOOTSTRAP_PASSWORD`（可选）、`STATS_API_KEY`（可选）。
3. 已确认 `schema.sql` 是当前生产期望结构。
4. 如果生产 D1 是旧版本沿用的历史数据库，发布新版前必须先执行 `migrations/2026-04-18-add-entry-uuid.sql`；否则新版 APK 的远程绑定与手动同步对旧云端内容的兼容性无法保证。

## 1. 生产数据备份（必须）

以生产 D1 数据库为例先导出 SQL：

```bash
wrangler d1 export diary-db --remote --output backups/diary-db-$(date +%F-%H%M).sql
```

如果你使用的是别名或不同数据库名，替换命令中的 `diary-db`。

如生产库是旧版本升级而来，在继续之前先执行：

```bash
wrangler d1 execute diary-db --remote --file migrations/2026-04-18-add-entry-uuid.sql
```

## 2. 先部署 Preview/Staging

1. 在 Preview 环境部署最新版。
2. 在 Preview 绑定同结构数据库（不要直接连生产库做破坏性验证）。
3. 按以下顺序验证：
- 先执行 `npm run check`
- 如需单独复核 Cloudflare 本地配置，可再执行 `npm run check:cloudflare`
- 如当前机器已登录 wrangler，再执行 `npm run check:cloudflare:remote`
- 先执行 `npm run smoke:remote -- https://你的-preview-域名`
- 如已具备管理员口令，再执行 `SMOKE_ADMIN_PASSWORD='你的密码' npm run smoke:remote:admin -- https://你的-preview-域名`
- 管理员登录
- 新建/编辑/删除日记
- 图片上传与回显
- 移动端写作（标题、Markdown、标签、定位）
- 导入导出
- 统计接口鉴权

完整核对项可参考 [production-checklist.md](/Users/zhouzhou/Downloads/edit/diary-web/docs/production-checklist.md)。

## 3. master 切换（让最新版成为 master）

假设当前最新版在 `main`：

```bash
git fetch origin
git switch main
git pull --ff-only origin main

git switch -c master || git switch master
git merge --ff-only main
```

如果 `master` 已存在且不是快进关系，用普通 merge：

```bash
git switch master
git merge main
```

验证：

```bash
git log --oneline --decorate -n 5
npm run check
```

其中 `npm run check` 已包含构建产物 smoke test、发布配置校验与 Cloudflare 本地配置检查。

推送：

```bash
git push origin master
```

## 4. 生产发布

1. 在 Cloudflare Pages 将生产分支指向 `master`。
2. 触发生产部署。
3. 发布后执行 smoke test：
- 打开首页与登录流程
- 新建一篇测试日记并删除
- 上传 1 张图片并确认可访问
- 验证移动端输入与保存
- 验证统计接口返回

## 5. 回滚方案

1. 记录当前发布前提交（例如 `PREV_SHA`）。
2. 如需回滚，优先使用 `revert` 而不是重写历史：

```bash
git switch master
git revert --no-edit RELEASE_SHA
git push origin master
```

3. 如出现数据异常，使用第 1 步备份 SQL 恢复 D1。

## 6. 发布后清理

1. 删除不再需要的临时密钥。
2. 执行 `npm run report:release`，归档当次发布记录（提交号、发布时间、回滚点、负责人）。
3. 把本文件中的实际发布命令沉淀到团队 SOP。
