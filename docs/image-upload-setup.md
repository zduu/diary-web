# 图片上传配置（R2 优先）

本文档用于把前端图片上传接入 Cloudflare R2，适用于 Cloudflare Pages Functions。

## 1. 推荐方案：R2 Bucket 绑定

当前项目会优先检测 `IMAGES_BUCKET` 绑定。

只要绑定存在，图片上传就会自动走 R2，不需要再配置：

- `IMAGES_ACCOUNT_ID`
- `IMAGES_API_TOKEN`
- `IMAGES_DELIVERY_URL`

### Wrangler 示例

```toml
[[r2_buckets]]
binding = "IMAGES_BUCKET"
bucket_name = "your-images-bucket"
```

### Pages 控制台

在 Cloudflare Pages 项目的 `Settings -> Functions -> R2 bucket bindings` 中添加：

- 变量名：`IMAGES_BUCKET`
- Bucket：选择你的图片桶

## 2. 上传后的访问方式

R2 模式下，后端会返回站内地址：

`/api/images/{key}`

前端不需要额外改动，只要正常使用上传返回的 URL 即可。

## 3. 兼容回退：Cloudflare Images

如果没有绑定 `IMAGES_BUCKET`，系统会回退到旧的 Cloudflare Images 方案。

这时仍然需要：

1. Secret（必填）
- `IMAGES_API_TOKEN`

2. 环境变量（必填）
- `IMAGES_ACCOUNT_ID`

3. 环境变量（可选）
- `IMAGES_DELIVERY_URL`
- `IMAGES_VARIANT`（默认 `public`）

### Legacy Token 权限建议

创建一个最小权限 API Token，至少包含：

- Account scope
- Cloudflare Images: Edit

## 4. 验收步骤

1. 管理员登录。
2. 新建日记并上传 1 张图片。
3. 保存后刷新页面，图片仍能正常访问。
4. 校验接口：`POST /api/uploads/image` 未登录应返回 401。
5. 如启用了 R2，访问上传返回的 `/api/images/{key}` 应返回 `200`。

## 5. 常见问题

1. 返回“图片上传功能未配置”
说明当前既没有绑定 `IMAGES_BUCKET`，也没有完整配置 Cloudflare Images。

2. R2 已绑定但图片打不开
先确认 Pages 项目里绑定名是否确实是 `IMAGES_BUCKET`。

3. 上传成功但图片无法访问
如使用 Legacy Images，优先检查 `IMAGES_DELIVERY_URL` 是否正确；不确定时先移除该变量让系统使用默认 `variants`。
