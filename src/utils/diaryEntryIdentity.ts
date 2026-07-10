import type { DiaryEntry } from '../types/index.ts';

export function getDiaryEntryKey(entry: DiaryEntry, fallbackIndex: number) {
  if (isPersistedDiaryEntryId(entry.id)) {
    return `id-${entry.id}`;
  }

  const entryUuid = entry.entry_uuid?.trim();
  if (entryUuid) {
    return `uuid-${entryUuid}`;
  }

  return `index-${fallbackIndex}`;
}

export function findDiaryEntryIndex(entries: DiaryEntry[], target: DiaryEntry | null) {
  if (!target) {
    return -1;
  }

  if (isPersistedDiaryEntryId(target.id)) {
    return entries.findIndex((entry) => entry.id === target.id);
  }

  const targetUuid = target.entry_uuid?.trim();
  if (targetUuid) {
    return entries.findIndex((entry) => entry.entry_uuid?.trim() === targetUuid);
  }

  return entries.indexOf(target);
}

export function getDiaryEntryDomId(entry: DiaryEntry) {
  return isPersistedDiaryEntryId(entry.id) ? `entry-${entry.id}` : undefined;
}

export function isPersistedDiaryEntryId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

export function hasPersistedDiaryEntryId(entry: DiaryEntry): entry is DiaryEntry & { id: number } {
  return isPersistedDiaryEntryId(entry.id);
}
