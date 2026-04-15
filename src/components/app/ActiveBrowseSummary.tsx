import { Download, X } from 'lucide-react';
import type { BrowseDescriptor } from '../../hooks/useBrowseState';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useThemeContext } from '../ThemeProvider';
import {
  getMutedSurfaceStyle,
  getPendingPulseStyle,
  getPrimaryButtonStyle,
  getShellSurfaceStyle,
} from './appShellStyles';

interface ActiveBrowseSummaryProps {
  activeBrowse: BrowseDescriptor;
  canExport: boolean;
  isSearchPending: boolean;
  onClearBrowseChip: (id: string) => void;
  onOpenExportModal: () => void;
}

export function ActiveBrowseSummary({
  activeBrowse,
  canExport,
  isSearchPending,
  onClearBrowseChip,
  onOpenExportModal,
}: ActiveBrowseSummaryProps) {
  const { theme } = useThemeContext();
  const isMobile = useIsMobile();
  const shellSurfaceStyle = getShellSurfaceStyle(theme);
  const mutedSurfaceStyle = getMutedSurfaceStyle(theme);
  const primaryButtonStyle = getPrimaryButtonStyle(theme);
  const pendingPulseStyle = getPendingPulseStyle(theme);
  const visibleSummaryItems = isMobile ? activeBrowse.summaryItems.slice(0, 3) : activeBrowse.summaryItems;
  const hiddenSummaryCount = Math.max(0, activeBrowse.summaryItems.length - visibleSummaryItems.length);

  if (!activeBrowse.mode) {
    return null;
  }

  return (
    <section
      className={`flex flex-col rounded-[1.4rem] transition-all duration-200 ${isMobile ? 'gap-2 p-2.5' : 'gap-3 p-3'}`}
      style={{
        ...shellSurfaceStyle,
        color: theme.colors.text,
        opacity: isSearchPending ? 0.82 : 1,
      }}
    >
      {isSearchPending && <div className="h-1 w-full rounded-full" style={pendingPulseStyle} />}

      <div className={`flex ${isMobile ? 'flex-wrap items-center gap-1.5' : 'items-center gap-2'}`}>
        <div
          className={`rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] ${isMobile ? '' : 'text-xs'}`}
          style={{
            ...mutedSurfaceStyle,
            color: theme.colors.primary,
          }}
        >
          {activeBrowse.label}
        </div>
        <div
          className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${isMobile ? '' : 'text-xs'}`}
          style={{
            ...mutedSurfaceStyle,
            color: theme.colors.text,
          }}
        >
          {activeBrowse.count} 篇
        </div>
        {canExport && (
          <button
            type="button"
            onClick={onOpenExportModal}
            className={`flex items-center gap-1.5 rounded-full text-xs transition-transform duration-200 hover:-translate-y-0.5 ${isMobile ? 'ml-auto px-2.5 py-1.5' : 'px-3 py-1.5'}`}
            style={primaryButtonStyle}
          >
            <Download className="h-3.5 w-3.5" />
            {isMobile ? '导出' : '导出当前结果'}
          </button>
        )}
      </div>

      <div className={`flex flex-col ${isMobile ? 'gap-1.5' : 'gap-2'}`}>
        <div className={`${isMobile ? 'text-sm' : 'text-sm font-medium'}`}>
          {isSearchPending ? '正在整理当前搜索结果' : activeBrowse.resultTitle}
        </div>
        <div className={`${isMobile ? 'text-xs leading-5' : 'text-sm'} min-h-[1.25rem]`} style={{ color: theme.colors.textSecondary }}>
          {isSearchPending
            ? '正在根据最新关键词和筛选条件更新列表。'
            : activeBrowse.count === 0
              ? activeBrowse.emptyHint
              : activeBrowse.statusText}
        </div>
      </div>

      {visibleSummaryItems.length > 0 && (
        <div className={`flex flex-wrap ${isMobile ? 'gap-1.5' : 'gap-2'}`}>
          {visibleSummaryItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onClearBrowseChip(item.id)}
              className={`status-pill transition-transform duration-200 hover:-translate-y-0.5 ${isMobile ? 'max-w-full' : ''}`}
              style={{
                ...mutedSurfaceStyle,
                backgroundColor:
                  theme.mode === 'dark' ? 'rgba(148, 163, 184, 0.12)' : 'rgba(255, 255, 255, 0.72)',
                color: theme.colors.textSecondary,
              }}
            >
              <span className={isMobile ? 'truncate' : ''}>{item.label}</span>
              <X className="h-3 w-3" />
            </button>
          ))}
          {hiddenSummaryCount > 0 && (
            <span
              className="status-pill"
              style={{
                ...mutedSurfaceStyle,
                backgroundColor:
                  theme.mode === 'dark' ? 'rgba(148, 163, 184, 0.08)' : 'rgba(255, 255, 255, 0.56)',
                color: theme.colors.textSecondary,
              }}
            >
              +{hiddenSummaryCount} 个条件
            </span>
          )}
        </div>
      )}
    </section>
  );
}
