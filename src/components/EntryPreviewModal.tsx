import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import type { DiaryEntry } from '../types/index.ts';
import { ModalShell } from './ModalShell';
import { ModalHeader } from './ModalHeader';
import { LazyMarkdownRenderer } from './LazyMarkdownRenderer';
import { useThemeContext } from './ThemeProvider';
import { EntryMetaPill, EntryTagList, EntryTitleBlock } from './entry/entryDisplay';
import { formatFullDateTime } from '../utils/timeUtils.ts';
import { useIsMobile } from '../hooks/useIsMobile';

const ImageViewer = lazy(() =>
  import('./ImageViewer').then((module) => ({ default: module.ImageViewer }))
);

interface EntryPreviewModalProps {
  entry: DiaryEntry | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (entry: DiaryEntry) => void;
  currentIndex?: number | null;
  totalCount?: number;
  hasPrevious?: boolean;
  hasNext?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
}

export function EntryPreviewModal({
  entry,
  isOpen,
  onClose,
  onEdit,
  currentIndex = null,
  totalCount = 0,
  hasPrevious = false,
  hasNext = false,
  onPrevious,
  onNext,
}: EntryPreviewModalProps) {
  const { theme } = useThemeContext();
  const isMobile = useIsMobile();
  const [activePreviewImageIndex, setActivePreviewImageIndex] = useState(0);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [imageViewerIndex, setImageViewerIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  useEffect(() => {
    setActivePreviewImageIndex(0);
    setImageViewerOpen(false);
    setImageViewerIndex(0);
  }, [entry?.id, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }

      if (event.key === 'ArrowLeft' && hasPrevious && onPrevious) {
        event.preventDefault();
        onPrevious();
      }

      if (event.key === 'ArrowRight' && hasNext && onNext) {
        event.preventDefault();
        onNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasNext, hasPrevious, isOpen, onClose, onNext, onPrevious]);

  if (!entry) {
    return null;
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      zIndex={9998}
      backdropStyle={{
        backgroundColor: 'rgba(15, 23, 42, 0.36)',
        backdropFilter: 'blur(10px)',
      }}
      panelClassName={`mx-4 w-full max-w-3xl overflow-hidden rounded-[2rem] ${theme.effects.blur}`}
      panelStyle={{
        backgroundColor: theme.mode === 'dark' ? 'rgba(10, 18, 28, 0.82)' : theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        boxShadow:
          theme.mode === 'dark'
            ? '0 30px 70px rgba(4, 10, 18, 0.38)'
            : '0 24px 56px rgba(15, 23, 42, 0.14)',
      }}
    >
      <ModalHeader
        title="日记预览"
        onClose={onClose}
        actions={
          <>
            {(hasPrevious || hasNext) && (
              <div className={`flex items-center ${isMobile ? 'gap-1.5' : 'gap-2'}`}>
                {currentIndex !== null && totalCount > 0 && (
                  <div
                    className={`rounded-xl text-sm ${isMobile ? 'px-2.5 py-1.5' : 'px-3 py-2'}`}
                    style={{
                      backgroundColor: theme.colors.surface,
                      border: `1px solid ${theme.colors.border}`,
                      color: theme.colors.textSecondary,
                    }}
                  >
                    {currentIndex + 1} / {totalCount}
                  </div>
                )}
                <button
                  type="button"
                  onClick={onPrevious}
                  disabled={!hasPrevious}
                  className={`rounded-xl text-sm transition-transform duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 ${isMobile ? 'px-2.5 py-1.5' : 'px-3 py-2'}`}
                  style={{
                    backgroundColor: theme.colors.surface,
                    border: `1px solid ${theme.colors.border}`,
                    color: theme.colors.text,
                  }}
                >
                  <span className="inline-flex items-center gap-1">
                    <ChevronLeft className="h-4 w-4" />
                    上一条
                  </span>
                </button>
                <button
                  type="button"
                  onClick={onNext}
                  disabled={!hasNext}
                  className={`rounded-xl text-sm transition-transform duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 ${isMobile ? 'px-2.5 py-1.5' : 'px-3 py-2'}`}
                  style={{
                    backgroundColor: theme.colors.surface,
                    border: `1px solid ${theme.colors.border}`,
                    color: theme.colors.text,
                  }}
                >
                  <span className="inline-flex items-center gap-1">
                    下一条
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </button>
              </div>
            )}
            {onEdit ? (
              <button
                type="button"
                onClick={() => onEdit(entry)}
                className={`rounded-xl text-sm font-medium transition-transform duration-200 hover:-translate-y-0.5 ${isMobile ? 'px-2.5 py-1.5' : 'px-3 py-2'}`}
                style={{
                  background: `linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.accent})`,
                  color: '#ffffff',
                }}
              >
                编辑
              </button>
            ) : null}
          </>
        }
      />

      <div
        className={`max-h-[80vh] overflow-y-auto ${isMobile ? 'px-4 py-4' : 'px-6 py-5 md:px-7'}`}
        onTouchStart={(event) => {
          touchStartX.current = event.touches[0]?.clientX ?? null;
          touchEndX.current = null;
        }}
        onTouchMove={(event) => {
          touchEndX.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={() => {
          if (touchStartX.current === null || touchEndX.current === null) {
            return;
          }

          const deltaX = touchStartX.current - touchEndX.current;

          if (deltaX > 56 && hasNext && onNext) {
            onNext();
          }

          if (deltaX < -56 && hasPrevious && onPrevious) {
            onPrevious();
          }

          touchStartX.current = null;
          touchEndX.current = null;
        }}
      >
        <div className={isMobile ? 'mb-4' : 'mb-5'}>
          <EntryTitleBlock
            theme={theme}
            title={entry.title || '无标题'}
            subtitle={<>记录于 {formatFullDateTime(entry.created_at!)}</>}
            isMobile={isMobile}
          />
        </div>

        <div className={`mb-4 flex flex-wrap ${isMobile ? 'gap-1.5 text-xs' : 'gap-2 text-sm'}`} style={{ color: theme.colors.textSecondary }}>
          <EntryMetaPill theme={theme}>
            <Calendar className="h-3.5 w-3.5" />
            {formatFullDateTime(entry.created_at!)}
          </EntryMetaPill>
          {entry.location?.name && (
            <EntryMetaPill theme={theme}>
              <MapPin className="h-3.5 w-3.5" />
              {entry.location.name}
            </EntryMetaPill>
          )}
        </div>

        {entry.tags && entry.tags.length > 0 && (
          <div className={isMobile ? 'mb-4' : 'mb-5'}>
            <EntryTagList theme={theme} tags={entry.tags} isMobile={isMobile} />
          </div>
        )}

        {entry.content_type === 'markdown' ? (
          <LazyMarkdownRenderer content={entry.content} />
        ) : (
          <div className="whitespace-pre-wrap text-[15px] leading-8 md:text-base" style={{ color: theme.colors.text }}>
            {entry.content}
          </div>
        )}

        {entry.images && entry.images.length > 0 && (
          <div className={`${isMobile ? 'mt-5 space-y-2.5' : 'mt-6 space-y-3'}`}>
            <button
              type="button"
              onClick={() => {
                setImageViewerIndex(activePreviewImageIndex);
                setImageViewerOpen(true);
              }}
              className={`block w-full overflow-hidden ${isMobile ? 'rounded-[1.25rem]' : 'rounded-[1.6rem]'}`}
              style={{ border: `1px solid ${theme.colors.border}` }}
            >
              <img
                src={entry.images[activePreviewImageIndex]}
                alt={`预览图片 ${activePreviewImageIndex + 1}`}
                className="aspect-[16/10] w-full object-cover transition-transform duration-200 hover:scale-[1.02]"
                decoding="async"
              />
            </button>

            {entry.images.length > 1 && (
              <div className={`flex overflow-x-auto pb-1 ${isMobile ? 'gap-1.5' : 'gap-2'}`}>
                {entry.images.map((imageUrl, index) => {
                  const isActive = index === activePreviewImageIndex;

                  return (
                    <button
                      key={`${imageUrl}-${index}`}
                      type="button"
                      onClick={() => setActivePreviewImageIndex(index)}
                      className="shrink-0 overflow-hidden rounded-xl transition-transform duration-200 hover:-translate-y-0.5"
                      style={{
                        width: isMobile ? '74px' : '92px',
                        border: `2px solid ${isActive ? theme.colors.primary : theme.colors.border}`,
                        boxShadow: isActive ? '0 10px 22px rgba(37, 99, 235, 0.16)' : 'none',
                      }}
                    >
                      <img
                        src={imageUrl}
                        alt={`缩略图 ${index + 1}`}
                        className="aspect-[4/3] w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {entry.images && entry.images.length > 0 && (
        <Suspense fallback={null}>
          <ImageViewer
            images={entry.images}
            initialIndex={imageViewerIndex}
            isOpen={imageViewerOpen}
            onClose={() => setImageViewerOpen(false)}
          />
        </Suspense>
      )}
    </ModalShell>
  );
}
