import type { DiaryEntry } from '../types/index.ts';
import { isPersistedDiaryEntryId } from './diaryEntryIdentity.ts';
import { parseTimeString } from './timestampUtils.ts';

export function getEntryTimestamp(value?: string | null): number | null {
  const date = parseTimeString(value);
  return date ? date.getTime() : null;
}

function compareOptionalTimestampsDescending(left: number | null, right: number | null) {
  if (left === right) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return right - left;
}

export function compareDiaryEntriesByTime(left: DiaryEntry, right: DiaryEntry) {
  const createdAtDiff = compareOptionalTimestampsDescending(
    getEntryTimestamp(left.created_at),
    getEntryTimestamp(right.created_at)
  );

  if (createdAtDiff !== 0) {
    return createdAtDiff;
  }

  const updatedAtDiff = compareOptionalTimestampsDescending(
    getEntryTimestamp(left.updated_at),
    getEntryTimestamp(right.updated_at)
  );

  if (updatedAtDiff !== 0) {
    return updatedAtDiff;
  }

  const leftId = isPersistedDiaryEntryId(left.id) ? left.id : 0;
  const rightId = isPersistedDiaryEntryId(right.id) ? right.id : 0;
  return rightId - leftId;
}

export function sortDiaryEntriesByTime(entries: DiaryEntry[]) {
  return [...entries].sort(compareDiaryEntriesByTime);
}

export function getValidEntryDateRange(entries: DiaryEntry[]) {
  const sortedEntries = sortDiaryEntriesByTime(entries)
    .filter((entry) => getEntryTimestamp(entry.created_at) !== null);

  return {
    latestEntryDate: sortedEntries[0]?.created_at ?? null,
    firstEntryDate: sortedEntries[sortedEntries.length - 1]?.created_at ?? null,
  };
}
