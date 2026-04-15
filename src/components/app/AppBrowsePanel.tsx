import { Suspense, lazy, type CSSProperties } from 'react';
import { Download, Smartphone, Wifi, WifiOff, X } from 'lucide-react';
import type { FilterMeta } from '../filters/filterEntryMeta';
import type { ViewMode } from '../ViewModeToggle';
import type { BrowseDescriptor, BrowseSummaryItem, ClearRequest } from '../../hooks/useBrowseState';
import type { DiaryEntry } from '../../types/index.ts';
import { ContentStatePanel } from '../ContentStatePanel';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useStandaloneMode } from '../../hooks/useStandaloneMode';
import { useThemeContext } from '../ThemeProvider';
import {
  getMutedSurfaceStyle,
  getPrimaryButtonStyle,
  getQuietButtonStyle,
  getShellSurfaceStyle,
} from './appShellStyles';

const SearchBar = lazy(() =>
  import('../SearchBar').then((module) => ({ default: module.SearchBar }))
);
const QuickFilters = lazy(() =>
  import('../QuickFilters').then((module) => ({ default: module.QuickFilters }))
);
const ViewModeToggle = lazy(() =>
  import('../ViewModeToggle').then((module) => ({ default: module.ViewModeToggle }))
);

interface AppBrowsePanelProps {
  entries: DiaryEntry[];
  filterMeta: FilterMeta;
  viewMode: ViewMode;
  dataMode: 'local' | 'remote';
  activeBrowse: BrowseDescriptor;
  accessibleEntriesCount: number;
  displayEntriesCount: number;
  interfaceSettings: {
    archiveView: { enabled: boolean };
    export: { enabled: boolean };
    quickFilters: { enabled: boolean };
  };
  interfaceSettingsLoading: boolean;
  isAdminAuthenticated: boolean;
  isSearchPending: boolean;
  isSwitchingDataMode: boolean;
  onClearActiveBrowsing: () => void;
  onClearQuickFilters: () => void;
  onClearSearch: () => void;
  onDataModeChange: (mode: 'local' | 'remote') => void;
  onOpenExportModal: () => void;
  onQuickFilterResults: (results: DiaryEntry[]) => void;
  onQuickFilterSummaryChange: (items: BrowseSummaryItem[]) => void;
  onSearchPendingChange: (pending: boolean) => void;
  onSearchQueryChange: (query: string) => void;
  onSearchResults: (results: DiaryEntry[]) => void;
  onSearchSummaryChange: (items: BrowseSummaryItem[]) => void;
  onViewModeChange: (mode: ViewMode) => void;
  quickFilterClearRequest: ClearRequest;
  quickFilterResetSignal: number;
  searchClearRequest: ClearRequest;
  searchResetSignal: number;
}

type AppMetricCardProps = {
  label: string;
  value: string;
  mutedSurfaceStyle: CSSProperties;
  labelColor: string;
  valueColor: string;
};

type AppMetricPillProps = {
  label: string;
  value: string;
  mutedSurfaceStyle: CSSProperties;
  labelColor: string;
  valueColor: string;
};

function AppMetricCard({ label, value, mutedSurfaceStyle, labelColor, valueColor }: AppMetricCardProps) {
  return (
    <div className="rounded-[1.4rem] px-4 py-3" style={mutedSurfaceStyle}>
      <div className="text-xs uppercase tracking-[0.16em]" style={{ color: labelColor }}>
        {label}
      </div>
      <div className="mt-1.5 text-base font-semibold" style={{ color: valueColor }}>
        {value}
      </div>
    </div>
  );
}

function AppMetricPill({ label, value, mutedSurfaceStyle, labelColor, valueColor }: AppMetricPillProps) {
  return (
    <div className="flex items-center gap-2 rounded-full px-3 py-2 text-xs" style={mutedSurfaceStyle}>
      <span className="uppercase tracking-[0.14em]" style={{ color: labelColor }}>
        {label}
      </span>
      <span className="font-medium" style={{ color: valueColor }}>
        {value}
      </span>
    </div>
  );
}

function getViewModeLabel(viewMode: ViewMode) {
  switch (viewMode) {
    case 'card':
      return '卡片浏览';
    case 'timeline':
      return '时间轴';
    case 'archive':
      return '归纳整理';
  }
}

function getThemeModeLabel(mode: 'light' | 'dark') {
  switch (mode) {
    case 'light':
      return '纸页浅色';
    case 'dark':
      return '夜读夜读';
  }
}

type BrowseMetric = {
  label: string;
  value: string;
};

export function AppBrowsePanel({
  entries,
  filterMeta,
  viewMode,
  dataMode,
  activeBrowse,
  accessibleEntriesCount,
  displayEntriesCount,
  interfaceSettings,
  interfaceSettingsLoading,
  isAdminAuthenticated,
  isSearchPending,
  isSwitchingDataMode,
  onClearActiveBrowsing,
  onClearQuickFilters,
  onClearSearch,
  onDataModeChange,
  onOpenExportModal,
  onQuickFilterResults,
  onQuickFilterSummaryChange,
  onSearchPendingChange,
  onSearchQueryChange,
  onSearchResults,
  onSearchSummaryChange,
  onViewModeChange,
  quickFilterClearRequest,
  quickFilterResetSignal,
  searchClearRequest,
  searchResetSignal,
}: AppBrowsePanelProps) {
  const { theme } = useThemeContext();
  const isMobile = useIsMobile();
  const isOnline = useOnlineStatus();
  const isStandalone = useStandaloneMode();
  const { canPromptInstall, lastOutcome, manualInstallHint, promptInstall } = useInstallPrompt(isStandalone);
  const shellSurfaceStyle = getShellSurfaceStyle(theme);
  const mutedSurfaceStyle = getMutedSurfaceStyle(theme);
  const quietButtonStyle = getQuietButtonStyle(theme);
  const primaryButtonStyle = getPrimaryButtonStyle(theme);
  const statusValue = activeBrowse.mode
    ? `${activeBrowse.label} ${activeBrowse.count} 篇`
    : isAdminAuthenticated
      ? '管理员模式'
      : '访客模式';
  const mobileMetrics: BrowseMetric[] = [
    { label: '视图', value: getViewModeLabel(viewMode) },
    { label: '状态', value: statusValue },
  ];
  const desktopMetrics: BrowseMetric[] = [
    { label: '视图', value: getViewModeLabel(viewMode) },
    { label: '主题', value: getThemeModeLabel(theme.mode) },
    { label: '当前状态', value: statusValue },
  ];
  const canExportAll =
    isAdminAuthenticated &&
    !interfaceSettingsLoading &&
    interfaceSettings.export.enabled &&
    !activeBrowse.mode &&
    entries.length > 0;
  const suspenseFallback = (
    <ContentStatePanel
      icon="⌛"
      eyebrow="tools loading"
      title="正在加载工具..."
      description="搜索、筛选和视图切换组件正在准备中。"
      isMobile={isMobile}
      surface="muted"
      density="compact"
      align="left"
    />
  );

  return (
    <section className={`rounded-[1.8rem] ${isMobile ? 'p-3' : 'p-4 md:p-5'}`} style={shellSurfaceStyle}>
      <div className={`grid ${isMobile ? 'gap-4' : 'gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]'}`}>
        <div className={isMobile ? 'space-y-4' : 'space-y-5'}>
          <div className="max-w-2xl">
            <div
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs uppercase tracking-[0.18em] ${isMobile ? 'mb-2' : 'mb-3'}`}
              style={{ ...mutedSurfaceStyle, color: theme.colors.primary }}
            >
              reading desk
            </div>
            <h2
              className={`${isMobile ? 'text-xl leading-tight' : 'text-2xl md:text-3xl'} font-semibold tracking-[-0.04em]`}
              style={{ color: theme.colors.text }}
            >
              {isMobile ? '先找到内容，再继续读。' : '先找到要看的内容，再安静地读下去。'}
            </h2>
            <p className={`max-w-xl text-sm ${isMobile ? 'mt-2.5 leading-6' : 'mt-3 leading-7 md:text-base'}`} style={{ color: theme.colors.textSecondary }}>
              当前展示 {displayEntriesCount} 篇内容，可见总数 {accessibleEntriesCount} 篇。
              {isMobile ? '工具收紧到一层，下面优先留给阅读区。' : '搜索、筛选和视图切换都收进这一层，下面只保留阅读区。'}
            </p>
          </div>

          <div className={isMobile ? 'space-y-3' : 'space-y-4'}>
            <Suspense fallback={suspenseFallback}>
              <SearchBar
                entries={entries}
                isAdminAuthenticated={isAdminAuthenticated}
                availableTags={filterMeta.availableTags}
                availableYears={filterMeta.availableYears}
                availableMonthsByYear={filterMeta.availableMonthsByYear}
                untaggedEntryCount={filterMeta.untaggedEntryCount}
                onSearchResults={onSearchResults}
                onClearSearch={onClearSearch}
                onSearchPendingChange={onSearchPendingChange}
                onSearchQueryChange={onSearchQueryChange}
                onSearchSummaryChange={onSearchSummaryChange}
                clearRequest={searchClearRequest}
                resetSignal={searchResetSignal}
              />
            </Suspense>

            <Suspense fallback={null}>
              <QuickFilters
                entries={entries}
                enabled={interfaceSettings.quickFilters.enabled}
                isAdminAuthenticated={isAdminAuthenticated}
                availableTags={filterMeta.availableTags}
                availableYears={filterMeta.availableYears}
                availableMonths={filterMeta.availableMonths}
                availableMonthsByYear={filterMeta.availableMonthsByYear}
                untaggedEntryCount={filterMeta.untaggedEntryCount}
                onFilterResults={onQuickFilterResults}
                onClearFilter={onClearQuickFilters}
                onFilterSummaryChange={onQuickFilterSummaryChange}
                clearRequest={quickFilterClearRequest}
                resetSignal={quickFilterResetSignal}
              />
            </Suspense>
          </div>
        </div>

        <aside className={isMobile ? 'space-y-3' : 'space-y-4'}>
          {isMobile ? (
            <div className="flex flex-wrap gap-2">
              {mobileMetrics.map((metric) => (
                <AppMetricPill
                  key={metric.label}
                  label={metric.label}
                  value={metric.value}
                  mutedSurfaceStyle={mutedSurfaceStyle}
                  labelColor={theme.colors.textSecondary}
                  valueColor={theme.colors.text}
                />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              {desktopMetrics.map((metric) => (
                <AppMetricCard
                  key={metric.label}
                  label={metric.label}
                  value={metric.value}
                  mutedSurfaceStyle={mutedSurfaceStyle}
                  labelColor={theme.colors.textSecondary}
                  valueColor={theme.colors.text}
                />
              ))}
            </div>
          )}

          <div className={`rounded-[1.4rem] ${isMobile ? 'space-y-2.5 p-2.5' : 'space-y-4 p-4'}`} style={mutedSurfaceStyle}>
            <div className={`flex ${isMobile ? 'items-center justify-between gap-2' : 'flex-col gap-1'}`}>
              <div>
                <div className={`${isMobile ? 'text-xs uppercase tracking-[0.14em]' : 'text-sm font-medium'}`} style={{ color: isMobile ? theme.colors.textSecondary : theme.colors.text }}>
                  {isSearchPending ? '结果更新中' : '当前浏览状态'}
                </div>
                <div className={`text-sm ${isMobile ? 'mt-1 leading-5' : 'leading-6'}`} style={{ color: theme.colors.textSecondary }}>
                  {isSearchPending
                    ? '正在根据最新关键词和筛选条件更新列表。'
                    : isMobile
                      ? `${displayEntriesCount} / ${accessibleEntriesCount} 篇`
                      : activeBrowse.statusText}
                </div>
              </div>
              {isMobile && (
                <div
                  className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium"
                  style={{ ...quietButtonStyle, color: theme.colors.text }}
                >
                  {displayEntriesCount} 篇
                </div>
              )}
              <div className="sr-only" aria-live="polite">
                {activeBrowse.announcement}
              </div>
            </div>

            <div className={`flex flex-wrap items-center ${isMobile ? 'gap-1.5' : 'gap-2'}`}>
              {activeBrowse.mode && (
                <button
                  type="button"
                  onClick={onClearActiveBrowsing}
                  aria-label="清空当前搜索或筛选结果"
                  className={`inline-flex items-center gap-2 rounded-xl text-sm transition-transform duration-200 hover:-translate-y-0.5 ${isMobile ? 'px-2 py-1.5 text-xs' : 'px-3 py-2'}`}
                  style={quietButtonStyle}
                >
                  <X className={isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
                  {isMobile ? '清空' : '清空当前浏览'}
                </button>
              )}

              {canExportAll && (
                <button
                  type="button"
                  onClick={onOpenExportModal}
                  className={`inline-flex items-center gap-2 rounded-xl text-sm transition-transform duration-200 hover:-translate-y-0.5 ${isMobile ? 'px-2 py-1.5 text-xs' : 'px-3 py-2'}`}
                  style={primaryButtonStyle}
                >
                  <Download className={isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
                  {isMobile ? '导出' : '导出全部日记'}
                </button>
              )}
            </div>

            <Suspense fallback={null}>
              <ViewModeToggle
                viewMode={viewMode}
                onViewModeChange={onViewModeChange}
                archiveViewEnabled={interfaceSettings.archiveView.enabled}
                compact={isMobile}
              />
            </Suspense>
          </div>

          <div className={`rounded-[1.4rem] ${isMobile ? 'space-y-2 p-2.5' : 'space-y-3 p-4'}`} style={mutedSurfaceStyle}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className={`${isMobile ? 'text-xs uppercase tracking-[0.14em]' : 'text-sm font-medium'}`} style={{ color: theme.colors.text }}>
                  设备与离线
                </div>
                <div className={`${isMobile ? 'mt-1 text-xs leading-5' : 'mt-1.5 text-sm leading-6'}`} style={{ color: theme.colors.textSecondary }}>
                  {isStandalone
                    ? '已接近原生应用形态打开。'
                    : '可添加到手机主屏幕或桌面，保留更像本地应用的入口。'}
                </div>
              </div>

              <div
                className={`inline-flex items-center gap-2 rounded-full ${isMobile ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'}`}
                style={{ ...quietButtonStyle, color: theme.colors.text }}
              >
                <Smartphone className="h-3.5 w-3.5" />
                {isStandalone ? '已安装' : 'Web App'}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <div
                className={`inline-flex items-center gap-2 rounded-full ${isMobile ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'}`}
                style={{ ...quietButtonStyle, color: theme.colors.text }}
              >
                {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                {isOnline ? '在线同步中' : '当前离线'}
              </div>
              <div
                className={`inline-flex items-center gap-2 rounded-full ${isMobile ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'}`}
                style={{ ...quietButtonStyle, color: theme.colors.text }}
              >
                {dataMode === 'local' ? '本地数据可离线写作与浏览' : '远程数据可与 Pages 项目联动'}
              </div>
            </div>

            <div className={`rounded-2xl ${isMobile ? 'space-y-2 p-2.5' : 'space-y-3 p-3'}`} style={shellSurfaceStyle}>
              <div className={`${isMobile ? 'text-xs uppercase tracking-[0.14em]' : 'text-sm font-medium'}`} style={{ color: theme.colors.text }}>
                数据模式
              </div>
              <div className={`${isMobile ? 'text-xs leading-5' : 'text-sm leading-6'}`} style={{ color: theme.colors.textSecondary }}>
                {dataMode === 'local'
                  ? '当前使用设备本地数据，适合 APK 离线记录。后续需要联动云端时，可切换到远程 Pages 模式。'
                  : '当前连接 Cloudflare Pages / Functions。适合和线上项目保持同一套数据入口。'}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onDataModeChange('local')}
                  disabled={dataMode === 'local' || isSwitchingDataMode}
                  className={`inline-flex items-center gap-2 rounded-xl font-medium transition-transform duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 ${
                    isMobile ? 'px-3 py-2 text-xs' : 'px-3.5 py-2 text-sm'
                  }`}
                  style={dataMode === 'local' ? primaryButtonStyle : quietButtonStyle}
                >
                  本地离线
                </button>
                <button
                  type="button"
                  onClick={() => onDataModeChange('remote')}
                  disabled={dataMode === 'remote' || isSwitchingDataMode || !isOnline}
                  className={`inline-flex items-center gap-2 rounded-xl font-medium transition-transform duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 ${
                    isMobile ? 'px-3 py-2 text-xs' : 'px-3.5 py-2 text-sm'
                  }`}
                  style={dataMode === 'remote' ? primaryButtonStyle : quietButtonStyle}
                >
                  远程 Pages
                </button>
              </div>
            </div>

            {!isStandalone && (
              <div className={`rounded-2xl ${isMobile ? 'space-y-2 p-2.5' : 'space-y-3 p-3'}`} style={shellSurfaceStyle}>
                <div className={`${isMobile ? 'text-xs leading-5' : 'text-sm leading-6'}`} style={{ color: theme.colors.textSecondary }}>
                  {canPromptInstall
                    ? '浏览器已准备好安装入口，安装后可更像本地应用一样从主屏幕或桌面打开。'
                    : lastOutcome === 'accepted'
                      ? '安装请求已接受，浏览器完成安装后就能以独立应用方式打开。'
                    : lastOutcome === 'dismissed'
                      ? '已关闭安装弹窗，稍后仍可从浏览器菜单中安装。'
                      : manualInstallHint}
                </div>

                {canPromptInstall && (
                  <button
                    type="button"
                    onClick={() => {
                      void promptInstall();
                    }}
                    className={`inline-flex items-center gap-2 rounded-xl font-medium transition-transform duration-200 hover:-translate-y-0.5 ${
                      isMobile ? 'px-3 py-2 text-xs' : 'px-3.5 py-2 text-sm'
                    }`}
                    style={primaryButtonStyle}
                  >
                    <Download className={isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
                    {isMobile ? '安装应用' : '安装到设备'}
                  </button>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
