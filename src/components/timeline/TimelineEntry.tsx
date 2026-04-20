import { Clock, Edit, MapPin } from 'lucide-react';
import type { DiaryEntry, LocationInfo } from '../../types/index.ts';
import { LazyMarkdownRenderer } from '../LazyMarkdownRenderer';
import { useThemeContext } from '../ThemeProvider';
import { formatFullDateTime, getSmartTimeDisplay } from '../../utils/timeUtils.ts';
import { buildHighlightedExcerpt, highlightText } from '../../utils/searchHighlight.tsx';
import {
  EntryExcerptBlock,
  EntryImageGrid,
  EntryMetaPill,
  EntryTagList,
  EntryTitleBlock,
} from '../entry/entryDisplay';
import {
  getEntryMoodEmoji,
  getEntryMoodLabel,
  getEntryWeatherIcon,
  getEntryWeatherLabel,
} from '../entry/entryMeta';

interface TimelineEntryProps {
  entry: DiaryEntry;
  index: number;
  totalEntries: number;
  isHighlighted?: boolean;
  isMobile: boolean;
  isAdminAuthenticated: boolean;
  onPreview?: (entry: DiaryEntry) => void;
  searchQuery?: string;
  onEdit?: (entry: DiaryEntry) => void;
  onImageClick: (images: string[], index: number) => void;
  onLocationClick: (location: LocationInfo) => void;
}

export function TimelineEntry({
  entry,
  index,
  totalEntries,
  isHighlighted = false,
  isMobile,
  isAdminAuthenticated,
  onPreview,
  searchQuery = '',
  onEdit,
  onImageClick,
  onLocationClick,
}: TimelineEntryProps) {
  const { theme } = useThemeContext();
  const timeDisplay = getSmartTimeDisplay(entry.created_at!);
  const mood = entry.mood || 'neutral';
  const weather = entry.weather || 'unknown';
  const moodEmoji = getEntryMoodEmoji(mood);
  const weatherIcon = getEntryWeatherIcon(weather);
  const moodLabel = getEntryMoodLabel(mood);
  const weatherLabel = getEntryWeatherLabel(weather);
  const highlightedExcerpt = buildHighlightedExcerpt(entry.content, searchQuery);
  const entryTextClassName = `whitespace-pre-wrap leading-8 ${isMobile ? 'text-sm' : 'text-base'}`;
  const moodText = isMobile ? moodLabel : `心情 ${moodLabel}`;
  const weatherText = isMobile ? weatherLabel : `天气 ${weatherLabel}`;

  return (
    <div
      className={`timeline-entry-shell relative ${entry.content_type === 'markdown' ? 'rich-content-entry' : ''}`}
      onClick={() => onPreview?.(entry)}
    >
      <div
        className={`absolute ${isMobile ? 'left-3.5 h-4 w-4' : 'left-6 h-6 w-6'} top-0 z-10 rounded-full border-2`}
        style={{
          backgroundColor: theme.mode === 'dark' ? '#1f2937' : theme.colors.surface,
          borderColor: theme.mode === 'dark' ? theme.colors.accent : theme.colors.primary,
          boxShadow: theme.mode === 'dark'
            ? '0 2px 8px rgba(0, 0, 0, 0.4)'
            : `0 2px 8px ${theme.colors.primary}25`,
        }}
      />

      <div
        id={entry.id ? `entry-${entry.id}` : undefined}
        className={`${isMobile ? 'ml-10' : 'ml-16'} relative transition-shadow transition-colors duration-300 ${isMobile ? 'pb-8' : 'pb-12'} ${isHighlighted ? 'ring-highlight rounded-[1.4rem] px-4 pt-3' : ''}`}
        style={{
          backgroundColor: isHighlighted
            ? theme.mode === 'dark'
              ? 'rgba(55, 65, 81, 0.3)'
              : `${theme.colors.primary}08`
            : 'transparent',
          borderBottom: index < totalEntries - 1
            ? `1px solid ${theme.mode === 'dark' ? '#374151' : theme.colors.border}40`
            : 'none',
          boxShadow: isHighlighted ? `0 0 0 2px ${theme.colors.primary}20` : 'none',
        }}
      >
        <div className={`flex items-center gap-4 ${isMobile ? 'mb-3' : 'mb-4'}`}>
          <div
            className={`flex items-center gap-2 font-medium ${isMobile ? 'text-sm' : 'text-base'}`}
            style={{
              color: theme.mode === 'dark' ? theme.colors.text : theme.colors.primary,
            }}
          >
            <Clock className={isMobile ? 'h-4 w-4' : 'h-5 w-5'} />
            <span>{timeDisplay.relative}</span>
          </div>

          {onEdit && isAdminAuthenticated && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(entry);
              }}
              className="rounded-full p-1.5 opacity-60 transition-all duration-200 hover:scale-110 hover:opacity-100"
              style={{
                color: theme.colors.textSecondary,
                backgroundColor: `${theme.colors.primary}10`,
              }}
              title="编辑"
            >
              <Edit className="h-4 w-4" />
            </button>
          )}
        </div>

        {entry.title && entry.title !== '无标题' && (
          <EntryTitleBlock
            theme={theme}
            title={highlightText(entry.title, searchQuery)}
            subtitle={<>记录于 {formatFullDateTime(entry.created_at!)}</>}
            hiddenLabel={entry.hidden ? '隐藏' : null}
            isMobile={isMobile}
            timeline
          />
        )}

        {highlightedExcerpt && (
          <EntryExcerptBlock theme={theme} isMobile={isMobile} className={isMobile ? 'mb-3' : 'mb-4'}>
            命中摘要: {highlightText(highlightedExcerpt, searchQuery)}
          </EntryExcerptBlock>
        )}

        <div className={isMobile ? 'mb-3' : 'mb-4'}>
          {entry.content_type === 'markdown' ? (
            <LazyMarkdownRenderer content={entry.content} />
          ) : (
            <div
              className={entryTextClassName}
              style={{
                color: theme.colors.text,
              }}
            >
              {entry.content}
            </div>
          )}
        </div>

        {entry.images && entry.images.length > 0 && (
          <div className={isMobile ? 'mb-3' : 'mb-4'}>
            <EntryImageGrid
              theme={theme}
              images={entry.images}
              isMobile={isMobile}
              onImageClick={(index) => onImageClick(entry.images!, index)}
              previewLabel="点击查看"
            />
          </div>
        )}

        {entry.tags && entry.tags.length > 0 && (
          <div className={isMobile ? 'mb-3' : 'mb-4'}>
            <EntryTagList theme={theme} tags={entry.tags} isMobile={isMobile} />
          </div>
        )}

        <div className={`flex flex-wrap items-center gap-3 ${isMobile ? 'text-xs' : 'text-sm'}`}>
          <EntryMetaPill theme={theme}>
            <span className={isMobile ? 'text-base' : 'text-lg'}>{moodEmoji}</span>
            <span>{moodText}</span>
          </EntryMetaPill>

          <EntryMetaPill theme={theme}>
            {weatherIcon}
            <span>{weatherText}</span>
          </EntryMetaPill>

          {entry.location && (
            <EntryMetaPill
              theme={theme}
              interactive
              onClick={(event) => {
                event.stopPropagation();
                onLocationClick(entry.location!);
              }}
              title="点击查看详细位置信息"
            >
              <MapPin className="h-4 w-4" />
              <span>{entry.location.name || '未知位置'}</span>
            </EntryMetaPill>
          )}
        </div>
      </div>
    </div>
  );
}
