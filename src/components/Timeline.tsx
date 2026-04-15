import { Suspense, lazy, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { DiaryEntry } from '../types/index.ts';
import { DiaryCard } from './DiaryCard';
import { ContentStatePanel } from './ContentStatePanel';
import { TimelineView } from './TimelineView';
import { EntryPreviewModal } from './EntryPreviewModal';
import { useThemeContext } from './ThemeProvider';
import { ViewMode } from './ViewModeToggle';
import { useAdminAuth } from './AdminAuthContext';
import { RecommendationsPanel } from './app/RecommendationsPanel';
import { useIsMobile } from '../hooks/useIsMobile';
import { getMutedSurfaceStyle, getPendingPulseStyle } from './app/appShellStyles';
import { TimelineDateDivider } from './timeline/TimelineDateDivider';
import { TimelineDateNavigator } from './timeline/TimelineDateNavigator';
import { TimelineTimeDivider } from './timeline/TimelineTimeDivider';
import { createTimelineItems } from './timeline/timelineItems';
import { useActiveTimelineDateAnchor } from './timeline/useActiveTimelineDateAnchor';
import { getEntryRecommendations } from '../utils/recommendationUtils.ts';

const ArchiveView = lazy(() =>
  import('./ArchiveView').then((module) => ({ default: module.ArchiveView }))
);

interface TimelineProps {
  entries: DiaryEntry[];
  onEdit?: (entry: DiaryEntry) => void;
  searchQuery?: string;
  viewMode: ViewMode;
  highlightEntryId?: number | null;
  isPending?: boolean;
  recommendationsEnabled?: boolean;
}

function getPendingViewLabel(viewMode: ViewMode) {
  switch (viewMode) {
    case 'card':
      return '卡片列表';
    case 'timeline':
      return '时间轴';
    case 'archive':
      return '归档视图';
  }
}

export function Timeline({
  entries,
  onEdit,
  searchQuery = '',
  viewMode,
  highlightEntryId = null,
  isPending = false,
  recommendationsEnabled = true,
}: TimelineProps) {
  const { theme } = useThemeContext();
  const { isAdminAuthenticated } = useAdminAuth();
  const isMobile = useIsMobile();
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const mutedSurfaceStyle = getMutedSurfaceStyle(theme);
  const pendingPulseStyle = getPendingPulseStyle(theme);

  const visibleEntries = entries.filter((entry) => isAdminAuthenticated || !entry.hidden);
  const previewEntry = previewIndex === null ? null : visibleEntries[previewIndex] ?? null;
  const timelineItems = useMemo(() => createTimelineItems(visibleEntries), [visibleEntries]);
  const recommendations = useMemo(() => getEntryRecommendations(visibleEntries), [visibleEntries]);
  const dateItems = useMemo(
    () => timelineItems.filter((item) => item.type === 'date'),
    [timelineItems]
  );
  const activeDateAnchor = useActiveTimelineDateAnchor(dateItems, viewMode === 'card');
  const previewIndexById = useMemo(
    () => new Map(visibleEntries.map((entry, index) => [entry.id, index])),
    [visibleEntries]
  );
  const openPreview = (entry: DiaryEntry) => {
    setPreviewIndex(previewIndexById.get(entry.id) ?? null);
  };
  const recommendationSection = recommendationsEnabled && recommendations.length > 0 ? (
    <RecommendationsPanel
      recommendations={recommendations}
      isPending={isPending}
      onOpenEntry={openPreview}
    />
  ) : null;

  useEffect(() => {
    if (!highlightEntryId) {
      return;
    }

    const targetElement = document.getElementById(`entry-${highlightEntryId}`);
    if (!targetElement) {
      return;
    }

    const rect = targetElement.getBoundingClientRect();
    const inViewport = rect.top >= 96 && rect.bottom <= window.innerHeight - 48;

    if (!inViewport) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightEntryId, viewMode]);

  let content: ReactNode;

  if (viewMode === 'timeline') {
    content = (
      <div className="space-y-5">
        {recommendationSection}
        <TimelineView
          entries={visibleEntries}
          onEdit={onEdit}
          onPreview={openPreview}
          searchQuery={searchQuery}
          highlightEntryId={highlightEntryId}
        />
      </div>
    );
  } else if (viewMode === 'archive') {
    content = (
      <div className="space-y-5">
        {recommendationSection}
        <Suspense
          fallback={
            <ContentStatePanel
              icon="⌛"
              eyebrow="archive loading"
              title="正在加载归档视图..."
              description="归纳分组和懒加载模块正在准备中。"
              isMobile={isMobile}
              surface="muted"
              density="compact"
            />
          }
        >
          <ArchiveView entries={visibleEntries} onEdit={onEdit} highlightEntryId={highlightEntryId} />
        </Suspense>
      </div>
    );
  } else {
    content = (
      <div className={`${isMobile ? 'max-w-full' : 'max-w-4xl'} mx-auto`}>
      {isPending && (
        <section
          className={`mb-4 overflow-hidden rounded-[1.25rem] ${isMobile ? 'p-2.5' : 'p-3'}`}
          style={{
            ...mutedSurfaceStyle,
            color: theme.colors.text,
          }}
          aria-live="polite"
        >
          <div className="mb-2 h-1 w-full rounded-full" style={pendingPulseStyle} />
          <div className={`flex items-center justify-between gap-3 ${isMobile ? 'text-xs' : 'text-sm'}`}>
            <div className="font-medium">正在更新{getPendingViewLabel(viewMode)}</div>
            <div style={{ color: theme.colors.textSecondary }}>
              列表保持可读，结果会在完成后自动替换。
            </div>
          </div>
        </section>
      )}

      {recommendationSection && <div className="mb-5">{recommendationSection}</div>}

      <TimelineDateNavigator
        dateItems={dateItems}
        activeDateAnchor={activeDateAnchor}
        theme={theme}
        className="mb-5"
      />

      <div
        className="space-y-6 transition-opacity duration-200"
        style={{ opacity: isPending ? 0.72 : 1 }}
      >
        {timelineItems.map((item) => {
          if (item.type === 'date') {
            return (
              <TimelineDateDivider
                key={item.key}
                anchorId={item.data.anchorId}
                entryCount={item.data.entryCount}
                dateGroup={item.data.dateGroup}
                isFirst={item.data.isFirst}
                isMobile={isMobile}
              />
            );
          }

          if (item.type === 'time') {
            return (
              <TimelineTimeDivider
                key={item.key}
                timeDisplay={item.data.timeDisplay}
                isMobile={isMobile}
              />
            );
          }

          if (item.type === 'entry') {
            return (
              <div key={item.key}>
                <DiaryCard
                  entry={item.data}
                  onEdit={onEdit}
                  onPreview={openPreview}
                  searchQuery={searchQuery}
                  isHighlighted={highlightEntryId === item.data.id}
                />
              </div>
            );
          }

          return null;
        })}
      </div>

      {visibleEntries.length === 0 && (
        <ContentStatePanel
          icon="📝"
          eyebrow="entries empty"
          title="当前还没有可阅读的日记"
          description="创建第一篇内容后，卡片列表会按时间顺序展示并支持继续筛选。"
          isMobile={isMobile}
        />
      )}
      </div>
    );
  }

  return (
    <>
      {content}
      <EntryPreviewModal
        entry={previewEntry}
        isOpen={previewEntry !== null}
        onClose={() => setPreviewIndex(null)}
        onEdit={onEdit}
        currentIndex={previewIndex}
        totalCount={visibleEntries.length}
        hasPrevious={previewIndex !== null && previewIndex > 0}
        hasNext={previewIndex !== null && previewIndex < visibleEntries.length - 1}
        onPrevious={() => setPreviewIndex((current) => (current === null ? current : Math.max(0, current - 1)))}
        onNext={() => setPreviewIndex((current) => (current === null ? current : Math.min(visibleEntries.length - 1, current + 1)))}
      />
    </>
  );
}
