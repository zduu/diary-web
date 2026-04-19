import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequestPost as syncEntries } from '../functions/api/sync.ts';
import { createSessionToken } from '../functions/api/_shared.ts';

type EntryRow = {
  id: number;
  entry_uuid?: string | null;
  title: string;
  content: string;
  content_type: string;
  mood: string;
  weather: string;
  images: string;
  location: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  tags: string;
  hidden: number;
};

class MockPreparedStatement {
  private readonly db: MockD1Database;
  private readonly query: string;
  private readonly args: unknown[];

  constructor(db: MockD1Database, query: string, args: unknown[] = []) {
    this.db = db;
    this.query = query;
    this.args = args;
  }

  bind(...args: unknown[]) {
    return new MockPreparedStatement(this.db, this.query, args);
  }

  async first<T>() {
    const result = this.db.execute(this.query, this.args);
    return (result[0] as T | undefined) ?? null;
  }

  async all<T>() {
    return { results: this.db.execute(this.query, this.args) as T[] };
  }

  async run() {
    return this.db.run(this.query, this.args);
  }
}

class MockD1Database {
  entries: EntryRow[] = [];
  settings = new Map<string, string>();

  prepare(query: string) {
    return new MockPreparedStatement(this, query);
  }

  execute(query: string, args: unknown[]) {
    const normalized = query.replace(/\s+/g, ' ').trim();

    if (normalized === 'SELECT * FROM diary_entries WHERE entry_uuid = ?') {
      const entryUuid = String(args[0]);
      return this.entries.filter((entry) => entry.entry_uuid === entryUuid);
    }

    if (normalized === 'SELECT setting_value FROM app_settings WHERE setting_key = ?') {
      const key = String(args[0]);
      const value = this.settings.get(key);
      return value == null ? [] : [{ setting_value: value }];
    }

    if (normalized === 'SELECT * FROM diary_entries WHERE deleted_at IS NULL ORDER BY created_at DESC') {
      return [...this.entries]
        .filter((entry) => entry.deleted_at == null)
        .sort((left, right) =>
        new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
        );
    }

    if (normalized.startsWith('SELECT * FROM diary_entries WHERE unixepoch(COALESCE(deleted_at, updated_at)) >= unixepoch(?)')) {
      const since = Date.parse(String(args[0]));
      return [...this.entries]
        .filter((entry) => {
          const comparable = Date.parse(entry.deleted_at ?? entry.updated_at);
          return !Number.isNaN(comparable) && comparable >= since;
        })
        .sort((left, right) =>
          Date.parse(right.deleted_at ?? right.updated_at) - Date.parse(left.deleted_at ?? left.updated_at)
        );
    }

    if (normalized.startsWith('INSERT INTO diary_entries (entry_uuid, title, content, content_type, mood, weather, images, location, tags, hidden, created_at, updated_at, deleted_at)')) {
      const newEntry: EntryRow = {
        id: this.entries.reduce((maxId, entry) => Math.max(maxId, entry.id), 0) + 1,
        entry_uuid: String(args[0]),
        title: String(args[1]),
        content: String(args[2]),
        content_type: String(args[3]),
        mood: String(args[4]),
        weather: String(args[5]),
        images: String(args[6]),
        location: args[7] == null ? null : String(args[7]),
        tags: String(args[8]),
        hidden: Number(args[9]),
        created_at: String(args[10]),
        updated_at: String(args[11]),
        deleted_at: null,
      };
      this.entries.unshift(newEntry);
      return [newEntry];
    }

    if (normalized.startsWith('UPDATE diary_entries SET deleted_at = ?, updated_at = ? WHERE entry_uuid = ? RETURNING *')) {
      const entryUuid = String(args[2]);
      const entry = this.entries.find((item) => item.entry_uuid === entryUuid);
      if (!entry) {
        return [];
      }

      entry.deleted_at = String(args[0]);
      entry.updated_at = String(args[1]);
      return [entry];
    }

    if (normalized.startsWith('UPDATE diary_entries SET title = ?, content = ?, content_type = ?, mood = ?, weather = ?, images = ?, location = ?, tags = ?, hidden = ?, created_at = ?, updated_at = ?, deleted_at = NULL WHERE entry_uuid = ? RETURNING *')) {
      const entryUuid = String(args[11]);
      const entry = this.entries.find((item) => item.entry_uuid === entryUuid);
      if (!entry) {
        return [];
      }

      entry.title = String(args[0]);
      entry.content = String(args[1]);
      entry.content_type = String(args[2]);
      entry.mood = String(args[3]);
      entry.weather = String(args[4]);
      entry.images = String(args[5]);
      entry.location = args[6] == null ? null : String(args[6]);
      entry.tags = String(args[7]);
      entry.hidden = Number(args[8]);
      entry.created_at = String(args[9]);
      entry.updated_at = String(args[10]);
      entry.deleted_at = null;
      return [entry];
    }

    throw new Error(`Unsupported SELECT query in sync test mock: ${normalized}`);
  }

  run(query: string, args: unknown[]) {
    const normalized = query.replace(/\s+/g, ' ').trim();

    if (normalized.startsWith('INSERT INTO app_settings')) {
      const key = String(args[0]);
      const value = String(args[1]);
      this.settings.set(key, value);
      return Promise.resolve({
        success: true,
        meta: { changes: 1, last_row_id: 0 },
      });
    }

    if (normalized === 'DELETE FROM app_settings WHERE setting_key = ?') {
      const key = String(args[0]);
      const hadKey = this.settings.delete(key);
      return Promise.resolve({
        success: true,
        meta: { changes: hadKey ? 1 : 0, last_row_id: 0 },
      });
    }

    if (normalized === 'UPDATE diary_entries SET entry_uuid = ? WHERE id = ?') {
      const entryUuid = String(args[0]);
      const id = Number(args[1]);
      const entry = this.entries.find((item) => item.id === id);
      if (entry) {
        entry.entry_uuid = entryUuid;
      }

      return Promise.resolve({
        success: true,
        meta: { changes: entry ? 1 : 0, last_row_id: 0 },
      });
    }

    throw new Error(`Unsupported RUN query in sync test mock: ${normalized}`);
  }
}

async function buildAdminCookie(env: any) {
  const token = await createSessionToken('admin', env);
  return `diary_session=${encodeURIComponent(token)}`;
}

function createEnv(entries: EntryRow[] = []) {
  const db = new MockD1Database();
  db.entries = [...entries];

  return {
    DB: db as unknown as D1Database,
    ENVIRONMENT: 'test',
    SESSION_SECRET: 'sync-test-secret',
  } as const;
}

async function parseJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

test('sync endpoint upserts newer entries and returns full remote snapshot', async () => {
  const env = createEnv([
    {
      id: 1,
      entry_uuid: 'existing-entry',
      title: '旧标题',
      content: '旧内容',
      content_type: 'markdown',
      mood: 'neutral',
      weather: 'unknown',
      images: '[]',
      location: null,
      created_at: '2026-04-18T08:00:00.000Z',
      updated_at: '2026-04-18T08:00:00.000Z',
      deleted_at: null,
      tags: '[]',
      hidden: 0,
    },
  ]);
  const adminCookie = await buildAdminCookie(env);

  const response = await syncEntries({
    request: new Request('https://example.com/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        entries: [
          {
            entry_uuid: 'existing-entry',
            title: '新标题',
            content: '新内容',
            created_at: '2026-04-18T08:00:00.000Z',
            updated_at: '2026-04-18T10:00:00.000Z',
          },
          {
            entry_uuid: 'new-entry',
            title: '新建内容',
            content: '新增',
            created_at: '2026-04-18T11:00:00.000Z',
            updated_at: '2026-04-18T11:00:00.000Z',
          },
        ],
      }),
    }),
    env,
  });

  assert.equal(response.status, 200);
  const payload = await parseJson<{
    success: boolean;
    data: {
      entries: DiaryEntry[];
      pushedCount: number;
      deletedCount: number;
      confirmedEntryUuids: string[];
    };
  }>(response);
  assert.equal(payload.success, true);
  assert.equal(payload.data.pushedCount, 2);
  assert.equal(payload.data.deletedCount, 0);
  assert.deepEqual(payload.data.confirmedEntryUuids.sort(), ['existing-entry', 'new-entry']);
  assert.equal(payload.data.entries.length, 2);
  assert.equal(payload.data.entries[0]?.title, '新建内容');
  assert.equal(payload.data.entries[1]?.title, '新标题');
});

test('sync endpoint deletes remote entries for pending_delete payloads', async () => {
  const env = createEnv([
    {
      id: 1,
      entry_uuid: 'delete-entry',
      title: '待删除',
      content: '旧内容',
      content_type: 'markdown',
      mood: 'neutral',
      weather: 'unknown',
      images: '[]',
      location: null,
      created_at: '2026-04-18T08:00:00.000Z',
      updated_at: '2026-04-18T08:00:00.000Z',
      deleted_at: null,
      tags: '[]',
      hidden: 0,
    },
  ]);
  const adminCookie = await buildAdminCookie(env);

  const response = await syncEntries({
    request: new Request('https://example.com/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        entries: [
          {
            entry_uuid: 'delete-entry',
            title: '待删除',
            content: '旧内容',
            created_at: '2026-04-18T08:00:00.000Z',
            updated_at: '2026-04-18T12:00:00.000Z',
            sync_state: 'pending_delete',
            deleted_at: '2026-04-18T12:00:00.000Z',
          },
        ],
      }),
    }),
    env,
  });

  assert.equal(response.status, 200);
  const payload = await parseJson<{
    success: boolean;
    data: {
      entries: DiaryEntry[];
      deletedCount: number;
      confirmedEntryUuids: string[];
    };
  }>(response);
  assert.equal(payload.success, true);
  assert.equal(payload.data.deletedCount, 1);
  assert.deepEqual(payload.data.confirmedEntryUuids, ['delete-entry']);
  assert.equal(payload.data.entries.length, 0);
});

test('sync endpoint accepts sync token header for apk cross-origin sync', async () => {
  const env = {
    ...createEnv(),
    SYNC_ACCESS_TOKEN: 'remote-sync-token',
  };

  const response = await syncEntries({
    request: new Request('https://example.com/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sync-Token': 'remote-sync-token',
      },
      body: JSON.stringify({
        entries: [
          {
            entry_uuid: 'header-entry',
            title: '跨域同步',
            content: '来自 APK',
            created_at: '2026-04-18T11:00:00.000Z',
            updated_at: '2026-04-18T11:00:00.000Z',
          },
        ],
      }),
    }),
    env,
  });

  assert.equal(response.status, 200);
  const payload = await parseJson<{
    success: boolean;
    data: {
      pushedCount: number;
      confirmedEntryUuids: string[];
      entries: Array<{ title: string }>;
    };
  }>(response);
  assert.equal(payload.success, true);
  assert.equal(payload.data.pushedCount, 1);
  assert.deepEqual(payload.data.confirmedEntryUuids, ['header-entry']);
  assert.equal(payload.data.entries[0]?.title, '跨域同步');
});

test('sync endpoint returns incremental changes when lastSyncedAt is provided', async () => {
  const env = createEnv([
    {
      id: 1,
      entry_uuid: 'older-entry',
      title: '更早内容',
      content: '旧',
      content_type: 'markdown',
      mood: 'neutral',
      weather: 'unknown',
      images: '[]',
      location: null,
      created_at: '2026-04-18T08:00:00.000Z',
      updated_at: '2026-04-18T08:00:00.000Z',
      deleted_at: null,
      tags: '[]',
      hidden: 0,
    },
    {
      id: 2,
      entry_uuid: 'newer-entry',
      title: '较新内容',
      content: '新',
      content_type: 'markdown',
      mood: 'neutral',
      weather: 'unknown',
      images: '[]',
      location: null,
      created_at: '2026-04-18T09:00:00.000Z',
      updated_at: '2026-04-18T11:00:00.000Z',
      deleted_at: null,
      tags: '[]',
      hidden: 0,
    },
  ]);
  const adminCookie = await buildAdminCookie(env);

  const response = await syncEntries({
    request: new Request('https://example.com/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        entries: [],
        lastSyncedAt: '2026-04-18T10:00:00.000Z',
      }),
    }),
    env,
  });

  assert.equal(response.status, 200);
  const payload = await parseJson<{ success: boolean; data: { entries: DiaryEntry[] } }>(response);
  assert.equal(payload.success, true);
  assert.equal(payload.data.entries.length, 1);
  assert.equal(payload.data.entries[0]?.entry_uuid, 'newer-entry');
});
