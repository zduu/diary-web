import { describe, expect, it } from 'vitest';
import type { DiaryEntry } from '../types/index.ts';
import {
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
});
