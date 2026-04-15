# 前端架构说明

适用于当前日记应用前端的页面编排、壳层样式和上线前 UI 基线。

## 1. 页面编排

- `src/App.tsx` 只保留应用级会话流转、欢迎页/密码页切换、主内容装配和弹窗入口。
- `src/components/app/AppHeader.tsx` 负责顶部标题、主题切换、刷新和管理员入口。
- `src/components/app/AppBrowsePanel.tsx` 负责搜索、快速筛选、视图切换、导出入口和阅读区概览。
- `src/hooks/useInstallPrompt.ts` 统一承载 PWA 安装提示与浏览器级安装事件，避免把 `beforeinstallprompt` 逻辑散落回壳层组件。
- `src/components/app/ActiveBrowseSummary.tsx` 负责当前搜索/筛选结果摘要、导出当前结果和条件 chip 清理。
- `src/components/app/RecommendationsPanel.tsx` 负责推荐回看入口，放在 browse summary 与正文列表之间。

## 2. 壳层视觉来源

- `src/components/app/appShellStyles.ts` 是应用壳层表面、弱化面板、按钮和搜索进度条样式的唯一来源。
- 欢迎页与主应用都复用这组 helper，避免同类面板在不同页面各自维护一套内联样式。
- 新增应用级面板时，优先扩展该文件，而不是在组件里复制 `backgroundColor`、`border` 和 `boxShadow` 组合。
- `src/components/ContentStatePanel.tsx` 统一承载主内容区的空态、加载态和轻错误态；不要在 `App.tsx`、`Timeline.tsx`、`ArchiveView.tsx` 再散落手写居中图标加标题的状态块。
- `src/components/entry/entryDisplay.tsx` 统一承载条目标题、命中摘要、图片网格、标签列表和 meta pill 的共享展示皮肤；卡片视图与时间轴优先复用这里，而不是各自维护两套近似 JSX。
- `src/components/ArchiveEntryRenderers.tsx` 的 list、card、compact 和 timeline 四种归档条目样式也优先复用 `src/components/entry/entryDisplay.tsx`，避免归档区域继续演化出第四套独立条目皮肤。
- `src/components/EntryPreviewModal.tsx` 的标题、标签和正文前置信息也应优先复用 `src/components/entry/entryDisplay.tsx`，保持列表和弹窗的阅读结构一致。
- 推荐逻辑统一收口到 `src/utils/recommendationUtils.ts`，UI 只消费轻量 recommendation 数据，不在组件内堆叠统计和推导逻辑。

## 3. 上线向 UI 基线

- `index.html` 维护应用描述、`og` 元信息、`color-scheme` 和 PWA 所需基础标签。
- `public/manifest.webmanifest` 维护独立窗口模式、分类、主题色和可安装图标；`index.html` 还需保留 `apple-touch-icon`，避免 iOS 安装时回退到缺省图标。
- `public/sw.js` 维护应用壳层缓存策略；只缓存静态资源，不缓存 `/api/*`。
- `src/index.css` 统一提供 `skip-link`、全局焦点样式和 `prefers-reduced-motion` 兜底，保证键盘导航和低动态偏好可用。

## 4. 移动端密度

- `src/components/app/AppHeader.tsx` 在移动端优先拆成品牌行和紧凑操作行，减少顶部留白；`src/components/ThemeToggle.tsx` 也保持图标优先的轻量尺寸。
- `src/components/SearchBar.tsx` 在移动端优先压缩输入区、建议区和高级筛选卡片的纵向高度；最近搜索仅在空查询时展示，避免建议层过厚。
- `src/components/QuickFilters.tsx` 在移动端采用标签全宽、年份和月份并列的两列布局，减少一屏内的滚动长度。
- `src/components/app/AppBrowsePanel.tsx` 在移动端优先使用状态胶囊和紧凑操作区，而不是重复堆叠指标卡，首屏空间优先让给内容列表。
- `src/components/app/AppBrowsePanel.tsx` 的设备与离线卡片应提供实际可点击的安装入口，或在不支持 prompt 的浏览器里给出简短人工安装提示，而不是只停留在说明文案。
- `src/components/app/AppBrowsePanel.tsx` 的视图/状态指标应优先使用配置数组驱动，移动端只保留最关键的状态胶囊和紧凑动作，不要继续扩写独立卡片 JSX。
- `src/components/app/RecommendationsPanel.tsx` 在移动端保持单列、短文案和单一主动作，不把推荐区做成横向复杂 carousel。
- `src/components/app/ActiveBrowseSummary.tsx` 在移动端保持短摘要、短按钮文案和受控数量的条件 chip，避免搜索结果摘要再次占据整屏高度。
- `src/components/timeline/TimelineEntry.tsx`、`src/components/timeline/TimelineDateDivider.tsx` 与 `src/components/timeline/TimelineTimeDivider.tsx` 在移动端优先缩短段落间距和时间分隔高度，保证阅读主链路更紧凑。
- `src/components/Timeline.tsx` 在搜索或筛选 pending 时优先显示轻量结果更新条，并保持旧列表可读，不要把整块内容直接清空后再重渲染。
- `src/hooks/useDiary.ts` 与 `src/utils/offlineEntrySnapshot.ts` 负责公开内容的只读离线快照；管理员态要清理本地快照，避免隐藏内容落到离线层。

## 5. 清理策略

- 未接入主流程的展示组件要及时删除，不保留“可能以后会用”的孤立页面壳子。
- 这轮已移除未被应用消费的 `StatsDisplay` 及其 UI 测试，统计能力仅保留 API 与服务层。
