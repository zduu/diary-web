import { useState, Suspense, lazy, type CSSProperties } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Edit,
} from 'lucide-react';
import type { DiaryEntry } from '../types/index.ts';
import { LazyMarkdownRenderer } from './LazyMarkdownRenderer';
import { formatFullDateTime, getSmartTimeDisplay } from '../utils/timeUtils.ts';
import { useThemeContext } from './ThemeProvider';
import { useAdminAuth } from './AdminAuthContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { LocationDetailModal } from './LocationDetailModal';
import { createEntryPreview, getEntryPreview } from './entry/entryContent';
import {
  EntryExcerptBlock,
  EntryImageGrid,
  EntryMetaPill,
  EntryTagList,
  EntryTitleBlock,
} from './entry/entryDisplay';
import { buildHighlightedExcerpt, highlightText } from '../utils/searchHighlight.tsx';
import {
  getEntryMoodEmoji,
  getEntryMoodLabel,
  getEntryWeatherLabel,
} from './entry/entryMeta';

const ImageViewer = lazy(() =>
  import('./ImageViewer').then((module) => ({ default: module.ImageViewer }))
);

interface DiaryCardProps {
  entry: DiaryEntry;
  onEdit?: (entry: DiaryEntry) => void;
  onPreview?: (entry: DiaryEntry) => void;
  searchQuery?: string;
  isHighlighted?: boolean;
}

export function DiaryCard({ entry, onEdit, onPreview, searchQuery = '', isHighlighted = false }: DiaryCardProps) {
  const { theme } = useThemeContext();
  const { isAdminAuthenticated } = useAdminAuth();
  const [isExpanded, setIsExpanded] = useState(false);
  const isMobile = useIsMobile();
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [locationDetailOpen, setLocationDetailOpen] = useState(false);

  const mood = entry.mood || 'neutral';
  const weather = entry.weather || 'unknown';
  const timeDisplay = getSmartTimeDisplay(entry.created_at!);
  const preview = createEntryPreview(entry.content);
  const highlightedExcerpt = buildHighlightedExcerpt(entry.content, searchQuery);
  const hasLongContent = preview.length > 160;
  const hasMoreImages = (entry.images?.length || 0) > 2;
  const hasMoreTags = (entry.tags?.length || 0) > 4;
  const canExpand = isMobile && (hasLongContent || hasMoreImages || hasMoreTags || Boolean(entry.location));
  const compactMode = isMobile && canExpand && !isExpanded;
  const visibleTags = compactMode ? entry.tags?.slice(0, 3) : entry.tags;
  const visibleImages = compactMode ? entry.images?.slice(0, 2) : entry.images;

  const cardStyle: CSSProperties = {
    backgroundColor: theme.mode === 'dark' ? '#1f2937' : theme.colors.surface,
    border: `1px solid ${isHighlighted ? theme.colors.primary : theme.colors.border}`,
    boxShadow:
      isHighlighted
        ? `0 0 0 2px ${theme.colors.primary}20, 0 4px 12px rgba(0, 0, 0, 0.1)`
        : theme.mode === 'dark'
          ? '0 4px 12px rgba(0, 0, 0, 0.3)'
          : '0 4px 12px rgba(0, 0, 0, 0.05)',
  };
  const handleImageClick = (index: number) => {
    setSelectedImageIndex(index);
    setImageViewerOpen(true);
  };

  return (
    <article
      id={entry.id ? `entry-${entry.id}` : undefined}
      className={`diary-card rounded-[1.6rem] p-5 transition-shadow transition-colors duration-300 md:p-6 ${entry.content_type === 'markdown' ? 'rich-content-entry' : ''} ${isHighlighted ? 'ring-highlight' : ''}`}
      style={cardStyle}
      onClick={() => onPreview?.(entry)}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <EntryMetaPill theme={theme}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: theme.colors.primary }} aria-hidden="true" />
              {timeDisplay.relative}
            </EntryMetaPill>
            <EntryMetaPill theme={theme}>
              <span>{getEntryMoodEmoji(mood)}</span>
              {getEntryMoodLabel(mood)}
            </EntryMetaPill>
            <EntryMetaPill theme={theme}>
              {getEntryWeatherLabel(weather)}
            </EntryMetaPill>
            {entry.hidden && (
              <EntryMetaPill
                theme={theme}
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.22)',
                  color: '#dc2626',
                }}
              >
                仅管理员可见
              </EntryMetaPill>
            )}
          </div>

          <EntryTitleBlock
            theme={theme}
            title={highlightText(entry.title && entry.title !== '无标题' ? entry.title : '未命名日记', searchQuery)}
            subtitle={<>记录于 {formatFullDateTime(entry.created_at!)}</>}
            isMobile={isMobile}
          />

          {highlightedExcerpt && (
            <EntryExcerptBlock theme={theme} className="mt-3">
              命中摘要: {highlightText(highlightedExcerpt, searchQuery)}
            </EntryExcerptBlock>
          )}
        </div>

        {onEdit && isAdminAuthenticated && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              onEdit(entry);
            }}
            className="quiet-button rounded-xl p-2.5 transition-transform duration-200 hover:-translate-y-0.5"
            style={{
              backgroundColor: theme.mode === 'dark' ? '#374151' : '#f3f4f6',
              border: `1px solid ${theme.colors.border}`,
              color: theme.colors.textSecondary,
            }}
            title="编辑"
          >
            <Edit className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mb-5">
        {compactMode ? (
          <p className="text-[15px] leading-8 md:text-base" style={{ color: theme.colors.text }}>
            {getEntryPreview(entry.content, 160)}
          </p>
        ) : entry.content_type === 'markdown' ? (
          <LazyMarkdownRenderer content={entry.content} />
        ) : (
          <p className="whitespace-pre-wrap text-[15px] leading-8 md:text-base" style={{ color: theme.colors.text }}>
            {entry.content}
          </p>
        )}
      </div>

      {visibleImages && visibleImages.length > 0 && (
        <div className="mb-5">
          <EntryImageGrid
            theme={theme}
            images={visibleImages}
            isMobile={isMobile}
            onImageClick={handleImageClick}
          />
        </div>
      )}

      {visibleTags && visibleTags.length > 0 && (
        <div className="mb-5">
          <EntryTagList
            theme={theme}
            tags={visibleTags}
            isMobile={isMobile}
            extraCount={compactMode && hasMoreTags ? (entry.tags?.length || 0) - (visibleTags?.length || 0) : 0}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm" style={{ color: theme.colors.textSecondary }}>
        {entry.location && (
          <EntryMetaPill
            theme={theme}
            interactive
            onClick={(event) => {
              event.stopPropagation();
              setLocationDetailOpen(true);
            }}
            title="查看位置详情"
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: theme.colors.accent }} aria-hidden="true" />
            {entry.location.name || '位置详情'}
          </EntryMetaPill>
        )}

        {canExpand && (
          <EntryMetaPill
            theme={theme}
            interactive
            onClick={(event) => {
              event.stopPropagation();
              setIsExpanded((value) => !value);
            }}
            title={isExpanded ? '收起内容' : '展开内容'}
          >
            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {isExpanded ? '收起' : '展开'}
          </EntryMetaPill>
        )}
      </div>

      {entry.images && entry.images.length > 0 && imageViewerOpen && (
        <Suspense fallback={null}>
          <ImageViewer
            images={entry.images}
            initialIndex={selectedImageIndex}
            isOpen={imageViewerOpen}
            onClose={() => setImageViewerOpen(false)}
          />
        </Suspense>
      )}

      <LocationDetailModal
        isOpen={locationDetailOpen}
        location={entry.location || null}
        onClose={() => setLocationDetailOpen(false)}
      />
    </article>
  );
}
