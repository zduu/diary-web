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
import { getDiaryEntryDomId, hasPersistedDiaryEntryId } from '../utils/diaryEntryIdentity.ts';
import {
  sanitizeEntryContent,
  sanitizeEntryContentType,
  sanitizeEntryHidden,
  sanitizeEntryMood,
  sanitizeEntryTags,
  sanitizeEntryTitle,
  sanitizeEntryWeather,
} from '../utils/entryTextValidation.ts';
import { getRenderableEntryImages } from './entry/entryImages';
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

  const mood = sanitizeEntryMood(entry.mood);
  const weather = sanitizeEntryWeather(entry.weather);
  const contentType = sanitizeEntryContentType(entry.content_type);
  const isHidden = sanitizeEntryHidden(entry.hidden);
  const entryTitle = sanitizeEntryTitle(entry.title, '未命名日记');
  const entryContent = sanitizeEntryContent(entry.content);
  const timeDisplay = getSmartTimeDisplay(entry.created_at);
  const preview = createEntryPreview(entryContent);
  const highlightedExcerpt = buildHighlightedExcerpt(entryContent, searchQuery);
  const renderableImages = getRenderableEntryImages(entry.images);
  const entryTags = sanitizeEntryTags(entry.tags);
  const hasLongContent = preview.length > 160;
  const hasMoreImages = renderableImages.length > 2;
  const hasMoreTags = entryTags.length > 4;
  const canExpand = isMobile && (hasLongContent || hasMoreImages || hasMoreTags || Boolean(entry.location));
  const compactMode = isMobile && canExpand && !isExpanded;
  const visibleTags = compactMode ? entryTags.slice(0, 3) : entryTags;
  const visibleImages = compactMode ? renderableImages.slice(0, 2) : renderableImages;
  const canEdit = Boolean(onEdit && isAdminAuthenticated && hasPersistedDiaryEntryId(entry));

  const cardStyle: CSSProperties = {
    backgroundColor: theme.mode === 'dark' ? '#1f2937' : theme.colors.surface,
    border: `1px solid ${isHighlighted ? theme.colors.primary : theme.mode === 'dark' ? '#3a465c' : theme.colors.border}`,
    boxShadow:
      isHighlighted
        ? `0 0 0 2px ${theme.colors.primary}20, 0 4px 12px rgba(0, 0, 0, 0.1)`
        : theme.mode === 'dark'
          ? '0 18px 40px rgba(2, 6, 16, 0.5)'
          : '0 4px 12px rgba(0, 0, 0, 0.05)',
  };
  const handleImageClick = (index: number) => {
    setSelectedImageIndex(index);
    setImageViewerOpen(true);
  };

  return (
    <article
      id={getDiaryEntryDomId(entry)}
      className={`diary-card rounded-[1.6rem] p-5 transition-shadow transition-colors duration-300 md:p-6 ${contentType === 'markdown' ? 'rich-content-entry' : ''} ${isHighlighted ? 'ring-highlight' : ''}`}
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
            {isHidden && (
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
            title={highlightText(entryTitle === '无标题' ? '未命名日记' : entryTitle, searchQuery)}
            subtitle={<>记录于 {formatFullDateTime(entry.created_at)}</>}
            isMobile={isMobile}
          />

          {highlightedExcerpt && (
            <EntryExcerptBlock theme={theme} className="mt-3">
              命中摘要: {highlightText(highlightedExcerpt, searchQuery)}
            </EntryExcerptBlock>
          )}
        </div>

        {canEdit && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              onEdit?.(entry);
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
            {getEntryPreview(entryContent, 160)}
          </p>
        ) : contentType === 'markdown' ? (
          <LazyMarkdownRenderer content={entryContent} />
        ) : (
          <p className="whitespace-pre-wrap text-[15px] leading-8 md:text-base" style={{ color: theme.colors.text }}>
            {entryContent}
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
            extraCount={compactMode && hasMoreTags ? entryTags.length - visibleTags.length : 0}
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

      {renderableImages.length > 0 && imageViewerOpen && (
        <Suspense fallback={null}>
          <ImageViewer
            images={renderableImages}
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
