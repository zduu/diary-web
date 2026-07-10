import type { DiaryEntry, EntrySyncState } from '../types/index.ts';
import {
  sanitizeEntryContent,
  sanitizeEntryContentType,
  sanitizeEntryHidden,
  sanitizeEntryMood,
  sanitizeEntryTags,
  sanitizeEntryTitle,
  sanitizeEntryWeather,
} from '../utils/entryTextValidation.ts';
import { sortDiaryEntriesByTime } from '../utils/entryTime.ts';
import { isValidImageSource, MAX_ENTRY_IMAGES_COUNT } from '../utils/imageSourceValidation.ts';
import { isValidLocationInfo } from '../utils/importUtils.ts';
import { parseTimeString } from '../utils/timestampUtils.ts';
import { isPersistedDiaryEntryId } from '../utils/diaryEntryIdentity.ts';

const syncedState: EntrySyncState = 'synced';
const validSyncStates = new Set<EntrySyncState>([
  'synced',
  'pending_create',
  'pending_update',
  'pending_delete',
  'conflict',
]);

export interface DiarySyncStatus {
  totalEntries: number;
  visibleEntries: number;
  pendingCreates: number;
  pendingUpdates: number;
  pendingDeletes: number;
  conflicts: number;
  totalPending: number;
  lastSyncedAt: string | null;
}

function createEntryUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `entry-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeEntryUuid(value: unknown) {
  if (typeof value !== 'string') {
    return createEntryUuid();
  }

  return value.trim() || createEntryUuid();
}

function hasTimestamp(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidTimestamp(value: string | null | undefined): value is string {
  return hasTimestamp(value) && parseTimeString(value) !== null;
}

function getSyncTimestamp(value: string | null | undefined) {
  return parseTimeString(value)?.getTime() ?? null;
}

function getEntryMutationTimestamp(entry: DiaryEntry) {
  const updatedAt = getSyncTimestamp(entry.updated_at);
  const deletedAt = getSyncTimestamp(entry.deleted_at);

  if (updatedAt === null) {
    return deletedAt;
  }

  if (deletedAt === null) {
    return updatedAt;
  }

  return Math.max(updatedAt, deletedAt);
}

function ensureTimestamp(value: string | null | undefined, fallbackValue: string) {
  if (!hasTimestamp(value)) {
    return fallbackValue;
  }

  return value;
}

function normalizeEntryImages(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isValidImageSource)
    .slice(0, MAX_ENTRY_IMAGES_COUNT);
}

function normalizeLegacySyncState(entry: DiaryEntry, updatedAt: string): {
  syncState: EntrySyncState;
  lastSyncedAt: string | null;
} {
  if (entry.deleted_at) {
    return {
      syncState: 'pending_delete',
      lastSyncedAt: entry.last_synced_at ?? null,
    };
  }

  if (entry.sync_state && validSyncStates.has(entry.sync_state)) {
    return {
      syncState: entry.sync_state,
      lastSyncedAt: entry.last_synced_at ?? (entry.sync_state === syncedState && isValidTimestamp(updatedAt) ? updatedAt : null),
    };
  }

  return {
    syncState: syncedState,
    lastSyncedAt: entry.last_synced_at ?? (isValidTimestamp(updatedAt) ? updatedAt : null),
  };
}

export function isDiaryEntryDeleted(entry: DiaryEntry) {
  return Boolean(entry.deleted_at);
}

export function normalizeDiaryEntry(entry: DiaryEntry): DiaryEntry {
  const now = new Date().toISOString();
  const createdAt = ensureTimestamp(entry.created_at, now);
  const updatedAt = ensureTimestamp(entry.updated_at, createdAt);
  const { syncState, lastSyncedAt } = normalizeLegacySyncState(entry, updatedAt);

  return {
    ...entry,
    entry_uuid: normalizeEntryUuid(entry.entry_uuid),
    title: sanitizeEntryTitle(entry.title),
    content: sanitizeEntryContent(entry.content),
    content_type: sanitizeEntryContentType(entry.content_type),
    mood: sanitizeEntryMood(entry.mood),
    weather: sanitizeEntryWeather(entry.weather),
    tags: sanitizeEntryTags(entry.tags),
    images: normalizeEntryImages(entry.images),
    location: isValidLocationInfo(entry.location) ? entry.location ?? null : null,
    hidden: sanitizeEntryHidden(entry.hidden),
    created_at: createdAt,
    updated_at: updatedAt,
    deleted_at: entry.deleted_at ?? null,
    sync_state: syncState,
    last_synced_at: lastSyncedAt,
  };
}

export function createLocallyCreatedDiaryEntry(entry: DiaryEntry): DiaryEntry {
  const normalizedEntry = normalizeDiaryEntry(entry);
  return {
    ...normalizedEntry,
    deleted_at: null,
    sync_state: 'pending_create',
    last_synced_at: null,
  };
}

export function markDiaryEntryUpdatedLocally(currentEntry: DiaryEntry, updates: Partial<DiaryEntry>): DiaryEntry {
  const updatedAt = new Date().toISOString();
  const mergedEntry = normalizeDiaryEntry({
    ...currentEntry,
    ...updates,
    entry_uuid: currentEntry.entry_uuid,
    deleted_at: null,
    updated_at: updatedAt,
  });

  return {
    ...mergedEntry,
    sync_state: currentEntry.sync_state === 'pending_create' ? 'pending_create' : 'pending_update',
    last_synced_at: currentEntry.last_synced_at ?? null,
  };
}

export function markDiaryEntryDeletedLocally(currentEntry: DiaryEntry): DiaryEntry {
  const deletedAt = new Date().toISOString();
  const normalizedEntry = normalizeDiaryEntry({
    ...currentEntry,
    deleted_at: deletedAt,
    updated_at: deletedAt,
  });

  return {
    ...normalizedEntry,
    sync_state: 'pending_delete',
    last_synced_at: currentEntry.last_synced_at ?? null,
  };
}

export function buildDiarySyncStatus(entries: DiaryEntry[]): DiarySyncStatus {
  const normalizedEntries = entries.map(normalizeDiaryEntry);
  let pendingCreates = 0;
  let pendingUpdates = 0;
  let pendingDeletes = 0;
  let conflicts = 0;
  let lastSyncedAt: string | null = null;

  normalizedEntries.forEach((entry) => {
    switch (entry.sync_state) {
      case 'pending_create':
        pendingCreates += 1;
        break;
      case 'pending_update':
        pendingUpdates += 1;
        break;
      case 'pending_delete':
        pendingDeletes += 1;
        break;
      case 'conflict':
        conflicts += 1;
        break;
    }

    if (!entry.last_synced_at) {
      return;
    }

    const entryLastSyncedAt = getSyncTimestamp(entry.last_synced_at);
    if (entryLastSyncedAt === null) {
      return;
    }

    const currentLastSyncedAt = getSyncTimestamp(lastSyncedAt);
    if (currentLastSyncedAt === null || entryLastSyncedAt > currentLastSyncedAt) {
      lastSyncedAt = entry.last_synced_at;
    }
  });

  return {
    totalEntries: normalizedEntries.length,
    visibleEntries: normalizedEntries.filter((entry) => !isDiaryEntryDeleted(entry)).length,
    pendingCreates,
    pendingUpdates,
    pendingDeletes,
    conflicts,
    totalPending: pendingCreates + pendingUpdates + pendingDeletes + conflicts,
    lastSyncedAt,
  };
}

export function listPendingSyncEntries(entries: DiaryEntry[]): DiaryEntry[] {
  return entries
    .map(normalizeDiaryEntry)
    .filter((entry) => entry.sync_state !== syncedState);
}

function getSyncMutationFingerprint(entry: DiaryEntry) {
  const normalizedEntry = normalizeDiaryEntry(entry);

  return JSON.stringify({
    entry_uuid: normalizedEntry.entry_uuid,
    title: normalizedEntry.title,
    content: normalizedEntry.content,
    content_type: normalizedEntry.content_type,
    mood: normalizedEntry.mood,
    weather: normalizedEntry.weather,
    images: normalizedEntry.images,
    location: normalizedEntry.location,
    tags: normalizedEntry.tags,
    hidden: normalizedEntry.hidden,
    created_at: normalizedEntry.created_at,
    updated_at: normalizedEntry.updated_at,
    deleted_at: normalizedEntry.deleted_at,
    sync_state: normalizedEntry.sync_state,
  });
}

export function markDiaryEntriesSynced(
  entries: DiaryEntry[],
  entryUuids: string[],
  syncedAt = new Date().toISOString(),
  expectedEntries?: DiaryEntry[]
) {
  const targetIds = new Set(entryUuids);
  const expectedFingerprints = expectedEntries
    ? new Map(expectedEntries
      .map(normalizeDiaryEntry)
      .filter((entry) => entry.entry_uuid)
      .map((entry) => [entry.entry_uuid!, getSyncMutationFingerprint(entry)]))
    : null;
  const nextEntries: DiaryEntry[] = [];

  for (const entry of entries.map(normalizeDiaryEntry)) {
    if (!entry.entry_uuid || !targetIds.has(entry.entry_uuid)) {
      nextEntries.push(entry);
      continue;
    }

    const expectedFingerprint = expectedFingerprints?.get(entry.entry_uuid);
    if (expectedFingerprints && expectedFingerprint !== getSyncMutationFingerprint(entry)) {
      nextEntries.push(entry);
      continue;
    }

    if (entry.sync_state === 'pending_delete') {
      continue;
    }

    nextEntries.push({
      ...entry,
      sync_state: syncedState,
      last_synced_at: syncedAt,
    });
  }

  return nextEntries;
}

export function applyIncrementalRemoteEntries(currentEntries: DiaryEntry[], remoteEntries: DiaryEntry[], syncedAt = new Date().toISOString()) {
  const entryMap = new Map<string, DiaryEntry>();
  const usedEntryIds = new Set<number>();
  let nextGeneratedId = 1;

  const reserveUniqueEntryId = (preferredId: unknown) => {
    if (isPersistedDiaryEntryId(preferredId) && !usedEntryIds.has(preferredId)) {
      usedEntryIds.add(preferredId);
      return preferredId;
    }

    while (usedEntryIds.has(nextGeneratedId)) {
      nextGeneratedId += 1;
    }

    const generatedId = nextGeneratedId;
    usedEntryIds.add(generatedId);
    nextGeneratedId += 1;
    return generatedId;
  };

  for (const entry of currentEntries.map(normalizeDiaryEntry)) {
    if (!entry.entry_uuid) {
      continue;
    }

    entryMap.set(entry.entry_uuid, {
      ...entry,
      id: reserveUniqueEntryId(entry.id),
    });
  }

  for (const remoteEntry of remoteEntries.map(normalizeDiaryEntry)) {
    if (!remoteEntry.entry_uuid) {
      continue;
    }

    const existingEntry = entryMap.get(remoteEntry.entry_uuid);
    if (existingEntry && existingEntry.sync_state !== syncedState) {
      continue;
    }

    if (remoteEntry.deleted_at) {
      // 远端条目已删除：本地不存在则跳过，本地存在则比较时间戳决定是否删除
      if (!existingEntry) {
        continue;
      }

      const remoteDeletedAt = getSyncTimestamp(remoteEntry.deleted_at);
      if (remoteDeletedAt === null) {
        continue;
      }

      const existingMutationAt = getEntryMutationTimestamp(existingEntry);
      if (existingMutationAt !== null && remoteDeletedAt < existingMutationAt) {
        continue;
      }

      entryMap.delete(remoteEntry.entry_uuid);
      continue;
    }

    entryMap.set(remoteEntry.entry_uuid, {
      ...remoteEntry,
      id: existingEntry?.id ?? reserveUniqueEntryId(remoteEntry.id),
      deleted_at: null,
      sync_state: syncedState,
      last_synced_at: syncedAt,
    });
  }

  return sortDiaryEntriesByTime([...entryMap.values()].map((entry) => normalizeDiaryEntry(entry)));
}

export function applyDiarySyncResult(
  currentEntries: DiaryEntry[],
  sentEntries: DiaryEntry[],
  confirmedEntryUuids: string[],
  remoteEntries: DiaryEntry[],
  syncedAt = new Date().toISOString()
) {
  const entriesAfterConfirmation = markDiaryEntriesSynced(
    currentEntries,
    confirmedEntryUuids,
    syncedAt,
    sentEntries
  );

  return applyIncrementalRemoteEntries(entriesAfterConfirmation, remoteEntries, syncedAt);
}
