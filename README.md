# 📖 我的日记

基于 React + TypeScript + Cloudflare 构建的现代化日记应用。

# [在线演示](https://diary.edxx.de)

![React](https://img.shields.io/badge/React-18-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Pages-orange.svg)

## ✨ 功能特色

### 📝 核心功能
- **Markdown 支持**: 完整支持 Markdown 语法，包括代码高亮
- **图片上传**: 支持拖拽上传图片，自动压缩优化
- **精准位置记录**:
  - 集成高德地图API，提供中国地区最准确的位置识别
  - 一键获取当前GPS位置，智能识别具体地址
  - 显示详细地址信息（省市区、街道、建筑物等）
  - 支持手动输入位置名称
  - 多重备用方案：高德地图 → 浏览器地理编码 → 智能离线模式
- **智能时间显示**: 自动显示相对时间和具体日期
- **心情记录**: 支持记录当天心情状态
- **天气记录**: 可选择当时的天气情况
- **标签系统**: 支持添加标签便于分类和搜索

### 🔍 搜索与筛选功能
- **高级搜索**: 支持标题、内容、标签搜索
- **过滤器**: 按心情、天气、时间范围过滤
- **快速筛选**: 按标签、年份、月份快速筛选日记
- **无标签筛选**: 支持筛选没有添加标签的日记，显示数量统计
- **实时搜索**: 输入即时显示结果
- **智能筛选**: 支持组合筛选条件，快速定位目标日记
- **轻推荐入口**: 基于最近记录、主题标签、场景信息和旧页线索生成轻量回看建议

### 🎨 界面设计
- **多主题切换**: 支持纸页、夜读两种主题模式
- **响应式设计**: 完美适配桌面端和移动端
- **移动端优化**: 专门优化的移动端编辑体验
- **轻量首页与阅读壳层**: 首页、浏览工具区和正文区分层更清楚，首屏优先让给阅读
- **三种视图模式**: 支持卡片视图、时间轴视图和归纳视图切换
- **智能归纳**: 归纳视图根据时间跨度自动选择年度、月度或周度归纳
- **多种归纳格式**: 归纳视图支持列表、卡片、紧凑、时间线四种显示格式
- **灵活标题样式**: 归纳标题支持简洁、极简、时间轴、标签四种样式
- **自然时间表达**: 支持"本周"、"上个月"、"六月"等自然语言时间表达

### 🔐 安全管理
- **管理员面板**: 基于服务端会话的管理界面
- **应用密码保护**: 可选的应用访问密码保护
- **隐藏功能**: 支持隐藏日记，只有管理员可见
- **界面控制**: 管理员可控制快速筛选、导出功能和归纳视图的显示
- **数据持久化**: 所有设置保存在云端数据库
- **密码哈希存储**: 管理员密码和应用密码不再以明文返回前端

### 📊 数据管理
- **智能导出**: 支持按筛选结果导出日记，提供JSON和文本两种格式
- **批量导入**: 支持批量导入导出的日记数据
- **云端存储**: 基于 Cloudflare D1 数据库
- **数据一致性**: 解决分布式数据库的一致性问题
- **边缘计算**: 基于 Cloudflare Pages Functions 提供快速响应
- **离线只读快照**: 最近一次公开内容会保存在本机，断网时仍可打开已缓存内容

## 🚀 快速开始

### 本地开发

```bash
# 进入项目目录
cd diary-web

# 安装依赖
npm install

# 运行最小安全回归测试
# 包含函数鉴权、上传、统计接口、管理员面板与位置选择关键 UI 流程
npm test

# 配置高德地图API（可选，用于精准位置识别）
cp .env.example .env.local
# 编辑 .env.local 文件，填入您的高德地图API密钥

# 本地开发（推荐）- 使用模拟数据
npm start

# 局域网访问（移动端测试）
npm run start:network

# 本地预览 Cloudflare Functions / D1 行为
npm run db:init
# 如需开发样例数据，再执行：
# wrangler d1 execute diary-db --local --file=seed.dev.sql
npm run start:remote
```

应用将在 http://localhost:5173 启动

### 📱 安装与离线使用

- 浏览器会自动注册 service worker，缓存应用壳层、Manifest 和静态资源。
- 非管理员模式下，最近一次可见的公开日记会保存为本地离线快照；断网时可继续浏览这些内容。
- 管理员可见内容不会写入离线快照，避免把隐藏条目保留到离线层。
- 浏览区的“设备与离线”卡片会在支持 `beforeinstallprompt` 的浏览器里直接提供安装按钮；iPhone / iPad 会给出“添加到主屏幕”的手动提示。
- 安装图标同时提供 `apple-touch-icon.png`、`icon-192.png` 和 `icon-512.png`，避免 iOS 主屏或部分启动器只识别 SVG 时出现空白或回退图标。
- 手机上可通过“添加到主屏幕”作为 Web App 使用；桌面浏览器也可安装为独立窗口应用。
- 已接入 `Capacitor Android` 包装层，可生成本地可安装的 APK。
- Android 原生安装包默认使用本地离线数据模式，不联网也能写作和浏览；需要联动线上 Pages 数据时，可在应用内切换到远程模式。
- Android 打包说明见 `docs/android-apk-setup.md`

### 🗺️ 高德地图API配置（推荐）

为了获得最准确的位置识别，建议配置高德地图API：

1. **申请API密钥**：
   - 访问 [高德开放平台](https://lbs.amap.com/)
   - 注册账号并创建应用
   - 获取Web服务API密钥

2. **配置密钥**：
   ```bash
   # 复制配置文件
   cp .env.example .env.local

   # 编辑配置文件
   VITE_AMAP_WEB_KEY=你的高德地图API密钥
   ```

3. **详细配置指南**：查看 `docs/amap-api-setup.md`

**免费配额**：每日100万次调用，个人使用完全够用

**备用方案**：如果不配置API密钥，系统会自动使用智能离线模式

### 初始密码
- 生产环境默认不写入任何固定密码
- 本地开发如执行 `seed.dev.sql`，初始口令为 `admin123` 和 `diary123`
- 生产环境建议通过 Cloudflare Secrets 提供 `ADMIN_BOOTSTRAP_PASSWORD` 与 `APP_BOOTSTRAP_PASSWORD`
- 首次登录后应立即在管理员面板中修改密码

## 🚀 部署

### Cloudflare Pages 部署（推荐）

1. **在 Cloudflare 中创建 Pages 项目**
   - 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
   - 进入 "Workers & Pages" > "Pages"，创建一个 Pages 项目
   - 连接你的 Git 仓库
   - 将构建产物目录设置为 `dist`

2. **配置构建设置**
   - 构建命令: `npm ci && npm run build`
   - 构建输出目录: `dist`

3. **以 `wrangler.toml` 管理 Cloudflare 绑定**
   - 本项目的 Pages Functions 绑定通过 `wrangler.toml` 管理，不通过 Dashboard 手动编辑
   - 修改绑定后，需要重新部署才能生效
   - 当前建议至少维护以下配置：
   ```toml
   [[d1_databases]]
   binding = "DB"
   database_name = "diary-db"
   database_id = "你的-d1-database-id"

   [[r2_buckets]]
   binding = "IMAGES_BUCKET"
   bucket_name = "你的-r2-bucket-name"
   ```

4. **配置数据库**
   - 在 Cloudflare Dashboard 中创建 D1 数据库 `diary-db`
   - 记录数据库 ID，更新本地 `wrangler.toml` 的 `database_id`
   - 在 D1 数据库的 "Console" 中执行 `schema.sql` 的内容
   - 不要在生产环境执行 `seed.dev.sql`

5. **配置 Secrets**
   - 运行 `wrangler secret put SESSION_SECRET`
   - 建议：运行 `wrangler secret put ADMIN_BOOTSTRAP_PASSWORD`
   - 可选：运行 `wrangler secret put APP_BOOTSTRAP_PASSWORD`
   - 可选：运行 `wrangler secret put STATS_API_KEY`
   - 如需使用旧版 Cloudflare Images 上传：运行 `wrangler secret put IMAGES_API_TOKEN`

6. **配置图片上传（可选但推荐）**
   - 推荐：在 `wrangler.toml` 中配置 R2 bucket 绑定，变量名为 `IMAGES_BUCKET`
   - 绑定后系统会自动启用 R2 上传，不需要额外图片 secret
   - 如不使用 R2，仍可回退到 Cloudflare Images
   - 旧版需要在 `wrangler.toml` / Cloudflare 项目变量中配置 `IMAGES_ACCOUNT_ID`
   - 旧版可选配置 `IMAGES_DELIVERY_URL`（自定义交付域名前缀）
   - 旧版可选配置 `IMAGES_VARIANT`（默认 `public`）
   - 完整说明见 `docs/image-upload-setup.md`

7. **统计接口说明（可选）**
   - 统计接口的鉴权与调用方式见 `docs/stats-api.md`

8. **完成部署**
   - 提交并推送包含 `wrangler.toml` 修改的代码
   - 等待 Cloudflare Pages 基于当前仓库重新构建部署
   - 如使用命令行部署，可执行 `npm run build` 后再按你的 Pages 发布流程部署 `dist`

9. **安全迁移检查**
   - 按 [docs/security-migration.md](docs/security-migration.md) 完成 secrets、密码迁移和验收检查

10. **历史版本平滑切换到最新版（含 master）**
   - 按 [docs/release-master-cutover.md](docs/release-master-cutover.md) 执行备份、预发验证、切主分支和回滚预案

11. **上线前最终核对**
   - 按 [docs/production-checklist.md](docs/production-checklist.md) 完成构建、配置、安全与 smoke test 检查
   - 可直接执行 `npm run check`，其中已包含 `npm run smoke:dist`、`npm run check:release` 与 `npm run check:cloudflare`
   - 对预发地址可执行 `npm run smoke:remote -- https://你的-preview-域名`
   - 如已有预发管理员口令，可执行 `SMOKE_ADMIN_PASSWORD='你的密码' npm run smoke:remote:admin -- https://你的-preview-域名`
   - 如仅需单独复核 Cloudflare 本地配置，可执行 `npm run check:cloudflare`；如已登录 wrangler，可进一步执行 `npm run check:cloudflare:remote`
   - 如需生成本次发版留档，可执行 `npm run report:release`，报告默认输出到 `reports/`
   - 如仅本地调试静态预览，可执行 `npm run smoke:remote -- http://127.0.0.1:4173 --skip-security-headers --skip-api-check`

## 🛠️ 技术栈

- **前端**: React 18 + TypeScript + Vite + Tailwind CSS
- **后端**: Cloudflare Pages Functions + D1 数据库
- **部署**: Cloudflare Pages

## 🧱 前端维护约定

- `src/App.tsx` 只保留应用级会话流转、欢迎页/密码页切换、主内容装配和弹窗入口；更完整的结构说明见 `docs/frontend-architecture.md`。
- `src/components/app/AppHeader.tsx` 负责顶部操作区；`src/components/app/AppBrowsePanel.tsx` 负责搜索、筛选、视图和导出；`src/components/app/ActiveBrowseSummary.tsx` 负责当前浏览结果摘要。
- `src/components/app/appShellStyles.ts` 是主应用与欢迎页共用的壳层视觉来源，新增应用级表面或按钮皮肤优先从这里扩展。
- `src/components/app/AppHeader.tsx` 与 `src/components/ThemeToggle.tsx` 在移动端优先保证轻量尺寸和更短的页头高度，不要为了品牌区把首条内容继续向下挤。
- `src/components/SearchBar.tsx` 与 `src/components/QuickFilters.tsx` 的移动端布局需要优先控制纵向密度；搜索建议区和快速筛选不要同时膨胀成两块厚面板。
- `src/components/app/AppBrowsePanel.tsx` 与 `src/components/app/ActiveBrowseSummary.tsx` 在移动端优先使用胶囊和短文案，不要把桌面端指标卡直接缩小后堆回手机首屏。
- `src/components/app/AppBrowsePanel.tsx` 的状态指标与操作区优先走配置数组和紧凑布局，移动端只保留最关键的信息，不继续新增独立状态卡分支。
- `src/components/app/AppBrowsePanel.tsx` 新增设备/离线提示时应保持说明短小，不要把安装教程直接堆进首屏。
- `src/components/app/ActiveBrowseSummary.tsx` 的移动端条件 chip 数量应受控，超出的筛选条件使用聚合提示，不要把搜索摘要撑成第二块长列表。
- `src/components/app/RecommendationsPanel.tsx` 负责推荐回看入口，只展示轻量入口和打开动作，不扩写成第二块搜索/统计仪表盘。
- `src/App.tsx` 内与浏览结果、编辑弹窗、轻量通知相关的细节状态优先下沉到专用 hook，不在入口层继续堆叠分支。
- `src/hooks/useBrowseState.ts` 统一维护搜索、快速筛选、结果摘要 chip、当前浏览描述与权限切换后的重置逻辑；不要在 `App.tsx` 重复堆同一组 browse state 和清理分支。
- `src/components/AdminPanel.tsx` 只负责管理员面板的状态编排、接口调用和事件绑定。
- `src/components/admin/AdminPanelViews.tsx` 负责登录态与已登录视图组合，避免主文件继续膨胀。
- `src/components/admin/AdminPanelSections.tsx` 负责各设置区块的展示，便于独立调整 UI。
- `src/components/admin/adminPanelSettingsSchema.ts` 是管理员面板界面功能开关的唯一 schema；接口 key、操作文案和展示文案统一从这里派生。
- `src/components/admin/AdminPanelDialogs.tsx` 自行负责确认文案组装，`AdminPanel.tsx` 只传递确认状态与回调，不重复预处理弹窗文案。
- `src/components/admin/AdminPanelParts.tsx` 的列表操作按钮与按钮样式 helper 默认视为模块私有实现，不对外扩散类型或组件。
- `src/components/admin/AdminPanelParts.tsx` 中输入框皮肤与条目操作按钮使用模块内 helper/配置数组复用，新增交互按钮时优先扩充配置而不是复制 JSX。
- `src/components/NotificationToast.tsx` 是应用级轻量提示组件的唯一入口；不要再从后台模块导出 toast，避免主包和后台模块耦合。
- `src/components/admin/AdminPanelSections.tsx` 的设置卡片网格与密码修改面板使用模块内配置/壳组件复用，避免各区块重复维护卡片和密码表单结构。
- `src/components/admin/useAdminPanelSettings.ts` 统一维护管理员面板设置快照与密码面板显隐状态；不要再把公开功能开关拆成多份并行 `useState`。
- `src/components/admin/adminPanelState.ts` 统一维护管理员面板通知、确认框与条目操作态；空闲操作状态应及时清理，不要把 `idle` 状态长期写回 map。
- `src/components/admin/useAdminPanelEntryActions.ts` 统一处理后台条目查找、确认删除和操作态切换；删除/显隐逻辑不要在 `AdminPanel.tsx` 再复制一份。
- `src/components/admin/adminPanelActions.ts` 只保留低频备份导入/导出动作，并在管理员面板中按需动态加载，不要把这类逻辑重新挂回后台首屏同步依赖。
- `src/hooks/useEntryEditorState.ts` 统一维护日记编辑弹窗、编辑目标与保存后高亮状态；不要在 `App.tsx` 重新堆 timeout 和表单显隐清理逻辑。
- `src/hooks/useNotificationState.ts` 统一维护轻量 toast 的显示/隐藏状态；`ExportModal`、`ImageUpload` 等轻交互组件优先复用，不要各自重复定义 `{ message, type, visible }`。
- `src/utils/exportUtils.ts` 是前端导出文件名、JSON payload、文本序列化和下载触发的唯一来源；`ExportModal` 与后台备份导出必须复用这里的 helper。
- `src/utils/importUtils.ts` 统一维护备份文件解析与导入前结构校验；后台导入入口只负责流程编排，不要在组件或 action 文件里重复手写 `entries` 校验。
- `src/components/admin/adminPanelHelpers.ts` 放与主题和样式相关的纯函数，减少 JSX 内联样式重复。
- `src/components/admin/adminPanelTypes.ts` 统一承载后台模块共享类型，避免视图层重复定义接口。
- `src/components/ContentStatePanel.tsx` 统一承载主内容区空态、加载态和轻错误态；不要在 `App.tsx`、`Timeline.tsx`、`ArchiveView.tsx` 再复制一套居中图标、标题和描述面板。
- `src/components/entry/entryDisplay.tsx` 统一承载条目胶囊、标签与命中摘要样式；`DiaryCard`、`EntryPreviewModal`、`TimelineEntry` 优先复用，不再各自维护一套 entry 展示皮肤。
- `src/components/ArchiveEntryRenderers.tsx` 的 list、card、compact、timeline 四种归档条目样式也应复用 `src/components/entry/entryDisplay.tsx`，不要在归档页重新长出独立标题、摘要和标签 JSX。
- `src/components/EntryPreviewModal.tsx` 的导航头部只负责翻页和关闭，条目标题、标签和正文前置信息优先下沉到正文并复用共享 entry 皮肤。
- `src/components/timeline/TimelineDateNavigator.tsx` 与 `src/components/timeline/useActiveTimelineDateAnchor.ts` 统一承载时间线顶部日期导航与滚动激活逻辑，`Timeline.tsx` 和 `TimelineView.tsx` 不再各自复制同一套实现。
- `src/components/Timeline.tsx` 在搜索/筛选 pending 时优先展示轻量结果更新条并保留旧内容可读，不要把结果区直接替换成整块 loading 面板。
- `src/hooks/useDiary.ts` 的离线兜底只用于公开内容读取，不为管理员可见内容提供本地持久化。
- `src/components/ViewModeToggle.tsx` 使用配置数组驱动按钮渲染；新增视图模式时优先扩配置，并为移动端提供更短标签而不是复制第二套 toggle JSX。
- `src/components/TimelineView.tsx` 必须消费 `createTimelineItems()` 产出的 `time` 项；若未来不再需要时间分隔，应同时删除 `TimelineTimeDivider.tsx` 和 `timelineItems.ts` 的对应产出，而不是静默丢弃。
- `src/components/timeline/TimelineEntry.tsx` 优先复用 `src/components/entry/entryDisplay.tsx` 的共享条目展示皮肤；可点击位置信息必须使用按钮语义而不是继续叠加 `div` 点击事件。
- `src/utils/coordinateUtils.ts` 仅保留正在被位置功能消费的转换与高精度定位能力，未引用辅助函数应直接删除。
- `src/utils/d1Utils.ts` 与 `src/components/map/mapLocationHelpers.ts` 只保留被业务实际调用的能力，历史装饰器、动画辅助或兼容包装不再保留空壳导出。
- `src/components/filters/filterEntryMeta.ts` 对外只保留聚合入口，筛选拆解 helper 默认视为模块内部实现，不单独暴露。
- `src/components/archive/archiveEntryMeta.ts` 仅保留归档展示所需的聚合显示 helper，日期/状态拆分函数默认收为模块私有实现。
- `src/components/ArchiveView.tsx` 统一消费 `ArchiveEntryRenderer`，不再维护独立 list 渲染组件与渲染器工厂两套入口。
- `src/components/archive/ArchiveControls.tsx` 的展示模式与标题样式选项使用配置数组驱动，新增模式时优先改配置，不重复扩写按钮 JSX。
- `src/components/archive/ArchiveGroupHeader.tsx` 各标题风格共用同一套 toggle、标题色和分隔线 helper，视觉变体只保留布局差异。
- `src/components/archive/useArchiveViewState.ts` 负责归档展开态与高亮滚动定位，避免交互状态重新堆回 `ArchiveView.tsx`。
- `src/components/archive/archiveGrouping.ts` 只负责归档分桶与层级组装；月份/周标题、自然语言时间文案统一收口到 `src/components/archive/archiveGroupingLabels.ts`。
- `src/components/archive/archiveTypes.ts` 仅保留视图真实消费的归档结构字段，未被界面读取的元信息应直接删除，不保留占位属性。
- `src/components/SearchBar.tsx` 内的搜索状态胶囊、建议项按钮和筛选下拉卡片优先复用文件内私有 helper；只有跨模块复用时才提升为共享组件。
- `src/components/SearchBar.tsx` 的心情、天气、时间范围文案与下拉选项统一使用集中常量维护，搜索摘要与筛选面板不能各自复制一份标签映射。
- `src/components/DiaryForm.tsx` 的条目回填、草稿恢复与空白初始化统一走 snapshot helper，禁止在 `useEffect` 里分别手写一套状态同步逻辑。
- `src/components/DiaryForm.tsx` 的心情/天气自定义输入和确认弹窗默认使用文件内私有 helper 复用；只有出现跨模块共享需求时才拆成公共组件。
- `src/App.tsx` 只保留页面级状态编排、会话流转和视图装配；搜索/筛选/导出当前态必须通过集中 browse descriptor 推导，不能在 JSX 各处重复判断。
- `src/App.tsx` 的搜索与快速筛选清理逻辑统一走模块内 reset helper；新增浏览入口时优先复用现有重置链路，不再复制整段 `startTransition` 状态清空代码。
- `src/services/api.ts` 的 mock/remote 分发统一走模块内 mode helper；新增接口时优先复用统一请求与会话广播逻辑，不要再为每个方法手写一套 `if (useMockService)` 分支。
- `src/services/api.ts` 中设置值格式归一化与公开设置缓存更新必须集中在私有 helper 处理，避免布尔值字符串转换和缓存写回在各接口里重复散落。
- `src/services/publicSettingsSchema.ts` 是公开设置键、默认值、存储默认值、布尔值校验与返回字段映射的唯一来源；前端 store/hook、mock service 以及后端 settings 读写与 payload 组装都必须复用这里的 schema。
- `src/services/mockApiService.ts` 的 mock 延迟模拟和管理员权限校验统一走模块内 request helper；新增 mock 接口时不要再手写 `await wait(...)` 加 `requireAdminSession()` 组合。
- `src/services/mockApiService.ts` 的公开布尔设置键与默认值统一集中维护，设置读取与写入都必须复用同一套 key 判断和默认值回退逻辑。
- `src/index.css` 与 `index.html` 共同维护跳转链接、焦点样式、降低动效和元信息等上线向前端基线，不要把这些能力散落到页面组件各自补丁。
- 每次迭代后台功能后，至少执行一次 `npm run check`，确保 lint、函数测试、UI 测试、构建、静态产物 smoke、发布配置校验与 Cloudflare 本地配置检查一起通过。

## 🎯 使用指南

### 基本使用
- **写日记**: 点击"写日记"按钮，支持 Markdown 语法、图片上传、心情天气记录
- **主题切换**: 点击主题按钮，支持纸页/夜读两种模式
- **视图切换**: 支持卡片视图和时间轴视图，适应不同阅读习惯
- **搜索日记**: 管理员登录后可搜索标题、内容、标签，支持高级过滤

### 移动端体验
- **优化编辑**: 移动端编辑界面专门优化，更大编辑空间
- **功能折叠**: 次要功能折叠到"高级选项"，界面更简洁
- **触摸友好**: 按钮大小和间距适配触摸操作

### 管理员功能
- **访问**: 点击设置图标，输入管理员密码
- **数据管理**: 导出/导入日记数据，支持批量操作
- **密码设置**: 修改管理员密码、开启应用访问密码保护
- **日记管理**: 搜索、隐藏/显示日记，支持批量管理
- **设置持久化**: 所有设置自动保存到云端，不会丢失

## 常见问题

**Q: 忘记管理员密码怎么办？**
A: 先配置 `ADMIN_BOOTSTRAP_PASSWORD`，再执行 `reset-password.sql` 清除旧密码记录，然后用 bootstrap 密码重新登录并在面板里改成正式密码

**Q: 密码设置不生效怎么办？**
A: 确保已部署到 Cloudflare，并检查 `SESSION_SECRET` 是否已配置；本地 mock 模式与远端会话模式的行为不同

**Q: 删除日记后刷新又出现了？**
A: 这是 Cloudflare D1 分布式数据库的一致性问题，已在最新版本中修复

**Q: 如何配置数据库？**
A: 在 `wrangler.toml` 中配置数据库 ID，在 Cloudflare Pages 中绑定 D1 数据库

**Q: 移动端编辑体验如何？**
A: 已专门优化移动端编辑界面，提供更大编辑空间和简化的操作流程
