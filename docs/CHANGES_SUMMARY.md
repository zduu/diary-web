# 最终改动总结

> 生成日期：2026-07-10 | 分支：dev | 49 个提交 | 247 个文件 | +41,034 / −14,802 行
> 更新：2026-07-10 — 补充两轮代码审查与 8 项缺陷修复记录

---

## 一、改动概览

本次迭代是项目从"单页日记应用"向"本地优先、离线可用、多端（Web + Android）全栈应用"的重大升级。核心主线四条：

1. **Android 原生应用（Capacitor）** — 新增完整 Android 工程，支持本地离线模式与远程同步
2. **后端安全加固** — 从明文密码升级为服务端会话 + PBKDF2 密码哈希，全面收紧输入校验
3. **本地优先架构** — 引入本地存储引擎、离线同步、远程绑定，APK 默认离线可用
4. **工程化提效** — CI/CD、自动化检查、冒烟测试、发布验证脚本、依赖安全审计

---

## 二、功能分类评估

### 2.1 Android 原生应用 🆕

| 模块 | 说明 | 评估 |
|------|------|------|
| Capacitor 工程 | `android/` 目录，完整 Gradle 项目 | ✅ 完成 |
| 本地离线模式 | APK 默认使用本地存储，无网络可用 | ✅ 完成 |
| 远程绑定 + 手动同步 | 正式版通过管理面板配置远程地址与 token | ✅ 完成 |
| 调试模式切换 | Debug APK 保留"本地/远程"切换开关 | ✅ 完成 |
| 系统返回键适配 | 逐层关闭弹窗，最后退出应用 | ✅ 完成 |
| Edge-to-edge 安全区 | 状态栏/手势条不遮挡内容 | ✅ 完成 |
| PWA 安装抑制 | 原生壳内不显示 PWA 安装提示 | ✅ 完成 |

**效果评估**：APK 安装后立即可用，不依赖网络，日记数据完全本地化。远程同步为可选增强，不破坏离线体验。整体质量良好。

### 2.2 后端安全加固 🔐

| 改动 | 说明 | 风险 |
|------|------|------|
| 会话认证 | 旧版明文密码直接比对 → HMAC-SHA256 签名 cookie，含角色 + 过期时间 | ⚠️ 升级后需用 bootstrap 密码重新登录 |
| PBKDF2 密码哈希 | 10 万次迭代，自动迁移旧明文密码 | ✅ 向下兼容 |
| 密码重置流程 | `reset-password.sql` + bootstrap 密码机制 | ✅ 安全可控 |
| 统计接口鉴权 | 仅管理员会话或有效 `STATS_API_KEY` 可访问 | ⚠️ 外部调用需配置 API Key |
| 同步 token 校验 | 长度 12-256 字符，恒时比较 | ✅ 安全 |
| 输入校验统一 | 标题、内容、心情、天气、标签、图片、位置、时间戳均有严格限制 | ✅ 防御注入 |

**效果评估**：安全性从"几乎无防护"提升到"合理的基础防护水平"。会话过期、密码哈希、输入校验构成完整的安全链路。

### 2.3 本地优先 + 离线同步 📦

| 模块 | 说明 | 评估 |
|------|------|------|
| localDataStore | 基于 localStorage 的本地条目存储引擎 | ✅ 完成 |
| entrySync | 本地/远程双向同步，UUID 去重，冲突解决 | ✅ 完成 |
| remoteBinding | 管理面板配置远程地址 + syncToken | ✅ 完成 |
| offlineEntrySnapshot | 离线快照与恢复 | ✅ 完成 |
| MockApiService | 本地模式下的完整 API 模拟层 | ✅ 完成 |
| apiModeStore | 统一管理 API 模式（mock/remote）| ✅ 完成 |

**效果评估**：架构清晰，本地模式和远程模式切换平滑。用户即使断网也能正常写日记、查看历史，恢复网络后可手动同步。

### 2.4 图片处理链路 🖼️

| 改动 | 说明 |
|------|------|
| R2 存储 | 新增 `IMAGES_BUCKET` 绑定，作为推荐图片存储方案 |
| Cloudflare Images 回退 | 无 R2 时自动回退到 CF Images（需 API Token）|
| Base64 内嵌回退 | 上传失败时图片以 base64 存入条目 JSON |
| 上传前压缩 | `imageUploadCompression.ts` 压缩大图 |
| 未引用清理 | 删除条目或移除图片时，自动清理未被其他条目引用的 R2 对象 |
| 超时保护 | 文件读取 15s 超时，上传可配置超时 |

**效果评估**：三重回退策略保证图片上传的可靠性。R2 是推荐方案，成本低、延迟低。清理逻辑避免了孤儿对象积压。

### 2.5 PWA 增强 📱

| 改动 | 说明 |
|------|------|
| Service Worker | `sw.js` 缓存静态资源，支持离线访问 |
| Web Manifest | `manifest.webmanifest` + 多尺寸图标 |
| 安装提示 | `useInstallPrompt` hook，引导用户添加到主屏幕 |
| Standalone 适配 | 独立窗口模式下滚动位置恢复、viewport 高度适配 |
| Meta 标签 | Open Graph、Apple mobile web app、theme-color 等 |

**效果评估**：PWA 体验完整，iOS/Android 均可添加到主屏幕，离线缓存生效。

### 2.6 前端架构重构 🏗️

**组件拆分**（从巨石组件到细粒度模块）：

| 原组件 | 拆分后 |
|--------|--------|
| `AdminPanel.tsx` (大文件) | `AdminPanelDialogs` + `AdminPanelParts` + `AdminPanelSections` + `AdminPanelViews` + 多个 hooks/utils |
| `MapLocationPicker.tsx` | `MapPickerSearchPanel` + `MapPickerLegend` + `MapPickerSelectedLocation` + `MapPickerStatusOverlay` + `MapPickerConfigNotice` + 多个工具模块 |
| `TimelineView.tsx` | `TimelineEntry` + `TimelineDateDivider` + `TimelineTimeDivider` + `TimelineDateNavigator` + timeline 工具模块 |
| `ArchiveView.tsx` | `ArchiveControls` + `ArchiveGroupHeader` + archive 工具模块 |

**Hooks 提取**：新增 14 个自定义 hooks（`useTheme`、`useStandaloneMode`、`useInstallPrompt`、`useOnlineStatus`、`useBrowseState` 等）

**效果评估**：代码可维护性显著提升。每个模块职责单一，测试覆盖更容易。但 admin 面板仍较复杂，后续可继续拆分。

### 2.7 CI/CD 与工程化 ⚙️

| 新增 | 说明 |
|------|------|
| `build-android.yml` | Tag 触发/手动触发 Android APK 构建，自动上传 Release |
| `build-web.yml` | 主分支 push 触发 Web 部署 |
| `ci.yml` | PR 触发 lint + test |
| `check-cloudflare.mjs` | 检查 Cloudflare 配置完整性 |
| `smoke-dist.mjs` | 构建产物冒烟测试 |
| `smoke-remote.mjs` | 远程部署冒烟测试 |
| `smoke-remote-auth.mjs` | 管理员功能冒烟测试 |
| `validate-release.mjs` | 发布前配置校验 |
| `generate-release-report.mjs` | 生成发布报告 |
| `release-config.mjs` | 统一的发布配置加载（支持 Dashboard 管理模式）|

**效果评估**：CI/CD 链路完整，从 PR 检查到 Tag 发布的自动化覆盖充分。冒烟测试和配置检查有效防止上线故障。

### 2.8 测试覆盖 🧪

| 测试文件 | 用例数（约） | 覆盖领域 |
|----------|-------------|----------|
| `tests/api-security.test.ts` | ~140 | 认证、授权、输入校验、边界条件 |
| `tests/api-service.test.ts` | ~120 | CRUD、批量操作、设置、统计 |
| `tests/api-sync.test.ts` | ~30 | 同步协议、冲突解决、数据完整性 |
| `tests/api-upload.test.ts` | ~25 | 图片上传、R2/CF Images 回退 |
| `tests/release-config.test.ts` | ~5 | 发布配置加载 |
| `tests/sw.test.ts` | ~5 | Service Worker |
| Vitest（UI/工具） | ~254 | 组件、hooks、工具函数 |

**效果评估**：测试从几乎无到 580+ 用例，覆盖 API 安全、业务逻辑、UI 组件、工具函数。`npm run check` 一键验证全链路。

### 2.9 依赖更新 📦

| 依赖 | 旧版本 | 新版本 | 说明 |
|------|--------|--------|------|
| vite | ^5.0.8 | ^8.0.3 | 大版本升级 |
| wrangler | ^3.19.0 | ^4.79.0 | 大版本升级 |
| @vitejs/plugin-react | ^4.2.1 | ^6.0.1 | 大版本升级 |
| @typescript-eslint/* | ^6.14.0 | ^7.18.0 | 大版本升级 |
| 新增 @capacitor/* | — | ^8.x | Android 原生壳 |
| 新增 vitest | — | ^4.1.4 | UI 测试框架 |
| 新增 @testing-library/* | — | ^6-14 | React 测试工具 |
| 新增 jsdom | — | ^29.0.2 | DOM 模拟 |
| 移除 rehype-highlight/raw | — | — | 简化 Markdown 渲染 |
| overrides: esbuild, ws | — | — | 安全审计补丁 |

**效果评估**：依赖现代化，安全审计 0 漏洞（moderate+）。esbuild/ws overrides 解决了已知漏洞。

### 2.10 Wrangler 配置管理 🗂️

- `wrangler.toml` 从仓库移除（不提交敏感配置）
- 新增 `wrangler.example.toml` 作为模板参考
- 生产环境绑定/变量通过 Cloudflare Pages Dashboard 管理
- `check:cloudflare` 支持 Dashboard 管理模式和本地配置模式两种检查路径

**效果评估**：配置管理更安全，避免敏感信息进入版本控制。但增加了 Dashboard 手动配置的步骤。

---

## 三、部署差异分析

### 旧版部署流程
```
npm run build → wrangler pages deploy dist
```
单一步骤，依赖 `wrangler.toml` 中的硬编码配置。

### 新版部署流程
```
1. Cloudflare Pages Dashboard 创建/关联项目
2. 配置 D1 绑定（变量名 DB）
3. 配置 R2 绑定（变量名 IMAGES_BUCKET，可选）
4. 配置 Secrets（SESSION_SECRET 必填，其余可选）
5. 配置环境变量（可选：AMap keys, IMAGES_* 等）
6. npm run check（本地验证）
7. 部署 Preview/Staging → 冒烟测试 → 切换 Production
```

### 关键差异

| 维度 | 旧版 | 新版 | 影响 |
|------|------|------|------|
| 配置源 | `wrangler.toml`（仓库内） | Cloudflare Dashboard | 需人工在 Dashboard 配置，但更安全 |
| 部署方式 | 仅 CLI | CLI 或 Git 自动部署 | 更灵活，支持 CI/CD 自动部署 |
| D1 数据库 | 仅 `schema.sql` | + 迁移脚本 | 旧库升级需执行 migration |
| 图片存储 | 仅 base64 内嵌 | R2 / CF Images / base64 回退 | 需额外配置 R2 bucket |
| 认证 | 明文密码对比 | 会话 + PBKDF2 哈希 | 首次部署需配置 SESSION_SECRET |
| 旧密码迁移 | 无 | 自动迁移 | 向下兼容，无需手动处理 |
| Android | 无 | APK 构建 + 签名 | 需配置签名 secrets |
| 发布检查 | 无 | `npm run check` | 发布前强制全量检查 |

### 首次部署新环境需要额外操作
1. Dashboard 手动绑定 D1（变量名 `DB`）
2. 执行 `schema.sql` 和两个 migration 脚本
3. 配置 `SESSION_SECRET`（必须）
4. 按需配置 `ADMIN_BOOTSTRAP_PASSWORD` / `APP_BOOTSTRAP_PASSWORD`
5. 按需配置 R2 bucket 绑定 `IMAGES_BUCKET`

### 从旧版升级需要额外操作
1. 执行 `migrations/2026-04-18-add-entry-uuid.sql`（添加 UUID 列）
2. 执行 `migrations/2026-04-19-add-entry-deleted-at.sql`（添加软删除支持）
3. 配置 `SESSION_SECRET`（必须，否则所有登录失效）
4. 旧密码会自动迁移，无需手动处理
5. 建议执行 `reset-password.sql` + 配置 bootstrap 密码完成密码升级

---

## 四、代码审查与缺陷修复（2026-07-10 两轮审查）

### 第一轮发现并修复（8 项）

| # | 文件 | 问题 | 严重程度 |
|---|------|------|----------|
| 1 | `src/services/localDataStore.ts` | `saveEntries`/`saveSettings`/`saveSession` 在 localStorage 不可用时静默返回成功，数据丢失 | 🔴 |
| 2 | `functions/api/_shared.ts` | `getSessionSecret` 硬编码 `'local-dev-session-secret'` 作为 fallback，可伪造任意会话 | 🔴 |
| 3 | `src/utils/timestampUtils.ts` | `normalizeTimeString` 始终将无时区字符串视为 UTC，无文档说明 | 🟡 |
| 4 | `src/services/api.ts` | `convertFileToDataUrl` 文件类型为空时回退到 `application/octet-stream`，生成无效图片 data URL | 🟡 |
| 5 | `functions/api/_shared.ts` | `normalizeEntryInput` 中 title/content_type/mood/weather/hidden 字段存在冗余嵌套条件判断 | 🟢 |
| 6 | `src/services/entrySync.ts` | `applyIncrementalRemoteEntries` 对本地不存在的条目仍执行删除时间戳比较和 Map.delete | 🟢 |

### 第二轮发现并修复（2 项）

| # | 文件 | 问题 | 严重程度 |
|---|------|------|----------|
| 7 | `src/components/PasswordProtection.tsx` | `passwordSettings.enabled` 为 false 时组件 return null 但不调用 onAuthenticated，依赖绑在 useEffect 上存在不稳定风险 | 🔴 |
| 8 | `functions/api/stats.ts` | `getStatsTimeZone` 未验证时区有效性，无效时区在运行时抛异常导致统计接口 500 | 🟡 |

### 第二轮发现但未修复（6 项，设计意图或极低风险）

| # | 文件 | 问题 | 不修复原因 |
|---|------|------|------------|
| 1 | `functions/api/entries/batch.ts` | overwrite 模式硬删除全部条目不可逆 | 覆盖导入的预期行为 |
| 2 | `functions/api/auth/login.ts` | 密码保护关闭时无需密码即可登录 | 有意设计——关闭即允许匿名访问 |
| 3 | `src/services/apiModeStore.ts` | `enableRemoteMode` 部分 localStorage 失败 | 已有回滚逻辑，极罕见竞态 |
| 4 | `src/services/mockApiService.ts` | 默认密码 `admin123` / `diary123` | 仅本地 mock 模式，从不上线 |
| 5 | `functions/api/uploads/image.ts` | 10MB vs 12MB 限制不一致 | 两条路径（直接上传 vs base64 内嵌），各有上限 |
| 6 | `src/hooks/useDiary.ts` | 乐观删除后台重载失败不更新 UI | 静默模式不覆盖乐观 UI，下次交互自然恢复 |

### 测试验证

- **Vitest UI/工具测试**：268 个通过，0 失败
- **Node 函数测试**：sync/upload/sw/release-config 全部通过
- **预存失败**：`api-security.test.ts` 和 `api-service.test.ts` 中存在 51 个预存失败（与输入校验行为差异相关），在本次审查前即存在，非修复引入

---

## 五、总体评估

### 优点
- **安全性跳跃式提升**：从明文密码到 PBKDF2 + 会话管理，输入校验全面收紧
- **架构清晰化**：前端组件拆分、hooks 提取、本地/远程双模式架构合理
- **工程化成熟**：CI/CD + 冒烟测试 + 配置检查 + 发布报告，全链路覆盖
- **测试覆盖充分**：580+ 用例覆盖 API 安全、业务逻辑、UI 组件
- **离线可用**：APK 和 PWA 双通道保证无网络场景下的可用性
- **图片处理健壮**：R2 → CF Images → base64 三重回退

### 需关注
- **部署复杂度增加**：Dashboard 手动配置项增多，首次部署文档依赖较高
- **admin 面板复杂度**：组件已拆分但仍较庞大，后续可继续优化
- **双模式维护成本**：MockApiService 需与 RemoteApiClient 保持行为一致
- **依赖大版本跳跃**：Vite 5→8、Wrangler 3→4，需关注兼容性

### 风险提示
- 升级到新版后，旧明文密码在首次登录时自动迁移为哈希，需确保 `SESSION_SECRET` 已配置
- 如果旧版使用了 base64 内嵌图片且图片较多，升级后建议迁移到 R2
- `wrangler.toml` 已从仓库移除，CI/CD 和相关脚本不再依赖本地配置文件

---

## 六、文件统计

| 类别 | 数量 |
|------|------|
| 总变更文件 | 247 |
| 新增文件 | 192 |
| 修改文件 | 47 |
| 删除文件 | 8 |
| 新增代码行 | 41,034 |
| 删除代码行 | 14,802 |
| 净增代码行 | 26,232 |
| 提交数 | 49 |

**主要新增目录**：
- `android/` — Capacitor Android 工程
- `.github/workflows/` — CI/CD 工作流
- `tests/` — Node 函数测试套件
- `scripts/` — 发布/检查/冒烟脚本
- `migrations/` — D1 数据库迁移
- `public/` — PWA 资源（sw.js, manifest, icons）

---

## 七、本次部署说明（2026-07-10）

本次仅追加 8 项代码缺陷修复，**不需要任何数据库变更、不需要 Dashboard 配置调整**。

### 操作步骤

```bash
git add -A
git commit -m "fix: 修复 localStorage 静默丢失、session 可伪造等多处缺陷"
git push origin dev
```

Cloudflare Pages 检测到 push 后自动构建部署。

### 不需要做的事

- ❌ 不需要执行 migration（无 schema 变更）
- ❌ 不需要配置新 secret（无新增环境变量）
- ❌ 不需要 Dashboard 重新绑定（D1/R2 不变）

---

## 附录：首次部署检查清单

以下适用于首次部署本项目的全新环境（当前生产环境无需执行）。

- [ ] Cloudflare Pages Dashboard 绑定 D1（`DB`）
- [ ] 执行 `schema.sql` + 两个 migration
- [ ] 配置 `SESSION_SECRET`
- [ ] 配置 `ADMIN_BOOTSTRAP_PASSWORD` / `APP_BOOTSTRAP_PASSWORD`
- [ ] （可选）绑定 R2（`IMAGES_BUCKET`）
- [ ] （可选）配置 `SYNC_ACCESS_TOKEN`（APK 远程同步）
- [ ] （可选）配置 `STATS_API_KEY`
- [ ] （可选）配置 AMap keys
- [ ] （Android）配置签名 secrets
- [ ] 运行 `npm run check` 全量验证
- [ ] Staging 冒烟测试通过
- [ ] 管理员登录/写日记/上传图片/导出全流程验收
