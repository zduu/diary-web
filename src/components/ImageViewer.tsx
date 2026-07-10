import { useState, useEffect, useMemo } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useIsMobile } from '../hooks/useIsMobile';
import { ModalShell } from './ModalShell';
import { clampImageIndex, getRenderableEntryImages } from './entry/entryImages';

interface ImageViewerProps {
  images: string[];
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
}

export function ImageViewer({ images, initialIndex, isOpen, onClose }: ImageViewerProps) {
  const renderableImages = useMemo(() => getRenderableEntryImages(images), [images]);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const isMobile = useIsMobile();
  useBodyScrollLock(isOpen && renderableImages.length > 0);

  useEffect(() => {
    setCurrentIndex(clampImageIndex(initialIndex, renderableImages.length));
  }, [initialIndex, renderableImages.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          if (renderableImages.length === 0) return;
          setCurrentIndex((prev) => prev > 0 ? prev - 1 : renderableImages.length - 1);
          break;
        case 'ArrowRight':
          if (renderableImages.length === 0) return;
          setCurrentIndex((prev) => prev < renderableImages.length - 1 ? prev + 1 : 0);
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, renderableImages.length]);

  if (!isOpen || renderableImages.length === 0) return null;

  const displayIndex = clampImageIndex(currentIndex, renderableImages.length);

  const goToPrevious = () => {
    setCurrentIndex((prev) => prev > 0 ? prev - 1 : renderableImages.length - 1);
  };

  const goToNext = () => {
    setCurrentIndex((prev) => prev < renderableImages.length - 1 ? prev + 1 : 0);
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      zIndex={100010}
      padding="0"
      backdropStyle={{
        backgroundColor: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(6px)',
      }}
      panelClassName="relative flex items-center justify-center"
      panelStyle={{
        maxWidth: isMobile ? '100vw' : '90vw',
        maxHeight: isMobile ? '100dvh' : '90vh',
        width: isMobile ? '100vw' : undefined,
        background: 'transparent',
        border: 'none',
        boxShadow: 'none',
        paddingTop: isMobile ? 'max(16px, var(--safe-area-top))' : undefined,
        paddingBottom: isMobile ? 'max(16px, var(--safe-area-bottom))' : undefined,
        paddingLeft: isMobile ? 'max(12px, var(--safe-area-left))' : undefined,
        paddingRight: isMobile ? 'max(12px, var(--safe-area-right))' : undefined,
      }}
    >
      <div
        className="relative flex items-center justify-center"
        style={{
          maxWidth: isMobile ? '100vw' : '90vw',
          maxHeight: isMobile ? '100dvh' : '90vh',
          width: isMobile ? '100vw' : undefined,
          paddingTop: isMobile ? 'max(16px, var(--safe-area-top))' : undefined,
          paddingBottom: isMobile ? 'max(16px, var(--safe-area-bottom))' : undefined,
          paddingLeft: isMobile ? 'max(12px, var(--safe-area-left))' : undefined,
          paddingRight: isMobile ? 'max(12px, var(--safe-area-right))' : undefined,
        }}
      >
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute z-10 p-2 rounded-full bg-black bg-opacity-50 text-white hover:bg-opacity-70 transition-all duration-200"
          style={{ top: isMobile ? 'max(12px, var(--safe-area-top))' : '16px', right: isMobile ? 'max(12px, var(--safe-area-right))' : '16px' }}
        >
          <X className="w-6 h-6" />
        </button>

        {/* 左箭头 */}
        {renderableImages.length > 1 && (
          <button
            onClick={goToPrevious}
            className="absolute left-4 z-10 p-2 rounded-full bg-black bg-opacity-50 text-white hover:bg-opacity-70 transition-all duration-200"
            style={{ left: isMobile ? 'max(8px, var(--safe-area-left))' : '16px' }}
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* 右箭头 */}
        {renderableImages.length > 1 && (
          <button
            onClick={goToNext}
            className="absolute z-10 p-2 rounded-full bg-black bg-opacity-50 text-white hover:bg-opacity-70 transition-all duration-200"
            style={{ right: isMobile ? 'max(8px, var(--safe-area-right))' : '16px' }}
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}

        {/* 图片 */}
        <img
          src={renderableImages[displayIndex]}
          alt={`图片 ${displayIndex + 1}`}
          className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
          decoding="async"
          style={{ maxWidth: isMobile ? '100%' : '90vw', maxHeight: isMobile ? 'calc(100dvh - 120px)' : '90vh' }}
        />

        {/* 图片计数器 */}
        {renderableImages.length > 1 && (
          <div
            className="absolute left-1/2 transform -translate-x-1/2 px-3 py-1 rounded-full bg-black bg-opacity-50 text-white text-sm"
            style={{ bottom: isMobile ? 'max(12px, var(--safe-area-bottom))' : '16px' }}
          >
            {displayIndex + 1} / {renderableImages.length}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
