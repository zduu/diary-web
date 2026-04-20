import { Edit, MapPin } from 'lucide-react';
import type { ThemeConfig } from '../hooks/useTheme';
import type { DiaryEntry } from '../types/index.ts';
import type { ArchiveDisplayMode } from './archive/archiveTypes';
import { getArchiveEntryIndicators, getArchiveEntryTimestamp } from './archive/archiveEntryMeta';
import { getEntryPreview } from './entry/entryContent';
import { EntrySummaryText, EntryTagList, EntryTitleBlock } from './entry/entryDisplay';

interface ArchiveEntryRendererProps {
  entry: DiaryEntry;
  displayMode: ArchiveDisplayMode;
  theme: ThemeConfig;
  isAdminAuthenticated: boolean;
  isMobile: boolean;
  onEdit?: (entry: DiaryEntry) => void;
  onPreview?: (entry: DiaryEntry) => void;
  isHighlighted?: boolean;
}

function ArchiveEditButton({
  entry,
  onEdit,
  theme,
  label = '编辑',
}: {
  entry: DiaryEntry;
  onEdit?: (entry: DiaryEntry) => void;
  theme: ThemeConfig;
  label?: string;
}) {
  if (!onEdit) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onEdit(entry);
      }}
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-transform duration-200 hover:-translate-y-0.5"
      style={{
        backgroundColor: theme.mode === 'dark' ? '#374151' : '#f3f4f6',
        border: `1px solid ${theme.colors.border}`,
        color: theme.colors.textSecondary,
      }}
      title="编辑这篇日记"
    >
      <Edit className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function ArchiveEntryMetaRow({
  entry,
  theme,
  moodDisplay,
  weatherDisplay,
}: {
  entry: DiaryEntry;
  theme: ThemeConfig;
  moodDisplay: string | null;
  weatherDisplay: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs">
      {entry.location?.name && (
        <div className="flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          <span style={{ color: theme.colors.textSecondary }}>{entry.location.name}</span>
        </div>
      )}
      {moodDisplay && <span className="text-sm">{moodDisplay}</span>}
      {weatherDisplay && <span className="text-sm">{weatherDisplay}</span>}
    </div>
  );
}

function ArchiveTagSection({
  entry,
  theme,
  isMobile,
  tagLimit,
  className = '',
}: {
  entry: DiaryEntry;
  theme: ThemeConfig;
  isMobile: boolean;
  tagLimit: number;
  className?: string;
}) {
  if (!entry.tags || entry.tags.length === 0) {
    return null;
  }

  const visibleTags = entry.tags.slice(0, tagLimit);

  return (
    <div className={className}>
      <EntryTagList
        theme={theme}
        tags={visibleTags}
        isMobile={isMobile}
        extraCount={Math.max(0, entry.tags.length - visibleTags.length)}
      />
    </div>
  );
}

export function ArchiveEntryRenderer({
  entry,
  displayMode,
  theme,
  isAdminAuthenticated,
  isMobile,
  onEdit,
  onPreview,
  isHighlighted = false,
}: ArchiveEntryRendererProps) {
  const { dateLabel, timeLabel } = getArchiveEntryTimestamp(entry.created_at!);
  const { moodDisplay, weatherDisplay } = getArchiveEntryIndicators(entry.mood, entry.weather);
  const canEdit = Boolean(onEdit && isAdminAuthenticated);
  const openPreview = () => onPreview?.(entry);

  if (displayMode === 'list') {
    return (
      <div
        id={entry.id ? `entry-${entry.id}` : undefined}
        className={`archive-entry-shell cursor-pointer p-4 transition-all duration-500 hover:bg-opacity-50 ${isHighlighted ? 'ring-highlight rounded-xl' : ''}`}
        style={{
          backgroundColor: isHighlighted ? (theme.mode === 'dark' ? 'rgba(55, 65, 81, 0.4)' : `${theme.colors.primary}08`) : 'transparent',
          boxShadow: isHighlighted ? `0 0 0 2px ${theme.colors.primary}20` : 'none',
        }}
        onClick={openPreview}
      >
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <div
              className={`flex h-12 w-12 flex-col items-center justify-center rounded-lg font-medium ${isMobile ? 'text-xs' : 'text-sm'}`}
              style={{
                backgroundColor: theme.mode === 'dark' ? '#374151' : '#eff6ff',
                color: theme.mode === 'dark' ? '#f9fafb' : theme.colors.primary,
              }}
            >
              <span>{dateLabel}</span>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <EntryTitleBlock
                  theme={theme}
                  title={entry.title || '无标题'}
                  isMobile={isMobile}
                  size="archive"
                  clampClassName="truncate"
                />
              </div>
              <div className="flex items-center gap-1">
                {moodDisplay && <span className="text-sm">{moodDisplay}</span>}
                {weatherDisplay && <span className="text-sm">{weatherDisplay}</span>}
              </div>
              {canEdit && <div className="ml-auto"><ArchiveEditButton entry={entry} onEdit={onEdit} theme={theme} /></div>}
            </div>

            <EntrySummaryText theme={theme} isMobile={isMobile} lines={2} className="mb-2">
              {getEntryPreview(entry.content, 100)}
            </EntrySummaryText>

            <ArchiveTagSection
              entry={entry}
              theme={theme}
              isMobile={isMobile}
              tagLimit={2}
              className="mb-2"
            />

            <ArchiveEntryMetaRow
              entry={entry}
              theme={theme}
              moodDisplay={null}
              weatherDisplay={null}
            />
          </div>
        </div>
      </div>
    );
  }

  if (displayMode === 'cards') {
    return (
      <div
        id={entry.id ? `entry-${entry.id}` : undefined}
        className={`archive-entry-shell cursor-pointer rounded-lg border p-4 transition-all hover:shadow-md ${isMobile ? 'mb-3' : 'mb-4'} ${isHighlighted ? 'ring-highlight' : ''}`}
        style={{
          backgroundColor: theme.mode === 'dark'
            ? '#1f2937'
            : isHighlighted
              ? `${theme.colors.primary}08`
              : theme.colors.surface,
          borderColor: theme.mode === 'dark'
            ? '#374151'
            : isHighlighted
              ? theme.colors.primary
              : theme.colors.border,
          boxShadow: isHighlighted ? `0 0 0 2px ${theme.colors.primary}20` : 'none',
        }}
        onClick={openPreview}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="rounded px-2 py-1 text-xs font-medium"
              style={{
                backgroundColor: `${theme.colors.primary}20`,
                color: theme.colors.primary,
              }}
            >
              {dateLabel}
            </div>
            <span className="text-xs" style={{ color: theme.colors.textSecondary }}>
              {timeLabel}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {moodDisplay && <span className="text-lg">{moodDisplay}</span>}
            {weatherDisplay && <span className="text-lg">{weatherDisplay}</span>}
            {canEdit && <ArchiveEditButton entry={entry} onEdit={onEdit} theme={theme} />}
          </div>
        </div>

        <EntryTitleBlock
          theme={theme}
          title={entry.title || '无标题'}
          isMobile={isMobile}
          size="archive"
          clampClassName="line-clamp-1"
        />

        <EntrySummaryText theme={theme} isMobile={isMobile} lines={3} className="mb-3">
          {getEntryPreview(entry.content, 140)}
        </EntrySummaryText>

        <ArchiveTagSection
          entry={entry}
          theme={theme}
          isMobile={isMobile}
          tagLimit={2}
          className="mb-3"
        />

        <ArchiveEntryMetaRow
          entry={entry}
          theme={theme}
          moodDisplay={null}
          weatherDisplay={null}
        />
      </div>
    );
  }

  if (displayMode === 'compact') {
    return (
      <div
        id={entry.id ? `entry-${entry.id}` : undefined}
        className={`archive-entry-shell flex cursor-pointer items-center gap-3 rounded-lg p-2 transition-all hover:bg-opacity-50 ${isHighlighted ? 'ring-highlight' : ''}`}
        style={{
          backgroundColor: theme.mode === 'dark'
            ? '#111827'
            : isHighlighted
              ? `${theme.colors.primary}08`
              : 'transparent',
          boxShadow: isHighlighted ? `0 0 0 2px ${theme.colors.primary}20` : 'none',
        }}
        onClick={openPreview}
      >
        <div className="flex-shrink-0 text-center">
          <div className={`${isMobile ? 'text-xs' : 'text-sm'} font-medium`} style={{ color: theme.colors.primary }}>
            {dateLabel}
          </div>
          <div className="text-xs" style={{ color: theme.colors.textSecondary }}>
            {timeLabel}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <EntryTitleBlock
                theme={theme}
                title={entry.title || '无标题'}
                isMobile={isMobile}
                size="compact"
                clampClassName="truncate"
              />
            </div>
            <div className="flex items-center gap-1">
              {moodDisplay && <span className="text-xs">{moodDisplay}</span>}
              {weatherDisplay && <span className="text-xs">{weatherDisplay}</span>}
            </div>
            {canEdit && <div className="ml-auto"><ArchiveEditButton entry={entry} onEdit={onEdit} theme={theme} label="" /></div>}
          </div>

          <EntrySummaryText theme={theme} isMobile={isMobile} lines={1}>
            {getEntryPreview(entry.content, 60)}
          </EntrySummaryText>
        </div>

        <ArchiveTagSection entry={entry} theme={theme} isMobile={isMobile} tagLimit={1} className="flex-shrink-0" />
      </div>
    );
  }

  return (
    <div id={entry.id ? `entry-${entry.id}` : undefined} className={`archive-entry-shell flex gap-4 pb-4 ${isHighlighted ? 'ring-highlight rounded-xl' : ''}`}>
      <div className="flex flex-col items-center">
        <div
          className="h-3 w-3 rounded-full border-2"
          style={{
            backgroundColor: theme.colors.primary,
            borderColor: theme.colors.primary,
          }}
        />
        <div className="mt-2 h-full w-0.5" style={{ backgroundColor: `${theme.colors.primary}30` }} />
      </div>

      <div
        className="flex-1 cursor-pointer rounded-lg p-3 transition-colors hover:bg-opacity-80"
        style={{
          backgroundColor: theme.mode === 'dark'
            ? '#1f2937'
            : isHighlighted
              ? `${theme.colors.primary}08`
              : theme.colors.surface,
          border: `1px solid ${theme.mode === 'dark' ? '#374151' : isHighlighted ? theme.colors.primary : theme.colors.border}`,
          boxShadow: isHighlighted ? `0 0 0 2px ${theme.colors.primary}20` : 'none',
        }}
        onClick={openPreview}
      >
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`${isMobile ? 'text-xs' : 'text-sm'} font-medium`} style={{ color: theme.colors.primary }}>
              {dateLabel} {timeLabel}
            </span>
            <div className="flex items-center gap-1">
              {moodDisplay && <span className="text-sm">{moodDisplay}</span>}
              {weatherDisplay && <span className="text-sm">{weatherDisplay}</span>}
            </div>
          </div>
          {canEdit && <ArchiveEditButton entry={entry} onEdit={onEdit} theme={theme} />}
        </div>

        <EntryTitleBlock
          theme={theme}
          title={entry.title || '无标题'}
          isMobile={isMobile}
          size="archive"
          clampClassName="line-clamp-1"
        />

        <EntrySummaryText theme={theme} isMobile={isMobile} lines={2} className="mb-2">
          {getEntryPreview(entry.content, 100)}
        </EntrySummaryText>

        <ArchiveTagSection
          entry={entry}
          theme={theme}
          isMobile={isMobile}
          tagLimit={3}
          className="mb-2"
        />

        <ArchiveEntryMetaRow
          entry={entry}
          theme={theme}
          moodDisplay={null}
          weatherDisplay={null}
        />
      </div>
    </div>
  );
}
