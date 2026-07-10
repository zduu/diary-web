import type { DiaryEntry } from '../../types/index.ts';
import {
  formatTimelineDate,
  getSmartTimeDisplay,
  type TimeDisplay,
} from '../../utils/timeUtils.ts';
import { getDiaryEntryKey } from '../../utils/diaryEntryIdentity.ts';
import { compareDiaryEntriesByTime } from '../../utils/entryTime.ts';

export interface TimelineDateItem {
  type: 'date';
  key: string;
  data: {
    anchorId: string;
    entryCount: number;
    dateGroup: string;
    isFirst: boolean;
  };
}

export interface TimelineTimeItem {
  type: 'time';
  key: string;
  data: {
    timeDisplay: TimeDisplay;
  };
}

export interface TimelineEntryItem {
  type: 'entry';
  key: string;
  data: DiaryEntry;
}

export type TimelineListItem = TimelineDateItem | TimelineTimeItem | TimelineEntryItem;

function createDateAnchorId(dateGroup: string, dateIndex: number) {
  const normalized = dateGroup
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `timeline-date-${dateIndex}-${normalized || 'group'}`;
}

export function groupEntriesByDate(entries: DiaryEntry[]): Record<string, DiaryEntry[]> {
  const groups: Record<string, DiaryEntry[]> = {};

  entries.forEach((entry) => {
    const dateGroup = formatTimelineDate(entry.created_at);

    if (!groups[dateGroup]) {
      groups[dateGroup] = [];
    }

    groups[dateGroup].push(entry);
  });

  Object.keys(groups).forEach((key) => {
    groups[key].sort(compareDiaryEntriesByTime);
  });

  return Object.fromEntries(
    Object.entries(groups).sort(([, aEntries], [, bEntries]) =>
      compareDiaryEntriesByTime(aEntries[0]!, bEntries[0]!)
    )
  );
}

export function createTimelineItems(entries: DiaryEntry[]): TimelineListItem[] {
  const groupedEntries = groupEntriesByDate(entries);
  const items: TimelineListItem[] = [];
  let fallbackEntryIndex = 0;

  Object.entries(groupedEntries).forEach(([dateGroup, groupedDateEntries], dateIndex) => {
    items.push({
      type: 'date',
      key: `date-${dateGroup}`,
      data: {
        anchorId: createDateAnchorId(dateGroup, dateIndex),
        entryCount: groupedDateEntries.length,
        dateGroup,
        isFirst: dateIndex === 0,
      },
    });

    groupedDateEntries.forEach((entry, entryIndex) => {
      const entryKeySegment = getDiaryEntryKey(entry, fallbackEntryIndex);
      fallbackEntryIndex += 1;

      if (entryIndex > 0) {
        items.push({
          type: 'time',
          key: `time-${dateGroup}-${entryKeySegment}`,
          data: {
            timeDisplay: getSmartTimeDisplay(entry.created_at),
          },
        });
      }

      items.push({
        type: 'entry',
        key: `entry-${dateGroup}-${entryKeySegment}`,
        data: entry,
      });
    });
  });

  return items;
}
