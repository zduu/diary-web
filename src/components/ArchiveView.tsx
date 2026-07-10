import { useDeferredValue, useMemo, useState } from 'react';
import { Calendar, ChevronDown, ChevronRight } from 'lucide-react';
import type { DiaryEntry } from '../types/index.ts';
import { useAdminAuth } from './AdminAuthContext';
import { ArchiveEntryRenderer } from './ArchiveEntryRenderers';
import { useThemeContext } from './ThemeProvider';
import { ContentStatePanel } from './ContentStatePanel';
import { ArchiveControls } from './archive/ArchiveControls';
import { ArchiveGroupHeader } from './archive/ArchiveGroupHeader';
import { EntryPreviewModal } from './EntryPreviewModal';
import { createArchiveGroups } from './archive/archiveGrouping';
import {
  useArchiveExpansionState,
  useArchiveHighlightScroll,
} from './archive/useArchiveViewState';
import { useIsMobile } from '../hooks/useIsMobile';
import type {
  ArchiveDisplayMode,
  ArchiveGroup,
  ArchiveHeaderStyle,
} from './archive/archiveTypes';
import { findDiaryEntryIndex, getDiaryEntryKey } from '../utils/diaryEntryIdentity.ts';

interface ArchiveViewProps {
  entries: DiaryEntry[];
  onEdit?: (entry: DiaryEntry) => void;
  highlightEntryId?: number | null;
}

const displayModeClasses: Record<ArchiveDisplayMode, string> = {
  list: 'divide-y',
  cards: 'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3',
  compact: 'space-y-1',
  timeline: 'space-y-4',
};

function flattenDisplayedArchiveEntries(groups: ArchiveGroup[]) {
  return groups.flatMap((group) => {
    if (group.subGroups && group.subGroups.length > 0) {
      return group.subGroups.flatMap((subGroup) => subGroup.entries);
    }

    return group.entries;
  });
}

export function ArchiveView({ entries, onEdit, highlightEntryId = null }: ArchiveViewProps) {
  const { theme } = useThemeContext();
  const { isAdminAuthenticated } = useAdminAuth();
  const [displayMode, setDisplayMode] = useState<ArchiveDisplayMode>('cards');
  const [headerStyle, setHeaderStyle] = useState<ArchiveHeaderStyle>('simple');
  const [useNaturalTime, setUseNaturalTime] = useState(true);
  const [previewTarget, setPreviewTarget] = useState<DiaryEntry | null>(null);
  const isMobile = useIsMobile();
  const deferredEntries = useDeferredValue(entries);

  const archiveGroups = useMemo(() => createArchiveGroups(deferredEntries, useNaturalTime), [deferredEntries, useNaturalTime]);
  const orderedArchiveEntries = useMemo(() => flattenDisplayedArchiveEntries(archiveGroups), [archiveGroups]);
  const matchedPreviewIndex = findDiaryEntryIndex(orderedArchiveEntries, previewTarget);
  const previewIndex = matchedPreviewIndex >= 0 ? matchedPreviewIndex : null;
  const previewEntry = previewIndex === null ? null : orderedArchiveEntries[previewIndex] ?? null;
  const previewIndexByEntry = useMemo(
    () => new Map(orderedArchiveEntries.map((entry, index) => [entry, index])),
    [orderedArchiveEntries]
  );
  const {
    allExpanded,
    expandedGroups,
    expandedSubGroups,
    toggleExpandAll,
    toggleGroup,
    toggleSubGroup,
  } = useArchiveExpansionState(archiveGroups);
  useArchiveHighlightScroll(highlightEntryId);

  if (deferredEntries.length === 0) {
    return (
      <ContentStatePanel
        icon={<Calendar className="h-7 w-7" />}
        eyebrow="archive empty"
        title="归档区还没有可整理的内容"
        description="先写下第一篇日记，归档视图会按时间自动整理成更适合回看的结构。"
        isMobile={isMobile}
      />
    );
  }

  const renderEntry = (entry: DiaryEntry, index: number) => {
    const isHighlighted = highlightEntryId === entry.id;
    const entryIndex = previewIndexByEntry.get(entry) ?? index;

    return (
      <ArchiveEntryRenderer
        key={getDiaryEntryKey(entry, entryIndex)}
        entry={entry}
        displayMode={displayMode}
        theme={theme}
        isAdminAuthenticated={isAdminAuthenticated}
        isMobile={isMobile}
        onEdit={onEdit}
        onPreview={setPreviewTarget}
        isHighlighted={isHighlighted}
      />
    );
  };

  const renderEntryCollection = (groupEntries: DiaryEntry[]) => (
    <div
      className={displayModeClasses[displayMode]}
      style={{ borderColor: displayMode === 'list' ? theme.colors.border : 'transparent' }}
    >
      {groupEntries.map(renderEntry)}
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <ArchiveControls
        theme={theme}
        displayMode={displayMode}
        headerStyle={headerStyle}
        useNaturalTime={useNaturalTime}
        expandedAll={allExpanded}
        onDisplayModeChange={setDisplayMode}
        onHeaderStyleChange={setHeaderStyle}
        onUseNaturalTimeChange={setUseNaturalTime}
        onToggleExpandAll={toggleExpandAll}
      />

      {archiveGroups.length > 1 && (
        <div
          className="flex gap-2 overflow-x-auto rounded-[1.4rem] p-2"
          style={{
            backgroundColor: theme.mode === 'dark' ? 'rgba(55, 65, 81, 0.5)' : '#f3f4f6',
            border: `1px solid ${theme.colors.border}`,
          }}
        >
          {archiveGroups.map((group) => (
            <button
              key={group.key}
              type="button"
              onClick={() => {
                document.getElementById(`archive-group-${group.key}`)?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start',
                });
              }}
              className="shrink-0 rounded-2xl px-3 py-2 text-left transition-transform duration-200 hover:-translate-y-0.5"
              style={{
                backgroundColor: theme.mode === 'dark' ? '#1f2937' : theme.colors.surface,
                border: `1px solid ${theme.colors.border}`,
                color: theme.colors.text,
              }}
            >
              <div className="text-sm font-semibold">{group.title}</div>
              <div className="mt-1 text-xs" style={{ color: theme.colors.textSecondary }}>
                {group.count} 篇
              </div>
            </button>
          ))}
        </div>
      )}

      {archiveGroups.map((group) => (
        <div key={group.key} id={`archive-group-${group.key}`} className="space-y-4 scroll-mt-32">
          <ArchiveGroupHeader
            group={group}
            headerStyle={headerStyle}
            expanded={expandedGroups.has(group.key)}
            isMobile={isMobile}
            theme={theme}
            onToggle={() => toggleGroup(group.key)}
          />

          {/* 分组内容 */}
          {expandedGroups.has(group.key) && (
            <div className="ml-6">
              {group.subGroups && group.subGroups.length > 0 ? (
                // 有子分组时显示子分组
                <div className="space-y-4">
                  {group.subGroups.map((subGroup) => (
                    <div key={subGroup.key} className="space-y-2">
                      {/* 子分组标题 */}
                      <button
                        onClick={() => toggleSubGroup(subGroup.key)}
                        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                      >
                        {expandedSubGroups.has(subGroup.key) ? (
                          <ChevronDown className="w-3 h-3" style={{ color: theme.colors.primary }} />
                        ) : (
                          <ChevronRight className="w-3 h-3" style={{ color: theme.colors.primary }} />
                        )}
                        <span className="text-sm font-medium"
                              style={{ color: theme.colors.text }}>
                          {subGroup.title} ({subGroup.count})
                        </span>
                      </button>

                      {/* 子分组内容 */}
                      {expandedSubGroups.has(subGroup.key) && (
                        <div className="ml-4">
                          {renderEntryCollection(subGroup.entries)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                // 没有子分组时直接显示条目
                renderEntryCollection(group.entries)
              )}
            </div>
          )}
        </div>
      ))}

      <EntryPreviewModal
        entry={previewEntry}
        isOpen={previewEntry !== null}
        onClose={() => setPreviewTarget(null)}
        onEdit={onEdit}
        currentIndex={previewIndex}
        totalCount={orderedArchiveEntries.length}
        hasPrevious={previewIndex !== null && previewIndex > 0}
        hasNext={previewIndex !== null && previewIndex < orderedArchiveEntries.length - 1}
        onPrevious={() => {
          if (previewIndex !== null && previewIndex > 0) {
            setPreviewTarget(orderedArchiveEntries[previewIndex - 1] ?? null);
          }
        }}
        onNext={() => {
          if (previewIndex !== null && previewIndex < orderedArchiveEntries.length - 1) {
            setPreviewTarget(orderedArchiveEntries[previewIndex + 1] ?? null);
          }
        }}
      />
    </div>
  );
}
