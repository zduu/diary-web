import { Suspense, lazy, useState } from 'react';
import { ChevronDown, Download, Smartphone, Wifi, WifiOff, X } from 'lucide-react';
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
  canToggleDataMode: boolean;
  activeBrowse: BrowseDescriptor;
  accessibleEntriesCount: number;
  displayEntriesCount: number;
  interfaceSettings: {
    archiveView: { enabled: boolean };
    export: { enabled: boolean };
    quickFilters: { enabled: boolean };
    recommendations: { enabled: boolean };
    browseStatus: { enabled: boolean };
    deviceStatus: { enabled: boolean };
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

function getStatusPillLabel(
  activeBrowse: BrowseDescriptor,
  isAdminAuthenticated: boolean
): string {
  if (activeBrowse.mode) {
    return `${activeBrowse.label} · ${activeBrowse.count} 篇`;
  }
  return isAdminAuthenticated ? '管理员模式' : '访客模式';
}

export function AppBrowsePanel({
  entries,
  filterMeta,
  viewMode,
  dataMode,
  canToggleDataMode,
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
  const [isDevicePanelOpen, setIsDevicePanelOpen] = useState(false);
  const shellSurfaceStyle = getShellSurfaceStyle(theme);
  const mutedSurfaceStyle = getMutedSurfaceStyle(theme);
  const quietButtonStyle = getQuietButtonStyle(theme);
  const primaryButtonStyle = getPrimaryButtonStyle(theme);
  const canExportAll =
    isAdminAuthenticated &&
    !interfaceSettingsLoading &&
    interfaceSettings.export.enabled &&
    !activeBrowse.mode &&
    entries.length > 0;
  const showBrowseStatus = interfaceSettings.browseStatus.enabled;
  const showDeviceStatus = interfaceSettings.deviceStatus.enabled;
  const statusPillLabel = getStatusPillLabel(activeBrowse, isAdminAuthenticated);
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

  const actionButtonClass = `inline-flex items-center gap-2 rounded-xl text-sm transition-transform duration-200 hover:-translate-y-0.5 ${
    isMobile ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2'
  }`;

  return (
    <section className={`rounded-[1.8rem] ${isMobile ? 'space-y-3.5 p-3.5' : 'space-y-4 p-5 md:p-6'}`} style={shellSurfaceStyle}>
      {/* 标题区：一屏内保持轻量，介绍性文案压到一行 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] ${isMobile ? 'mb-1.5' : 'mb-2'}`}
            style={{ ...mutedSurfaceStyle, color: theme.colors.primary }}
          >
            reading desk
          </div>
          <h2
            className={`${isMobile ? 'text-lg leading-tight' : 'text-2xl md:text-[1.7rem]'} font-semibold tracking-tight`}
            style={{ color: theme.colors.text }}
          >
            {isMobile ? '浏览日记' : '浏览与回看'}
          </h2>
          <p className={`text-sm ${isMobile ? 'mt-1 leading-6' : 'mt-1.5 leading-6'}`} style={{ color: theme.colors.textSecondary }}>
            当前展示 {displayEntriesCount} / {accessibleEntriesCount} 篇
            {activeBrowse.mode ? ` · 正在查看${activeBrowse.label}结果` : ' · 可搜索、筛选或切换视图'}
          </p>
        </div>

        <div
          className={`inline-flex shrink-0 items-center gap-2 rounded-full text-xs ${isMobile ? 'px-2.5 py-1' : 'px-3 py-1.5'}`}
          style={{ ...mutedSurfaceStyle, color: theme.colors.textSecondary }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: activeBrowse.mode ? theme.colors.accent : theme.colors.primary }}
            aria-hidden="true"
          />
          <span style={{ color: theme.colors.text }}>{statusPillLabel}</span>
        </div>
      </div>

      {/* 搜索：首屏最主要的入口 */}
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

      {/* 工具条：视图切换 + 主要操作，横向紧凑排列 */}
      <div className="flex flex-wrap items-center gap-2.5">
        <Suspense fallback={null}>
          <ViewModeToggle
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
            archiveViewEnabled={interfaceSettings.archiveView.enabled}
            compact={isMobile}
          />
        </Suspense>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {activeBrowse.mode && (
            <button
              type="button"
              onClick={onClearActiveBrowsing}
              aria-label="清空当前搜索或筛选结果"
              className={actionButtonClass}
              style={quietButtonStyle}
            >
              <X className={isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
              {isMobile ? '清空' : '清空浏览'}
            </button>
          )}

          {canExportAll && (
            <button
              type="button"
              onClick={onOpenExportModal}
              className={actionButtonClass}
              style={primaryButtonStyle}
            >
              <Download className={isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
              {isMobile ? '导出' : '导出全部'}
            </button>
          )}

          {showDeviceStatus && (
            <button
              type="button"
              onClick={() => setIsDevicePanelOpen((value) => !value)}
              aria-expanded={isDevicePanelOpen}
              aria-label="设备与离线状态"
              className={actionButtonClass}
              style={quietButtonStyle}
            >
              <Smartphone className={isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
              <span>设备</span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-200 ${isDevicePanelOpen ? 'rotate-180' : ''}`}
              />
            </button>
          )}
        </div>
      </div>

      {/* 快速筛选 */}
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

      {/* 浏览状态：管理员开启该项时以一行提示呈现当前浏览态；不再堆成独立指标卡 */}
      {showBrowseStatus && (isSearchPending || Boolean(activeBrowse.mode)) && (
        <div
          className="rounded-2xl px-3 py-2 text-sm leading-6"
          style={{ ...mutedSurfaceStyle, color: theme.colors.textSecondary }}
        >
          {isSearchPending
            ? '正在根据最新关键词和筛选条件更新列表。'
            : activeBrowse.statusText}
        </div>
      )}
      <div className="sr-only" aria-live="polite">
        {activeBrowse.announcement}
      </div>

      {/* 设备与离线：默认收起，仅在需要时展开，避免把安装/同步细节堆进首屏 */}
      {showDeviceStatus && isDevicePanelOpen && (
        <div className={`rounded-[1.4rem] ${isMobile ? 'space-y-2.5 p-3' : 'space-y-3 p-4'}`} style={mutedSurfaceStyle}>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className={`inline-flex items-center gap-2 rounded-full ${isMobile ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'}`}
              style={{ ...quietButtonStyle, color: theme.colors.text }}
            >
              <Smartphone className="h-3.5 w-3.5" />
              {isStandalone ? '独立窗口运行中' : '可作为 Web App 使用'}
            </div>
            <div
              className={`inline-flex items-center gap-2 rounded-full ${isMobile ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'}`}
              style={{ ...quietButtonStyle, color: theme.colors.text }}
            >
              {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              {isOnline ? '在线同步中' : '当前离线'}
            </div>
          </div>

          <div className={`rounded-2xl ${isMobile ? 'space-y-2 p-2.5' : 'space-y-3 p-3'}`} style={shellSurfaceStyle}>
            <div className={`${isMobile ? 'text-xs uppercase tracking-[0.14em]' : 'text-sm font-medium'}`} style={{ color: theme.colors.text }}>
              {canToggleDataMode ? '数据模式' : '数据方式'}
            </div>
            <div className={`${isMobile ? 'text-xs leading-5' : 'text-sm leading-6'}`} style={{ color: theme.colors.textSecondary }}>
              {canToggleDataMode
                ? (dataMode === 'local'
                  ? '当前使用设备本地数据，适合离线记录。'
                  : '当前连接 Cloudflare Pages / Functions。')
                : '当前构建固定为本地数据入口，远程同步在管理员面板管理。'}
            </div>

            {canToggleDataMode ? (
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
            ) : (
              <div
                className={`inline-flex items-center gap-2 rounded-full ${isMobile ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'}`}
                style={{ ...quietButtonStyle, color: theme.colors.text }}
              >
                {dataMode === 'local' ? '正式 APK 固定本地模式' : '当前为远程模式'}
              </div>
            )}
          </div>

          {!isStandalone && (
            <div className={`rounded-2xl ${isMobile ? 'space-y-2 p-2.5' : 'space-y-3 p-3'}`} style={shellSurfaceStyle}>
              <div className={`${isMobile ? 'text-xs leading-5' : 'text-sm leading-6'}`} style={{ color: theme.colors.textSecondary }}>
                {canPromptInstall
                  ? '浏览器已准备好安装入口。'
                  : lastOutcome === 'accepted'
                    ? '安装请求已接受。'
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
      )}
    </section>
  );
}
