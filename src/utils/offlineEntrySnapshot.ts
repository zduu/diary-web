import type { DiaryEntry } from '../types/index.ts';
import { getLocalStorageItem, removeLocalStorageItem, setLocalStorageItem } from './browserStorage.ts';
import { isDiaryEntryArray } from './diaryEntryValidation.ts';
import { sanitizeEntryHidden } from './entryTextValidation.ts';
import { parseTimeString } from './timestampUtils.ts';

const OFFLINE_ENTRY_SNAPSHOT_KEY = 'diary_offline_public_entries_v1';
const MAX_OFFLINE_ENTRIES = 120;

export interface OfflineEntrySnapshot {
  savedAt: string;
  entries: DiaryEntry[];
}

function sanitizeEntry(entry: DiaryEntry): DiaryEntry {
  return {
    ...entry,
    hidden: false,
  };
}

export function readOfflineEntrySnapshot(): OfflineEntrySnapshot | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawValue = getLocalStorageItem(OFFLINE_ENTRY_SNAPSHOT_KEY);
    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue) as Partial<OfflineEntrySnapshot>;
    if (
      typeof parsedValue.savedAt !== 'string'
      || parseTimeString(parsedValue.savedAt) === null
      || !isDiaryEntryArray(parsedValue.entries)
    ) {
      return null;
    }

    return {
      savedAt: parsedValue.savedAt,
      entries: parsedValue.entries.map(sanitizeEntry),
    };
  } catch {
    return null;
  }
}

export function writeOfflineEntrySnapshot(entries: DiaryEntry[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const safeEntries = entries
      .filter((entry) => !sanitizeEntryHidden(entry.hidden))
      .slice(0, MAX_OFFLINE_ENTRIES)
      .map(sanitizeEntry);

    const payload: OfflineEntrySnapshot = {
      savedAt: new Date().toISOString(),
      entries: safeEntries,
    };

    setLocalStorageItem(OFFLINE_ENTRY_SNAPSHOT_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota or private-mode failures and keep online behavior unchanged.
  }
}

export function clearOfflineEntrySnapshot(): void {
  if (typeof window === 'undefined') {
    return;
  }

  removeLocalStorageItem(OFFLINE_ENTRY_SNAPSHOT_KEY);
}
