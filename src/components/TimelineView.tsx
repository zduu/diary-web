import { lazy, Suspense, useMemo, useState } from 'react';
import type { DiaryEntry, LocationInfo } from '../types/index.ts';
import { useAdminAuth } from './AdminAuthContext';
import { useThemeContext } from './ThemeProvider';
import { ContentStatePanel } from './ContentStatePanel';
import { LocationDetailModal } from './LocationDetailModal';
import { TimelineEntry } from './timeline/TimelineEntry';
import { TimelineDateDivider } from './timeline/TimelineDateDivider';
import { TimelineDateNavigator } from './timeline/TimelineDateNavigator';
import { TimelineTimeDivider } from './timeline/TimelineTimeDivider';
import { createTimelineItems } from './timeline/timelineItems';
import { useActiveTimelineDateAnchor } from './timeline/useActiveTimelineDateAnchor';
import { useIsMobile } from '../hooks/useIsMobile';

const ImageViewer = lazy(() =>
  import('./ImageViewer').then((module) => ({ default: module.ImageViewer }))
);

interface TimelineViewProps {
  entries: DiaryEntry[];
  onEdit?: (entry: DiaryEntry) => void;
  onPreview?: (entry: DiaryEntry) => void;
  searchQuery?: string;
  highlightEntryId?: number | null;
}

export function TimelineView({ entries, onEdit, onPreview, searchQuery = '', highlightEntryId = null }: TimelineViewProps) {
  const { isAdminAuthenticated } = useAdminAuth();
  const { theme } = useThemeContext();
  const isMobile = useIsMobile();
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [locationDetailOpen, setLocationDetailOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<LocationInfo | null>(null);

  // 处理位置点击
  const handleLocationClick = (location: LocationInfo) => {
    setSelectedLocation(location);
    setLocationDetailOpen(true);
  };

  const handleImageClick = (images: string[], index: number) => {
    setSelectedImages(images);
    setSelectedImageIndex(index);
    setImageViewerOpen(true);
  };

  const timelineItems = useMemo(() => createTimelineItems(entries), [entries]);
  const dateItems = useMemo(
    () => timelineItems.filter((item) => item.type === 'date'),
    [timelineItems]
  );
  const activeDateAnchor = useActiveTimelineDateAnchor(dateItems);
  const entryIndexById = useMemo(
    () => new Map(entries.map((entry, index) => [entry.id, index])),
    [entries]
  );

  if (entries.length === 0) {
    return (
      <ContentStatePanel
        icon="📝"
        eyebrow="timeline empty"
        title="时间轴还没有内容"
        description="写下第一篇日记后，时间轴会从最近的记录开始铺开，方便连续回看。"
        isMobile={isMobile}
      />
    );
  }

  return (
    <div className="relative mx-auto max-w-4xl">
      <TimelineDateNavigator
        dateItems={dateItems}
        activeDateAnchor={activeDateAnchor}
        theme={theme}
      />

      <div
        className={`absolute ${isMobile ? 'bottom-0 left-5 top-0' : 'bottom-0 left-8 top-0'} w-0.5`}
        style={{
          backgroundColor: theme.mode === 'dark'
            ? 'rgba(226, 232, 240, 0.24)'
            : `${theme.colors.primary}40`
        }}
      />

      <div className={isMobile ? 'space-y-8' : 'space-y-12'}>
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

          const entryIndex = entryIndexById.get(item.data.id) ?? entries.length - 1;

          return (
            <TimelineEntry
              key={item.key}
              entry={item.data}
              index={entryIndex}
              totalEntries={entries.length}
              isHighlighted={highlightEntryId === item.data.id}
              isMobile={isMobile}
              isAdminAuthenticated={isAdminAuthenticated}
              onPreview={onPreview}
              onEdit={onEdit}
              onImageClick={handleImageClick}
              onLocationClick={handleLocationClick}
              searchQuery={searchQuery}
            />
          );
        })}
      </div>

      {imageViewerOpen && (
        <Suspense fallback={null}>
          <ImageViewer
            images={selectedImages}
            initialIndex={selectedImageIndex}
            isOpen={imageViewerOpen}
            onClose={() => setImageViewerOpen(false)}
          />
        </Suspense>
      )}

      <LocationDetailModal
        isOpen={locationDetailOpen}
        location={selectedLocation}
        onClose={() => setLocationDetailOpen(false)}
      />
    </div>
  );
}
