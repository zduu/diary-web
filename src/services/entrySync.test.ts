import { describe, expect, it } from 'vitest';
import type { DiaryEntry } from '../types/index.ts';
import {
  MAX_ENTRY_CONTENT_LENGTH,
  MAX_ENTRY_MOOD_LENGTH,
  MAX_ENTRY_TAG_LENGTH,
  MAX_ENTRY_TAGS_COUNT,
  MAX_ENTRY_TITLE_LENGTH,
  MAX_ENTRY_WEATHER_LENGTH,
} from '../utils/entryTextValidation';
import { MAX_ENTRY_IMAGES_COUNT } from '../utils/imageSourceValidation';
import {
  applyDiarySyncResult,
  applyIncrementalRemoteEntries,
  buildDiarySyncStatus,
  createLocallyCreatedDiaryEntry,
  listPendingSyncEntries,
  markDiaryEntriesSynced,
  markDiaryEntryDeletedLocally,
  markDiaryEntryUpdatedLocally,
  normalizeDiaryEntry,
} from './entrySync.ts';

const baseEntry: DiaryEntry = {
  id: 1,
  title: '同步测试',
  content: '内容',
  created_at: '2026-04-18T10:00:00.000Z',
  updated_at: '2026-04-18T10:00:00.000Z',
  images: [],
  tags: [],
  hidden: false,
};

describe('entrySync', () => {
  it('normalizes legacy entries into synced baseline records', () => {
    const normalized = normalizeDiaryEntry(baseEntry);

    expect(normalized.entry_uuid).toBeTruthy();
    expect(normalized.sync_state).toBe('synced');
    expect(normalized.last_synced_at).toBe('2026-04-18T10:00:00.000Z');
    expect(normalized.deleted_at).toBeNull();
  });

  it('normalizes entry sync identifiers before local sync operations', () => {
    expect(normalizeDiaryEntry({
      ...baseEntry,
      entry_uuid: '  imported-entry  ',
    }).entry_uuid).toBe('imported-entry');

    const blankIdentifier = normalizeDiaryEntry({
      ...baseEntry,
      entry_uuid: '   ',
    }).entry_uuid;
    expect(blankIdentifier).toBeTruthy();
    expect(blankIdentifier).not.toBe('   ');

    const malformedIdentifier = normalizeDiaryEntry({
      ...baseEntry,
      entry_uuid: 123 as unknown as string,
    }).entry_uuid;
    expect(malformedIdentifier).toBeTruthy();
    expect(malformedIdentifier).not.toBe(123);
  });

  it('sanitizes runtime entry text, images and tags during normalization', () => {
    const normalized = normalizeDiaryEntry({
      ...baseEntry,
      title: 't'.repeat(MAX_ENTRY_TITLE_LENGTH + 1),
      content: 'c'.repeat(MAX_ENTRY_CONTENT_LENGTH + 1),
      mood: 'm'.repeat(MAX_ENTRY_MOOD_LENGTH + 1),
      weather: 'w'.repeat(MAX_ENTRY_WEATHER_LENGTH + 1),
      content_type: 'html' as 'markdown',
      images: [
        'javascript:alert(1)',
        ...Array.from({ length: MAX_ENTRY_IMAGES_COUNT + 1 }, (_, index) => `/api/images/${index}.png`),
      ],
      tags: [
        ' ok ',
        'ok',
        'x'.repeat(MAX_ENTRY_TAG_LENGTH + 1),
        ...Array.from({ length: MAX_ENTRY_TAGS_COUNT + 1 }, (_, index) => `tag-${index}`),
      ],
      location: {
        name: '坏位置',
        latitude: 91,
        longitude: 121.4,
      },
      hidden: 'yes' as unknown as boolean,
    });

    expect(normalized.title).toHaveLength(MAX_ENTRY_TITLE_LENGTH);
    expect(normalized.content).toHaveLength(MAX_ENTRY_CONTENT_LENGTH);
    expect(normalized.mood).toHaveLength(MAX_ENTRY_MOOD_LENGTH);
    expect(normalized.weather).toHaveLength(MAX_ENTRY_WEATHER_LENGTH);
    expect(normalized.content_type).toBe('markdown');
    expect(normalized.images).toHaveLength(MAX_ENTRY_IMAGES_COUNT);
    expect(normalized.images).not.toContain('javascript:alert(1)');
    const normalizedTags = normalized.tags ?? [];
    expect(normalizedTags).toHaveLength(MAX_ENTRY_TAGS_COUNT);
    expect(normalizedTags[0]).toBe('ok');
    expect(normalizedTags).not.toContain('x'.repeat(MAX_ENTRY_TAG_LENGTH + 1));
    expect(normalized.location).toBeNull();
    expect(normalized.hidden).toBe(false);
  });

  it('falls back malformed runtime mood and weather during normalization', () => {
    const normalized = normalizeDiaryEntry({
      ...baseEntry,
      mood: 123 as unknown as string,
      weather: null as unknown as string,
    });

    expect(normalized.mood).toBe('neutral');
    expect(normalized.weather).toBe('unknown');
  });

  it('keeps valid zero-valued location coordinates during normalization', () => {
    const normalized = normalizeDiaryEntry({
      ...baseEntry,
      location: {
        name: '零点位置',
        latitude: 0,
        longitude: 0,
        highAccuracy: {
          accuracy: 0,
          confidence: 'high',
          attempts: 1,
          coordinateOffset: {
            latitude: 0,
            longitude: 0,
            distance: 0,
          },
        },
      },
    });

    expect(normalized.location).toEqual({
      name: '零点位置',
      latitude: 0,
      longitude: 0,
      highAccuracy: {
        accuracy: 0,
        confidence: 'high',
        attempts: 1,
        coordinateOffset: {
          latitude: 0,
          longitude: 0,
          distance: 0,
        },
      },
    });
  });

  it('marks local create, update and delete with pending sync states', () => {
    const created = createLocallyCreatedDiaryEntry(baseEntry);
    const updated = markDiaryEntryUpdatedLocally({
      ...created,
      sync_state: 'synced',
      last_synced_at: '2026-04-18T10:00:00.000Z',
    }, {
      content: '已修改',
    });
    const deleted = markDiaryEntryDeletedLocally(updated);

    expect(created.sync_state).toBe('pending_create');
    expect(created.last_synced_at).toBeNull();
    expect(updated.sync_state).toBe('pending_update');
    expect(deleted.sync_state).toBe('pending_delete');
    expect(deleted.deleted_at).toBeTruthy();
  });

  it('builds sync status and clears pending delete tombstones after sync', () => {
    const pendingCreate = createLocallyCreatedDiaryEntry({
      ...baseEntry,
      id: 2,
    });
    const pendingDelete = markDiaryEntryDeletedLocally({
      ...normalizeDiaryEntry({
        ...baseEntry,
        id: 3,
        entry_uuid: 'entry-3',
      }),
      last_synced_at: '2026-04-18T10:00:00.000Z',
      sync_state: 'pending_update',
    });
    const status = buildDiarySyncStatus([pendingCreate, pendingDelete]);

    expect(status.pendingCreates).toBe(1);
    expect(status.pendingDeletes).toBe(1);
    expect(status.totalPending).toBe(2);
    expect(listPendingSyncEntries([pendingCreate, pendingDelete])).toHaveLength(2);

    const afterSync = markDiaryEntriesSynced(
      [pendingCreate, pendingDelete],
      [pendingCreate.entry_uuid!, pendingDelete.entry_uuid!],
      '2026-04-18T11:00:00.000Z'
    );

    expect(afterSync).toHaveLength(1);
    expect(afterSync[0]?.sync_state).toBe('synced');
    expect(afterSync[0]?.last_synced_at).toBe('2026-04-18T11:00:00.000Z');
  });

  it('ignores invalid last synced timestamps when building sync status', () => {
    const status = buildDiarySyncStatus([
      {
        ...normalizeDiaryEntry(baseEntry),
        id: 2,
        entry_uuid: 'invalid-sync-time',
        last_synced_at: 'not-a-date',
      },
      {
        ...normalizeDiaryEntry(baseEntry),
        id: 3,
        entry_uuid: 'older-sync-time',
        last_synced_at: '2026-04-18T09:00:00.000Z',
      },
      {
        ...normalizeDiaryEntry(baseEntry),
        id: 4,
        entry_uuid: 'newer-sync-time',
        last_synced_at: '2026-04-18T11:00:00.000Z',
      },
    ]);

    expect(status.lastSyncedAt).toBe('2026-04-18T11:00:00.000Z');
  });

  it('keeps untouched local pending entries during incremental remote merge', () => {
    const pendingCreate = createLocallyCreatedDiaryEntry({
      ...baseEntry,
      id: 2,
      entry_uuid: 'local-pending-entry',
    });

    const merged = applyIncrementalRemoteEntries(
      [pendingCreate],
      [{
        ...baseEntry,
        id: 3,
        entry_uuid: 'remote-entry',
        title: '远端新增',
        created_at: '2026-04-18T11:00:00.000Z',
        updated_at: '2026-04-18T11:00:00.000Z',
      }],
      '2026-04-18T12:00:00.000Z'
    );

    const localEntry = merged.find((entry) => entry.entry_uuid === 'local-pending-entry');
    const remoteEntry = merged.find((entry) => entry.entry_uuid === 'remote-entry');

    expect(localEntry?.sync_state).toBe('pending_create');
    expect(localEntry?.last_synced_at).toBeNull();
    expect(remoteEntry?.sync_state).toBe('synced');
    expect(remoteEntry?.last_synced_at).toBe('2026-04-18T12:00:00.000Z');
  });

  it('does not overwrite unconfirmed local pending entries during incremental remote merge', () => {
    const pendingUpdate = markDiaryEntryUpdatedLocally({
      ...normalizeDiaryEntry({
        ...baseEntry,
        entry_uuid: 'shared-entry',
      }),
      sync_state: 'synced',
      last_synced_at: '2026-04-18T10:00:00.000Z',
    }, {
      content: '本地未同步内容',
    });

    const merged = applyIncrementalRemoteEntries(
      [pendingUpdate],
      [{
        ...baseEntry,
        entry_uuid: 'shared-entry',
        content: '远端旧内容',
        updated_at: '2026-04-18T09:00:00.000Z',
      }],
      '2026-04-18T12:00:00.000Z'
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.content).toBe('本地未同步内容');
    expect(merged[0]?.sync_state).toBe('pending_update');
    expect(merged[0]?.last_synced_at).toBe('2026-04-18T10:00:00.000Z');
  });

  it('applies only newer valid remote deletions during incremental remote merge', () => {
    const localEntry = normalizeDiaryEntry({
      ...baseEntry,
      entry_uuid: 'shared-entry',
      content: '本地已同步内容',
      updated_at: '2026-04-18T11:00:00.000Z',
      sync_state: 'synced',
      last_synced_at: '2026-04-18T11:00:00.000Z',
    });

    const staleDeletion = applyIncrementalRemoteEntries(
      [localEntry],
      [{
        ...baseEntry,
        entry_uuid: 'shared-entry',
        updated_at: '2026-04-18T10:00:00.000Z',
        deleted_at: '2026-04-18T10:00:00.000Z',
      }],
      '2026-04-18T12:00:00.000Z'
    );
    expect(staleDeletion).toHaveLength(1);
    expect(staleDeletion[0]?.entry_uuid).toBe('shared-entry');

    const invalidDeletion = applyIncrementalRemoteEntries(
      [localEntry],
      [{
        ...baseEntry,
        entry_uuid: 'shared-entry',
        updated_at: '2026-04-18T12:00:00.000Z',
        deleted_at: 'not-a-date',
      }],
      '2026-04-18T12:00:00.000Z'
    );
    expect(invalidDeletion).toHaveLength(1);
    expect(invalidDeletion[0]?.entry_uuid).toBe('shared-entry');

    const newerDeletion = applyIncrementalRemoteEntries(
      [localEntry],
      [{
        ...baseEntry,
        entry_uuid: 'shared-entry',
        updated_at: '2026-04-18T12:00:00.000Z',
        deleted_at: '2026-04-18T12:00:00.000Z',
      }],
      '2026-04-18T12:00:00.000Z'
    );
    expect(newerDeletion).toHaveLength(0);
  });

  it('sorts incremental remote merges with invalid created_at values last', () => {
    const merged = applyIncrementalRemoteEntries(
      [],
      [
        {
          ...baseEntry,
          id: 2,
          entry_uuid: 'invalid-created-at',
          created_at: 'not-a-date',
          updated_at: '2026-04-20T10:00:00.000Z',
        },
        {
          ...baseEntry,
          id: 3,
          entry_uuid: 'valid-created-at',
          created_at: '2026-04-19T10:00:00.000Z',
          updated_at: '2026-04-19T10:00:00.000Z',
        },
      ],
      '2026-04-20T12:00:00.000Z'
    );

    expect(merged.map((entry) => entry.entry_uuid)).toEqual(['valid-created-at', 'invalid-created-at']);
  });

  it('keeps local ids unique when remote entries reuse an existing numeric id', () => {
    const localEntry = createLocallyCreatedDiaryEntry({
      ...baseEntry,
      id: 1,
      entry_uuid: 'local-entry',
    });
    const merged = applyIncrementalRemoteEntries(
      [localEntry],
      [{
        ...baseEntry,
        id: 1,
        entry_uuid: 'remote-entry',
        title: '远端同 ID 条目',
      }],
      '2026-04-18T12:00:00.000Z'
    );

    expect(new Set(merged.map((entry) => entry.id)).size).toBe(2);
    expect(merged.find((entry) => entry.entry_uuid === 'local-entry')?.id).toBe(1);
    expect(merged.find((entry) => entry.entry_uuid === 'remote-entry')?.id).not.toBe(1);
  });

  it('preserves a newer local edit when an older in-flight sync response arrives', () => {
    const sentEntry = createLocallyCreatedDiaryEntry({
      ...baseEntry,
      id: 1,
      entry_uuid: 'edited-during-sync',
      content: '已发送版本',
      updated_at: '2026-04-18T10:00:00.000Z',
    });
    const currentEntry = {
      ...sentEntry,
      content: '请求期间的新修改',
      updated_at: '2026-04-18T11:00:00.000Z',
      sync_state: 'pending_update' as const,
    };
    const merged = applyDiarySyncResult(
      [currentEntry],
      [sentEntry],
      ['edited-during-sync'],
      [{
        ...sentEntry,
        id: 99,
        content: '远端确认的旧版本',
      }],
      '2026-04-18T12:00:00.000Z'
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.content).toBe('请求期间的新修改');
    expect(merged[0]?.sync_state).toBe('pending_update');
    expect(merged[0]?.id).toBe(1);
  });
});
