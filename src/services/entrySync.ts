import type { DiaryEntry, EntrySyncState } from '../types/index.ts';

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

function hasTimestamp(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidTimestamp(value: string | null | undefined): value is string {
  return hasTimestamp(value) && !Number.isNaN(Date.parse(value));
}

function ensureTimestamp(value: string | null | undefined, fallbackValue: string) {
  if (!hasTimestamp(value)) {
    return fallbackValue;
  }

  return value;
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
    entry_uuid: entry.entry_uuid || createEntryUuid(),
    content_type: entry.content_type || 'markdown',
    mood: entry.mood || 'neutral',
    weather: entry.weather || 'unknown',
    tags: entry.tags || [],
    images: entry.images || [],
    location: entry.location || null,
    hidden: entry.hidden || false,
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

    if (!isValidTimestamp(entry.last_synced_at)) {
      return;
    }

    if (!lastSyncedAt || new Date(entry.last_synced_at).getTime() > new Date(lastSyncedAt).getTime()) {
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

export function markDiaryEntriesSynced(entries: DiaryEntry[], entryUuids: string[], syncedAt = new Date().toISOString()) {
  const targetIds = new Set(entryUuids);
  const nextEntries: DiaryEntry[] = [];

  for (const entry of entries.map(normalizeDiaryEntry)) {
    if (!entry.entry_uuid || !targetIds.has(entry.entry_uuid)) {
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

  for (const entry of currentEntries.map(normalizeDiaryEntry)) {
    if (!entry.entry_uuid) {
      continue;
    }

    entryMap.set(entry.entry_uuid, entry);
  }

  for (const remoteEntry of remoteEntries.map(normalizeDiaryEntry)) {
    if (!remoteEntry.entry_uuid) {
      continue;
    }

    if (remoteEntry.deleted_at) {
      entryMap.delete(remoteEntry.entry_uuid);
      continue;
    }

    entryMap.set(remoteEntry.entry_uuid, {
      ...remoteEntry,
      deleted_at: null,
      sync_state: syncedState,
      last_synced_at: syncedAt,
    });
  }

  return [...entryMap.values()]
    .map((entry) => normalizeDiaryEntry(entry))
    .sort((left, right) => new Date(right.created_at ?? 0).getTime() - new Date(left.created_at ?? 0).getTime());
}
