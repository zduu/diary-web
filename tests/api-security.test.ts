import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequestGet as getEntries, onRequestPost as createEntry } from '../functions/api/entries.ts';
import { onRequestPost as login } from '../functions/api/auth/login.ts';
import { onRequestPost as logout } from '../functions/api/auth/logout.ts';
import { onRequestGet as getSession, onRequestOptions as getSessionOptions } from '../functions/api/auth/session.ts';
import { onRequestGet as getSettings } from '../functions/api/settings/index.ts';
import { onRequestGet as getStats } from '../functions/api/stats.ts';
import { onRequestDelete as deleteEntry, onRequestPut as updateEntry } from '../functions/api/entries/[id].ts';
import { onRequestPost as batchImportEntries, onRequestPut as batchUpdateEntries } from '../functions/api/entries/batch.ts';
import { onRequestPost as editEntry } from '../functions/api/entries/[id]/edit.ts';
import { onRequestPost as toggleEntryVisibility } from '../functions/api/entries/[id]/toggle-visibility.ts';
import { onRequestGet as getAdminSettings } from '../functions/api/settings/admin.ts';
import { onRequestGet as getR2Diagnostic } from '../functions/api/diagnostics/r2.ts';
import {
  onRequestDelete as deleteSetting,
  onRequestGet as getSettingByKey,
  onRequestPut as updateSetting,
} from '../functions/api/settings/[key].ts';

type EntryRow = {
  id: number;
  title: string;
  content: string;
  content_type: string;
  mood: string;
  weather: string;
  images: string;
  location: string | null;
  created_at: string;
  updated_at: string;
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
  settings = new Map<string, string>();
  entries: EntryRow[] = [];

  prepare(query: string) {
    return new MockPreparedStatement(this, query);
  }

  execute(query: string, args: unknown[]) {
    const normalized = query.replace(/\s+/g, ' ').trim();

    if (normalized === 'SELECT setting_value FROM app_settings WHERE setting_key = ?') {
      const key = String(args[0]);
      const value = this.settings.get(key);
      return value == null ? [] : [{ setting_value: value }];
    }

    if (normalized.startsWith('SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN')) {
      return args
        .map((key) => String(key))
        .filter((key) => this.settings.has(key))
        .map((key) => ({ setting_key: key, setting_value: this.settings.get(key)! }));
    }

    if (normalized === 'SELECT * FROM diary_entries ORDER BY created_at DESC') {
      return [...this.entries].sort(sortEntriesDescending);
    }

    if (normalized === 'SELECT * FROM diary_entries WHERE hidden = 0 ORDER BY created_at DESC') {
      return [...this.entries].filter((entry) => entry.hidden === 0).sort(sortEntriesDescending);
    }

    if (normalized === 'SELECT * FROM diary_entries WHERE id = ?') {
      const id = Number(args[0]);
      return this.entries.filter((entry) => entry.id === id);
    }

    if (normalized === 'SELECT * FROM diary_entries WHERE id = ? AND hidden = 0') {
      const id = Number(args[0]);
      return this.entries.filter((entry) => entry.id === id && entry.hidden === 0);
    }

    if (normalized === 'SELECT id FROM diary_entries WHERE id = ?') {
      const id = Number(args[0]);
      return this.entries.filter((entry) => entry.id === id).map((entry) => ({ id: entry.id }));
    }

    if (normalized === 'SELECT created_at FROM diary_entries ORDER BY created_at DESC') {
      return [...this.entries]
        .sort(sortEntriesDescending)
        .map((entry) => ({ created_at: entry.created_at }));
    }

    if (normalized.startsWith('INSERT INTO diary_entries (title, content, content_type, mood, weather, images, location, tags, hidden)')) {
      const createdAt = new Date().toISOString();
      const newEntry: EntryRow = {
        id: this.getNextEntryId(),
        title: String(args[0]),
        content: String(args[1]),
        content_type: String(args[2]),
        mood: String(args[3]),
        weather: String(args[4]),
        images: String(args[5]),
        location: args[6] == null ? null : String(args[6]),
        tags: String(args[7]),
        hidden: Number(args[8]),
        created_at: createdAt,
        updated_at: createdAt,
      };
      this.entries.unshift(newEntry);
      return [newEntry];
    }

    if (normalized.startsWith('INSERT INTO diary_entries (title, content, content_type, mood, weather, images, location, tags, hidden, created_at, updated_at)')) {
      const updatedAt = new Date().toISOString();
      const newEntry: EntryRow = {
        id: this.getNextEntryId(),
        title: String(args[0]),
        content: String(args[1]),
        content_type: String(args[2]),
        mood: String(args[3]),
        weather: String(args[4]),
        images: String(args[5]),
        location: args[6] == null ? null : String(args[6]),
        tags: String(args[7]),
        hidden: Number(args[8]),
        created_at: String(args[9]),
        updated_at: updatedAt,
      };
      this.entries.unshift(newEntry);
      return [newEntry];
    }

    if (normalized.startsWith('UPDATE diary_entries SET ') && normalized.endsWith('WHERE id = ? RETURNING *')) {
      const id = Number(args[args.length - 1]);
      const entry = this.entries.find((item) => item.id === id);
      if (!entry) {
        return [];
      }

      const assignments = normalized
        .slice('UPDATE diary_entries SET '.length, normalized.indexOf(' WHERE id = ? RETURNING *'))
        .split(', ')
        .filter((assignment) => assignment !== 'updated_at = CURRENT_TIMESTAMP');

      assignments.forEach((assignment, index) => {
        const [column] = assignment.split(' = ');
        const value = args[index];

        switch (column) {
          case 'title':
            entry.title = String(value);
            break;
          case 'content':
            entry.content = String(value);
            break;
          case 'content_type':
            entry.content_type = String(value);
            break;
          case 'mood':
            entry.mood = String(value);
            break;
          case 'weather':
            entry.weather = String(value);
            break;
          case 'images':
            entry.images = String(value);
            break;
          case 'location':
            entry.location = value == null ? null : String(value);
            break;
          case 'tags':
            entry.tags = String(value);
            break;
          case 'hidden':
            entry.hidden = Number(value);
            break;
          case 'created_at':
            entry.created_at = String(value);
            break;
          default:
            throw new Error(`Unsupported UPDATE column in test mock: ${column}`);
        }
      });

      entry.updated_at = new Date().toISOString();
      return [entry];
    }

    if (normalized.startsWith('UPDATE diary_entries SET title = ?, content = ?, content_type = ?, mood = ?, weather = ?, images = ?, location = ?, tags = ?, hidden = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *')) {
      const id = Number(args[9]);
      const entry = this.entries.find((item) => item.id === id);
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
      entry.updated_at = new Date().toISOString();
      return [entry];
    }

    if (normalized.startsWith('UPDATE diary_entries SET title = ?, content = ?, content_type = ?, mood = ?, weather = ?, images = ?, location = ?, tags = ?, hidden = ?, created_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *')) {
      const id = Number(args[10]);
      const entry = this.entries.find((item) => item.id === id);
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
      entry.updated_at = new Date().toISOString();
      return [entry];
    }

    throw new Error(`Unsupported SELECT query in test mock: ${normalized}`);
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

    if (normalized === 'DELETE FROM diary_entries WHERE id = ?') {
      const id = Number(args[0]);
      const previousLength = this.entries.length;
      this.entries = this.entries.filter((entry) => entry.id !== id);
      return Promise.resolve({
        success: true,
        meta: { changes: previousLength - this.entries.length, last_row_id: 0 },
      });
    }

    if (normalized === 'DELETE FROM diary_entries') {
      const previousLength = this.entries.length;
      this.entries = [];
      return Promise.resolve({
        success: true,
        meta: { changes: previousLength, last_row_id: 0 },
      });
    }

    throw new Error(`Unsupported RUN query in test mock: ${normalized}`);
  }

  private getNextEntryId() {
    return this.entries.reduce((maxId, entry) => Math.max(maxId, entry.id), 0) + 1;
  }
}

class MockR2Bucket {
  private readonly store = new Map<string, { body: Uint8Array; contentType?: string }>();

  async put(key: string, value: BodyInit | ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }) {
    const buffer = await new Response(value as BodyInit).arrayBuffer();
    this.store.set(key, {
      body: new Uint8Array(buffer),
      contentType: options?.httpMetadata?.contentType,
    });
  }

  async get(key: string) {
    const stored = this.store.get(key);
    if (!stored) {
      return null;
    }

    return {
      body: stored.body,
      size: stored.body.byteLength,
      httpMetadata: {
        contentType: stored.contentType,
      },
    };
  }

  async delete(key: string) {
    this.store.delete(key);
  }
}

function sortEntriesDescending(left: EntryRow, right: EntryRow) {
  return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
}

function createEnv(overrides?: {
  settings?: Record<string, string>;
  entries?: EntryRow[];
  statsApiKey?: string;
  environment?: string;
  appTimeZone?: string;
  sessionSecret?: string;
  adminBootstrapPassword?: string;
  appBootstrapPassword?: string;
  imagesBucket?: R2Bucket;
}) {
  const db = new MockD1Database();

  for (const [key, value] of Object.entries(overrides?.settings ?? {})) {
    db.settings.set(key, value);
  }

  db.entries = overrides?.entries ? [...overrides.entries] : [];

  return {
    DB: db as unknown as D1Database,
    ENVIRONMENT: overrides?.environment ?? 'test',
    APP_TIMEZONE: overrides?.appTimeZone,
    SESSION_SECRET: overrides?.sessionSecret,
    ADMIN_BOOTSTRAP_PASSWORD: overrides?.adminBootstrapPassword,
    APP_BOOTSTRAP_PASSWORD: overrides?.appBootstrapPassword,
    STATS_API_KEY: overrides?.statsApiKey,
    IMAGES_BUCKET: overrides?.imagesBucket,
  };
}

async function parseJson<T>(response: Response) {
  return response.json() as Promise<T>;
}

function extractCookie(response: Response) {
  const rawCookie = response.headers.get('Set-Cookie');
  assert.ok(rawCookie, 'Expected Set-Cookie header');
  return rawCookie.split(';')[0];
}

function assertNoStoreHeaders(response: Response) {
  assert.equal(response.headers.get('Cache-Control'), 'no-store, no-cache, must-revalidate');
  assert.equal(response.headers.get('Pragma'), 'no-cache');
  assert.equal(response.headers.get('Expires'), '0');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
}

async function loginAsAdmin(env: ReturnType<typeof createEnv>, password = 'admin-pass') {
  const response = await login({
    request: new Request('https://example.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'admin', password }),
    }),
    env,
  });

  assert.equal(response.status, 200);
  return extractCookie(response);
}

async function loginAsApp(env: ReturnType<typeof createEnv>, password: string) {
  const response = await login({
    request: new Request('https://example.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'app', password }),
    }),
    env,
  });

  return response;
}

test('admin login migrates legacy plaintext password to hashed storage', async () => {
  const env = createEnv({
    settings: {
      admin_password: 'legacy-admin',
      app_password_enabled: 'false',
      quick_filters_enabled: 'true',
      export_enabled: 'true',
      archive_view_enabled: 'true',
      welcome_page_enabled: 'true',
    },
  });

  const response = await login({
    request: new Request('https://example.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'admin', password: 'legacy-admin' }),
    }),
    env,
  });

  assert.equal(response.status, 200);
  const body = await parseJson<{ success: boolean; data: { isAdminAuthenticated: boolean } }>(response);
  assert.equal(body.success, true);
  assert.equal(body.data.isAdminAuthenticated, true);

  const db = env.DB as unknown as MockD1Database;
  assert.ok(db.settings.get('admin_password_hash')?.startsWith('pbkdf2$100000$'));
  assert.equal(db.settings.has('admin_password'), false);

  const sessionResponse = await getSession({
    request: new Request('https://example.com/api/auth/session', {
      headers: { Cookie: extractCookie(response) },
    }),
    env,
  });
  const sessionBody = await parseJson<{ success: boolean; data: { isAuthenticated: boolean; isAdminAuthenticated: boolean } }>(sessionResponse);
  assert.equal(sessionBody.data.isAuthenticated, true);
  assert.equal(sessionBody.data.isAdminAuthenticated, true);
});

test('app login requires correct password when protection is enabled', async () => {
  const env = createEnv({
    settings: {
      admin_password: 'admin-pass',
      app_password: 'reader-pass',
      app_password_enabled: 'true',
      quick_filters_enabled: 'true',
      export_enabled: 'true',
      archive_view_enabled: 'true',
      welcome_page_enabled: 'true',
    },
  });

  const failedResponse = await loginAsApp(env, 'wrong-pass');
  assert.equal(failedResponse.status, 401);

  const successResponse = await loginAsApp(env, 'reader-pass');
  assert.equal(successResponse.status, 200);

  const body = await parseJson<{ success: boolean; data: { isAuthenticated: boolean; isAdminAuthenticated: boolean } }>(successResponse);
  assert.equal(body.success, true);
  assert.equal(body.data.isAuthenticated, true);
  assert.equal(body.data.isAdminAuthenticated, false);

  const sessionResponse = await getSession({
    request: new Request('https://example.com/api/auth/session', {
      headers: { Cookie: extractCookie(successResponse) },
    }),
    env,
  });
  const sessionBody = await parseJson<{ success: boolean; data: { isAuthenticated: boolean; isAdminAuthenticated: boolean } }>(sessionResponse);
  assert.equal(sessionBody.data.isAuthenticated, true);
  assert.equal(sessionBody.data.isAdminAuthenticated, false);
});

test('session cookie uses Secure only for https requests', async () => {
  const env = createEnv({
    environment: 'production',
    sessionSecret: 'session-secret',
    settings: {
      admin_password: 'admin-pass',
      app_password_enabled: 'false',
      quick_filters_enabled: 'true',
      export_enabled: 'true',
      archive_view_enabled: 'true',
      welcome_page_enabled: 'true',
    },
  });

  const httpsResponse = await login({
    request: new Request('https://example.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'admin', password: 'admin-pass' }),
    }),
    env,
  });
  assert.match(httpsResponse.headers.get('Set-Cookie') ?? '', /;\sSecure/);

  const httpResponse = await login({
    request: new Request('http://127.0.0.1:8788/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'admin', password: 'admin-pass' }),
    }),
    env,
  });
  assert.doesNotMatch(httpResponse.headers.get('Set-Cookie') ?? '', /;\sSecure/);
});

test('json api responses include no-store security headers', async () => {
  const env = createEnv({
    settings: {
      admin_password: 'admin-pass',
      app_password_enabled: 'false',
      quick_filters_enabled: 'true',
      export_enabled: 'true',
      archive_view_enabled: 'true',
      welcome_page_enabled: 'true',
    },
  });

  const loginResponse = await login({
    request: new Request('https://example.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'admin', password: 'admin-pass' }),
    }),
    env,
  });

  assertNoStoreHeaders(loginResponse);

  const sessionResponse = await getSession({
    request: new Request('https://example.com/api/auth/session', {
      headers: { Cookie: extractCookie(loginResponse) },
    }),
    env,
  });

  assertNoStoreHeaders(sessionResponse);
});

test('api options responses include no-store headers for preflight requests', async () => {
  const response = await getSessionOptions();

  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assertNoStoreHeaders(response);
});

test('logout clears session cookie and invalidates subsequent session lookup', async () => {
  const env = createEnv({
    settings: {
      admin_password: 'admin-pass',
      app_password_enabled: 'false',
      quick_filters_enabled: 'true',
      export_enabled: 'true',
      archive_view_enabled: 'true',
      welcome_page_enabled: 'true',
    },
  });

  const adminCookie = await loginAsAdmin(env);
  const authenticatedSession = await getSession({
    request: new Request('https://example.com/api/auth/session', {
      headers: { Cookie: adminCookie },
    }),
    env,
  });
  const authenticatedBody = await parseJson<{ success: boolean; data: { isAuthenticated: boolean; isAdminAuthenticated: boolean } }>(authenticatedSession);
  assert.equal(authenticatedBody.data.isAuthenticated, true);
  assert.equal(authenticatedBody.data.isAdminAuthenticated, true);

  const logoutResponse = await logout({
    request: new Request('https://example.com/api/auth/logout', { method: 'POST' }),
    env,
  });
  assert.equal(logoutResponse.status, 200);
  const clearedCookie = extractCookie(logoutResponse);
  assert.match(logoutResponse.headers.get('Set-Cookie') ?? '', /Max-Age=0/);

  const clearedSession = await getSession({
    request: new Request('https://example.com/api/auth/session', {
      headers: { Cookie: clearedCookie },
    }),
    env,
  });
  const clearedBody = await parseJson<{ success: boolean; data: { isAuthenticated: boolean; isAdminAuthenticated: boolean } }>(clearedSession);
  assert.equal(clearedBody.data.isAuthenticated, false);
  assert.equal(clearedBody.data.isAdminAuthenticated, false);
});

test('tampered session cookie does not authenticate the request', async () => {
  const env = createEnv({
    settings: {
      admin_password: 'admin-pass',
      app_password_enabled: 'false',
      quick_filters_enabled: 'true',
      export_enabled: 'true',
      archive_view_enabled: 'true',
      welcome_page_enabled: 'true',
    },
  });

  const adminCookie = await loginAsAdmin(env);
  const tamperedCookie = `${adminCookie}tampered`;
  const sessionResponse = await getSession({
    request: new Request('https://example.com/api/auth/session', {
      headers: { Cookie: tamperedCookie },
    }),
    env,
  });

  const body = await parseJson<{ success: boolean; data: { isAuthenticated: boolean; isAdminAuthenticated: boolean } }>(sessionResponse);
  assert.equal(body.data.isAuthenticated, false);
  assert.equal(body.data.isAdminAuthenticated, false);
});

test('session token with extra segments is rejected', async () => {
  const env = createEnv({
    settings: {
      admin_password: 'admin-pass',
      app_password_enabled: 'false',
      quick_filters_enabled: 'true',
      export_enabled: 'true',
      archive_view_enabled: 'true',
      welcome_page_enabled: 'true',
    },
  });

  const adminCookie = await loginAsAdmin(env);
  const cookieWithExtraSegment = `${adminCookie}.extra`;
  const sessionResponse = await getSession({
    request: new Request('https://example.com/api/auth/session', {
      headers: { Cookie: cookieWithExtraSegment },
    }),
    env,
  });

  const body = await parseJson<{ success: boolean; data: { isAuthenticated: boolean; isAdminAuthenticated: boolean } }>(sessionResponse);
  assert.equal(body.success, true);
  assert.equal(body.data.isAuthenticated, false);
  assert.equal(body.data.isAdminAuthenticated, false);
});

test('malformed cookie encoding does not crash session parsing', async () => {
  const env = createEnv({
    settings: {
      admin_password: 'admin-pass',
      app_password_enabled: 'false',
      quick_filters_enabled: 'true',
      export_enabled: 'true',
      archive_view_enabled: 'true',
      welcome_page_enabled: 'true',
    },
  });

  const malformedCookieHeader = 'diary_session=%E0%A4%A';
  const sessionResponse = await getSession({
    request: new Request('https://example.com/api/auth/session', {
      headers: { Cookie: malformedCookieHeader },
    }),
    env,
  });
  assert.equal(sessionResponse.status, 200);

  const sessionBody = await parseJson<{ success: boolean; data: { isAuthenticated: boolean; isAdminAuthenticated: boolean } }>(sessionResponse);
  assert.equal(sessionBody.success, true);
  assert.equal(sessionBody.data.isAuthenticated, false);
  assert.equal(sessionBody.data.isAdminAuthenticated, false);

  const createResponse = await createEntry({
    request: new Request('https://example.com/api/entries', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: malformedCookieHeader,
      },
      body: JSON.stringify({ title: 'bad-cookie', content: 'content' }),
    }),
    env,
  });
  assert.equal(createResponse.status, 401);
});

test('public settings endpoint does not expose password fields', async () => {
  const env = createEnv({
    settings: {
      app_password_enabled: 'true',
      quick_filters_enabled: 'false',
      export_enabled: 'true',
      archive_view_enabled: 'true',
      welcome_page_enabled: 'false',
      recommendations_enabled: 'false',
      browse_status_enabled: 'true',
      device_status_enabled: 'false',
      admin_password: 'should-not-leak',
      app_password: 'should-not-leak',
    },
  });

  const response = await getSettings({ env });
  assert.equal(response.status, 200);

  const body = await parseJson<{ success: boolean; data: Record<string, unknown> }>(response);
  assert.equal(body.success, true);
  assert.deepEqual(Object.keys(body.data).sort(), [
    'archiveViewEnabled',
    'browseStatusEnabled',
    'deviceStatusEnabled',
    'exportEnabled',
    'passwordProtectionEnabled',
    'quickFiltersEnabled',
    'recommendationsEnabled',
    'welcomePageEnabled',
  ]);
  assert.equal('admin_password' in body.data, false);
  assert.equal('app_password' in body.data, false);
});

test('r2 diagnostic endpoint requires admin and reports binding status', async () => {
  const unboundEnv = createEnv({
    settings: {
      admin_password: 'admin-pass',
      app_password_enabled: 'false',
      quick_filters_enabled: 'true',
      export_enabled: 'true',
      archive_view_enabled: 'true',
      welcome_page_enabled: 'true',
    },
  });

  const guestResponse = await getR2Diagnostic({
    request: new Request('https://example.com/api/diagnostics/r2'),
    env: unboundEnv,
  });
  assert.equal(guestResponse.status, 401);

  const adminCookie = await loginAsAdmin(unboundEnv);
  const unboundResponse = await getR2Diagnostic({
    request: new Request('https://example.com/api/diagnostics/r2', {
      headers: { Cookie: adminCookie },
    }),
    env: unboundEnv,
  });
  assert.equal(unboundResponse.status, 200);
  const unboundPayload = await parseJson<{ success: boolean; data: { bucketBindingPresent: boolean; message: string } }>(unboundResponse);
  assert.equal(unboundPayload.success, true);
  assert.equal(unboundPayload.data.bucketBindingPresent, false);
  assert.match(unboundPayload.data.message, /IMAGES_BUCKET/);

  const boundEnv = createEnv({
    settings: {
      admin_password: 'admin-pass',
      app_password_enabled: 'false',
      quick_filters_enabled: 'true',
      export_enabled: 'true',
      archive_view_enabled: 'true',
      welcome_page_enabled: 'true',
    },
    imagesBucket: new MockR2Bucket() as unknown as R2Bucket,
  });
  const boundAdminCookie = await loginAsAdmin(boundEnv);
  const boundResponse = await getR2Diagnostic({
    request: new Request('https://example.com/api/diagnostics/r2', {
      headers: { Cookie: boundAdminCookie },
    }),
    env: boundEnv,
  });
  assert.equal(boundResponse.status, 200);
  const boundPayload = await parseJson<{
    success: boolean;
    data: {
      bucketBindingPresent: boolean;
      canWrite: boolean;
      canRead: boolean;
      canDelete: boolean;
      readBackMatches: boolean;
      keyPrefix: string;
    };
  }>(boundResponse);
  assert.equal(boundPayload.success, true);
  assert.equal(boundPayload.data.bucketBindingPresent, true);
  assert.equal(boundPayload.data.canWrite, true);
  assert.equal(boundPayload.data.canRead, true);
  assert.equal(boundPayload.data.canDelete, true);
  assert.equal(boundPayload.data.readBackMatches, true);
  assert.equal(boundPayload.data.keyPrefix, 'diary/');
});

test('public settings fall back to defaults when stored boolean values are invalid', async () => {
  const env = createEnv({
    settings: {
      app_password_enabled: 'invalid',
      quick_filters_enabled: 'invalid',
      export_enabled: 'invalid',
      archive_view_enabled: 'invalid',
      welcome_page_enabled: 'invalid',
      recommendations_enabled: 'invalid',
      browse_status_enabled: 'invalid',
      device_status_enabled: 'invalid',
    },
  });

  const publicSettingsResponse = await getSettings({ env });
  assert.equal(publicSettingsResponse.status, 200);
  const publicSettingsBody = await parseJson<{
    success: boolean;
    data: {
      passwordProtectionEnabled: boolean;
      quickFiltersEnabled: boolean;
      exportEnabled: boolean;
      archiveViewEnabled: boolean;
      welcomePageEnabled: boolean;
      recommendationsEnabled: boolean;
      browseStatusEnabled: boolean;
      deviceStatusEnabled: boolean;
    };
  }>(publicSettingsResponse);

  assert.equal(publicSettingsBody.success, true);
  assert.equal(publicSettingsBody.data.passwordProtectionEnabled, false);
  assert.equal(publicSettingsBody.data.quickFiltersEnabled, true);
  assert.equal(publicSettingsBody.data.exportEnabled, true);
  assert.equal(publicSettingsBody.data.archiveViewEnabled, true);
  assert.equal(publicSettingsBody.data.welcomePageEnabled, true);
  assert.equal(publicSettingsBody.data.recommendationsEnabled, true);
  assert.equal(publicSettingsBody.data.browseStatusEnabled, true);
  assert.equal(publicSettingsBody.data.deviceStatusEnabled, true);

  const singleSettingResponse = await getSettingByKey({
    params: { key: 'quick_filters_enabled' },
    request: new Request('https://example.com/api/settings/quick_filters_enabled'),
    env,
  });
  assert.equal(singleSettingResponse.status, 200);
  const singleSettingBody = await parseJson<{ success: boolean; data: Record<string, string> }>(singleSettingResponse);
  assert.equal(singleSettingBody.success, true);
  assert.equal(singleSettingBody.data.quick_filters_enabled, 'true');
});

test('entries endpoint hides hidden entries for guests and returns all for admins', async () => {
  const env = createEnv({
    settings: {
      admin_password: 'admin-pass',
      app_password_enabled: 'false',
      quick_filters_enabled: 'true',
      export_enabled: 'true',
      archive_view_enabled: 'true',
      welcome_page_enabled: 'true',
    },
    entries: [
      {
        id: 1,
        title: '公开内容',
        content: 'visible',
        content_type: 'markdown',
        mood: 'neutral',
        weather: 'sunny',
        images: '[]',
        location: null,
        created_at: '2026-04-01T10:00:00.000Z',
        updated_at: '2026-04-01T10:00:00.000Z',
        tags: '[]',
        hidden: 0,
      },
      {
        id: 2,
        title: '隐藏内容',
        content: 'hidden',
        content_type: 'markdown',
        mood: 'neutral',
        weather: 'cloudy',
        images: '[]',
        location: null,
        created_at: '2026-04-02T10:00:00.000Z',
        updated_at: '2026-04-02T10:00:00.000Z',
        tags: '[]',
        hidden: 1,
      },
    ],
  });

  const guestResponse = await getEntries({
    request: new Request('https://example.com/api/entries'),
    env,
  });
  const guestBody = await parseJson<{ success: boolean; data: Array<{ title: string }> }>(guestResponse);
  assert.equal(guestBody.data.length, 1);
  assert.equal(guestBody.data[0].title, '公开内容');

  const loginResponse = await login({
    request: new Request('https://example.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'admin', password: 'admin-pass' }),
    }),
    env,
  });

  const adminResponse = await getEntries({
    request: new Request('https://example.com/api/entries', {
      headers: { Cookie: extractCookie(loginResponse) },
    }),
    env,
  });
  const adminBody = await parseJson<{ success: boolean; data: Array<{ title: string }> }>(adminResponse);
  assert.equal(adminBody.data.length, 2);
  assert.deepEqual(adminBody.data.map((entry) => entry.title), ['隐藏内容', '公开内容']);
});

test('entries endpoint tolerates malformed stored json fields instead of failing the whole response', async () => {
  const env = createEnv({
    settings: {
      app_password_enabled: 'false',
      quick_filters_enabled: 'true',
      export_enabled: 'true',
      archive_view_enabled: 'true',
      welcome_page_enabled: 'true',
    },
    entries: [
      {
        id: 1,
        title: '损坏数据',
        content: 'still-readable',
        content_type: 'markdown',
        mood: 'neutral',
        weather: 'sunny',
        images: '{bad-json',
        location: '{bad-json',
        created_at: '2026-04-01T10:00:00.000Z',
        updated_at: '2026-04-01T10:00:00.000Z',
        tags: '{bad-json',
        hidden: 0,
      },
    ],
  });

  const response = await getEntries({
    request: new Request('https://example.com/api/entries'),
    env,
  });

  assert.equal(response.status, 200);
  const body = await parseJson<{ success: boolean; data: Array<{ images: string[]; tags: string[]; location: unknown }> }>(response);
  assert.equal(body.success, true);
  assert.deepEqual(body.data[0].images, []);
  assert.deepEqual(body.data[0].tags, []);
  assert.equal(body.data[0].location, null);
});

test('stats endpoint requires auth or a valid api key', async () => {
  const env = createEnv({
    statsApiKey: 'stats-secret',
    entries: [
      {
        id: 1,
        title: '第一天',
        content: 'day-1',
        content_type: 'markdown',
        mood: 'neutral',
        weather: 'sunny',
        images: '[]',
        location: null,
        created_at: '2026-04-08T08:00:00.000Z',
        updated_at: '2026-04-08T08:00:00.000Z',
        tags: '[]',
        hidden: 0,
      },
      {
        id: 2,
        title: '第二天',
        content: 'day-2',
        content_type: 'markdown',
        mood: 'neutral',
        weather: 'sunny',
        images: '[]',
        location: null,
        created_at: '2026-04-09T08:00:00.000Z',
        updated_at: '2026-04-09T08:00:00.000Z',
        tags: '[]',
        hidden: 0,
      },
    ],
  });

  const anonymousResponse = await getStats({
    request: new Request('https://example.com/api/stats'),
    env,
  });
  assert.equal(anonymousResponse.status, 401);

  const apiKeyResponse = await getStats({
    request: new Request('https://example.com/api/stats', {
      headers: { 'X-API-Key': 'stats-secret' },
    }),
    env,
  });
  assert.equal(apiKeyResponse.status, 200);
  const body = await parseJson<{ success: boolean; data: { total_entries: number; total_days_with_entries: number } }>(apiKeyResponse);
  assert.equal(body.success, true);
  assert.equal(body.data.total_entries, 2);
  assert.equal(body.data.total_days_with_entries, 2);
});

test('stats endpoint accepts bearer token and rejects api key in query string', async () => {
  const env = createEnv({
    statsApiKey: 'stats-secret',
    entries: [
      {
        id: 1,
        title: '第一天',
        content: 'day-1',
        content_type: 'markdown',
        mood: 'neutral',
        weather: 'sunny',
        images: '[]',
        location: null,
        created_at: '2026-04-09T08:00:00.000Z',
        updated_at: '2026-04-09T08:00:00.000Z',
        tags: '[]',
        hidden: 0,
      },
    ],
  });

  const bearerResponse = await getStats({
    request: new Request('https://example.com/api/stats', {
      headers: { Authorization: 'Bearer stats-secret' },
    }),
    env,
  });
  assert.equal(bearerResponse.status, 200);

  const queryResponse = await getStats({
    request: new Request('https://example.com/api/stats?api_key=stats-secret'),
    env,
  });
  assert.equal(queryResponse.status, 401);
});

test('stats endpoint ignores malformed created_at values instead of failing', async () => {
  const env = createEnv({
    statsApiKey: 'stats-secret',
    entries: [
      {
        id: 1,
        title: '正常日期',
        content: 'valid',
        content_type: 'markdown',
        mood: 'neutral',
        weather: 'sunny',
        images: '[]',
        location: null,
        created_at: '2026-04-09T08:00:00.000Z',
        updated_at: '2026-04-09T08:00:00.000Z',
        tags: '[]',
        hidden: 0,
      },
      {
        id: 2,
        title: '损坏日期',
        content: 'invalid',
        content_type: 'markdown',
        mood: 'neutral',
        weather: 'sunny',
        images: '[]',
        location: null,
        created_at: 'not-a-date',
        updated_at: '2026-04-09T09:00:00.000Z',
        tags: '[]',
        hidden: 0,
      },
    ],
  });

  const response = await getStats({
    request: new Request('https://example.com/api/stats', {
      headers: { 'X-API-Key': 'stats-secret' },
    }),
    env,
  });
  assert.equal(response.status, 200);

  const body = await parseJson<{
    success: boolean;
    data: {
      total_entries: number;
      total_days_with_entries: number;
      consecutive_days: number;
    };
  }>(response);
  assert.equal(body.success, true);
  assert.equal(body.data.total_entries, 2);
  assert.equal(body.data.total_days_with_entries, 1);
  assert.equal(Number.isInteger(body.data.consecutive_days), true);
});

test('stats endpoint groups dates by configured application timezone', async () => {
  const env = createEnv({
    appTimeZone: 'Asia/Shanghai',
    statsApiKey: 'stats-secret',
    entries: [
      {
        id: 1,
        title: '北京时间同一天 1',
        content: 'valid',
        content_type: 'markdown',
        mood: 'neutral',
        weather: 'sunny',
        images: '[]',
        location: null,
        created_at: '2026-04-08T16:30:00.000Z',
        updated_at: '2026-04-08T16:30:00.000Z',
        tags: '[]',
        hidden: 0,
      },
      {
        id: 2,
        title: '北京时间同一天 2',
        content: 'valid',
        content_type: 'markdown',
        mood: 'neutral',
        weather: 'sunny',
        images: '[]',
        location: null,
        created_at: '2026-04-09T01:00:00.000Z',
        updated_at: '2026-04-09T01:00:00.000Z',
        tags: '[]',
        hidden: 0,
      },
    ],
  });

  const response = await getStats({
    request: new Request('https://example.com/api/stats', {
      headers: { 'X-API-Key': 'stats-secret' },
    }),
    env,
  });
  assert.equal(response.status, 200);

  const body = await parseJson<{
    success: boolean;
    data: {
      total_entries: number;
      total_days_with_entries: number;
      latest_entry_date: string | null;
    };
  }>(response);
  assert.equal(body.success, true);
  assert.equal(body.data.total_entries, 2);
  assert.equal(body.data.total_days_with_entries, 1);
  assert.equal(body.data.latest_entry_date, '2026-04-09T01:00:00.000Z');
});

test('authenticated app session gets 403 on admin-only endpoints', async () => {
  const env = createEnv({
    settings: {
      admin_password: 'admin-pass',
      app_password_enabled: 'false',
      quick_filters_enabled: 'true',
      export_enabled: 'true',
      archive_view_enabled: 'true',
      welcome_page_enabled: 'true',
    },
  });

  const appLoginResponse = await loginAsApp(env, '');
  assert.equal(appLoginResponse.status, 200);
  const appCookie = extractCookie(appLoginResponse);

  const createByAppSession = await createEntry({
    request: new Request('https://example.com/api/entries', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: appCookie,
      },
      body: JSON.stringify({ title: 'forbidden', content: 'forbidden' }),
    }),
    env,
  });
  assert.equal(createByAppSession.status, 403);

  const adminSettingsByAppSession = await getAdminSettings({
    request: new Request('https://example.com/api/settings/admin', {
      headers: { Cookie: appCookie },
    }),
    env,
  });
  assert.equal(adminSettingsByAppSession.status, 403);

  const statsByAppSession = await getStats({
    request: new Request('https://example.com/api/stats', {
      headers: { Cookie: appCookie },
    }),
    env,
  });
  assert.equal(statsByAppSession.status, 403);
});

test('settings key endpoints return 401 for guests and 403 for app session', async () => {
  const env = createEnv({
    settings: {
      admin_password: 'admin-pass',
      app_password_enabled: 'false',
      quick_filters_enabled: 'true',
      export_enabled: 'true',
      archive_view_enabled: 'true',
      welcome_page_enabled: 'true',
    },
  });

  const guestGet = await getSettingByKey({
    params: { key: 'admin_password_configured' },
    request: new Request('https://example.com/api/settings/admin_password_configured'),
    env,
  });
  assert.equal(guestGet.status, 401);

  const guestPut = await updateSetting({
    params: { key: 'quick_filters_enabled' },
    request: new Request('https://example.com/api/settings/quick_filters_enabled', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'false' }),
    }),
    env,
  });
  assert.equal(guestPut.status, 401);

  const guestDelete = await deleteSetting({
    params: { key: 'app_password' },
    request: new Request('https://example.com/api/settings/app_password', {
      method: 'DELETE',
    }),
    env,
  });
  assert.equal(guestDelete.status, 401);

  const appLoginResponse = await loginAsApp(env, '');
  assert.equal(appLoginResponse.status, 200);
  const appCookie = extractCookie(appLoginResponse);

  const appGet = await getSettingByKey({
    params: { key: 'admin_password_configured' },
    request: new Request('https://example.com/api/settings/admin_password_configured', {
      headers: { Cookie: appCookie },
    }),
    env,
  });
  assert.equal(appGet.status, 403);

  const appPut = await updateSetting({
    params: { key: 'quick_filters_enabled' },
    request: new Request('https://example.com/api/settings/quick_filters_enabled', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: appCookie,
      },
      body: JSON.stringify({ value: 'false' }),
    }),
    env,
  });
  assert.equal(appPut.status, 403);

  const appDelete = await deleteSetting({
    params: { key: 'app_password' },
    request: new Request('https://example.com/api/settings/app_password', {
      method: 'DELETE',
      headers: { Cookie: appCookie },
    }),
    env,
  });
  assert.equal(appDelete.status, 403);
});

test('entries extra admin endpoints return 401 for guests and 403 for app session', async () => {
  const env = createEnv({
    settings: {
      admin_password: 'admin-pass',
      app_password_enabled: 'false',
      quick_filters_enabled: 'true',
      export_enabled: 'true',
      archive_view_enabled: 'true',
      welcome_page_enabled: 'true',
    },
    entries: [
      {
        id: 1,
        title: '原始标题',
        content: '原始内容',
        content_type: 'markdown',
        mood: 'neutral',
        weather: 'cloudy',
        images: '[]',
        location: null,
        created_at: '2026-04-01T08:00:00.000Z',
        updated_at: '2026-04-01T08:00:00.000Z',
        tags: '[]',
        hidden: 0,
      },
    ],
  });

  const guestEdit = await editEntry({
    params: { id: '1' },
    request: new Request('https://example.com/api/entries/1/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '访客更新' }),
    }),
    env,
  });
  assert.equal(guestEdit.status, 401);

  const guestToggle = await toggleEntryVisibility({
    params: { id: '1' },
    request: new Request('https://example.com/api/entries/1/toggle-visibility', {
      method: 'POST',
    }),
    env,
  });
  assert.equal(guestToggle.status, 401);

  const appLoginResponse = await loginAsApp(env, '');
  assert.equal(appLoginResponse.status, 200);
  const appCookie = extractCookie(appLoginResponse);

  const appEdit = await editEntry({
    params: { id: '1' },
    request: new Request('https://example.com/api/entries/1/edit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: appCookie,
      },
      body: JSON.stringify({ title: '非管理员更新' }),
    }),
    env,
  });
  assert.equal(appEdit.status, 403);

  const appToggle = await toggleEntryVisibility({
    params: { id: '1' },
    request: new Request('https://example.com/api/entries/1/toggle-visibility', {
      method: 'POST',
      headers: { Cookie: appCookie },
    }),
    env,
  });
  assert.equal(appToggle.status, 403);
});

test('write endpoints require admin session and allow create update delete after login', async () => {
  const env = createEnv({
    settings: {
      admin_password: 'admin-pass',
      app_password_enabled: 'false',
      quick_filters_enabled: 'true',
      export_enabled: 'true',
      archive_view_enabled: 'true',
      welcome_page_enabled: 'true',
    },
    entries: [
      {
        id: 1,
        title: '原始标题',
        content: '原始内容',
        content_type: 'markdown',
        mood: 'neutral',
        weather: 'cloudy',
        images: '[]',
        location: null,
        created_at: '2026-04-01T08:00:00.000Z',
        updated_at: '2026-04-01T08:00:00.000Z',
        tags: '[]',
        hidden: 0,
      },
    ],
  });

  const guestCreate = await createEntry({
    request: new Request('https://example.com/api/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '访客', content: 'nope' }),
    }),
    env,
  });
  assert.equal(guestCreate.status, 401);

  const adminCookie = await loginAsAdmin(env);

  const createResponse = await createEntry({
    request: new Request('https://example.com/api/entries', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ title: '新建标题', content: '新建内容', hidden: true }),
    }),
    env,
  });
  assert.equal(createResponse.status, 200);
  const createdBody = await parseJson<{ success: boolean; data: { id: number; hidden: boolean } }>(createResponse);
  assert.equal(createdBody.success, true);
  assert.equal(createdBody.data.hidden, true);

  const updateResponse = await updateEntry({
    params: { id: '1' },
    request: new Request('https://example.com/api/entries/1', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ title: '已更新标题', content: '已更新内容', hidden: true }),
    }),
    env,
  });
  assert.equal(updateResponse.status, 200);
  const updatedBody = await parseJson<{ success: boolean; data: { title: string; hidden: boolean } }>(updateResponse);
  assert.equal(updatedBody.data.title, '已更新标题');
  assert.equal(updatedBody.data.hidden, true);

  const deleteResponse = await deleteEntry({
    params: { id: '1' },
    request: new Request('https://example.com/api/entries/1', {
      method: 'DELETE',
      headers: { Cookie: adminCookie },
    }),
    env,
  });
  assert.equal(deleteResponse.status, 200);
  const db = env.DB as unknown as MockD1Database;
  assert.equal(db.entries.some((entry) => entry.id === 1), false);
});

test('entry write endpoints reject invalid structured payloads with 400 responses', async () => {
  const env = createEnv({
    settings: {
      admin_password: 'admin-pass',
      app_password_enabled: 'false',
      quick_filters_enabled: 'true',
      export_enabled: 'true',
      archive_view_enabled: 'true',
      welcome_page_enabled: 'true',
    },
    entries: [
      {
        id: 1,
        title: '原始标题',
        content: '原始内容',
        content_type: 'markdown',
        mood: 'neutral',
        weather: 'cloudy',
        images: '[]',
        location: null,
        created_at: '2026-04-01T08:00:00.000Z',
        updated_at: '2026-04-01T08:00:00.000Z',
        tags: '[]',
        hidden: 0,
      },
    ],
  });

  const adminCookie = await loginAsAdmin(env);

  const invalidCreate = await createEntry({
    request: new Request('https://example.com/api/entries', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ title: '错误', content: 'x', images: ['ok', 1] }),
    }),
    env,
  });
  assert.equal(invalidCreate.status, 400);

  const invalidUpdate = await updateEntry({
    params: { id: '1' },
    request: new Request('https://example.com/api/entries/1', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ hidden: 'true' }),
    }),
    env,
  });
  assert.equal(invalidUpdate.status, 400);

  const overlongTitle = await createEntry({
    request: new Request('https://example.com/api/entries', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ title: 'x'.repeat(201), content: 'valid-content' }),
    }),
    env,
  });
  assert.equal(overlongTitle.status, 400);
});

test('batch import requires admin and overwrite clears existing entries', async () => {
  const env = createEnv({
    settings: {
      admin_password: 'admin-pass',
      app_password_enabled: 'false',
      quick_filters_enabled: 'true',
      export_enabled: 'true',
      archive_view_enabled: 'true',
      welcome_page_enabled: 'true',
    },
    entries: [
      {
        id: 1,
        title: '旧内容',
        content: 'old',
        content_type: 'markdown',
        mood: 'neutral',
        weather: 'cloudy',
        images: '[]',
        location: null,
        created_at: '2026-04-01T08:00:00.000Z',
        updated_at: '2026-04-01T08:00:00.000Z',
        tags: '[]',
        hidden: 0,
      },
    ],
  });

  const guestImport = await batchImportEntries({
    request: new Request('https://example.com/api/entries/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: [{ title: 'x', content: 'y' }] }),
    }),
    env,
  });
  assert.equal(guestImport.status, 401);

  const adminCookie = await loginAsAdmin(env);
  const importResponse = await batchImportEntries({
    request: new Request('https://example.com/api/entries/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        entries: [
          {
            title: '导入内容',
            content: 'imported',
            content_type: 'markdown',
            mood: 'happy',
            weather: 'sunny',
            images: [],
            location: null,
            tags: ['导入'],
            hidden: false,
            created_at: '2026-04-03T08:00:00.000Z',
          },
        ],
        options: { overwrite: true },
      }),
    }),
    env,
  });
  assert.equal(importResponse.status, 200);

  const db = env.DB as unknown as MockD1Database;
  assert.equal(db.entries.length, 1);
  assert.equal(db.entries[0].title, '导入内容');
});

test('batch endpoints reject invalid payloads before writing data', async () => {
  const env = createEnv({
    settings: {
      admin_password: 'admin-pass',
      app_password_enabled: 'false',
      quick_filters_enabled: 'true',
      export_enabled: 'true',
      archive_view_enabled: 'true',
      welcome_page_enabled: 'true',
    },
    entries: [
      {
        id: 1,
        title: '旧内容',
        content: 'old',
        content_type: 'markdown',
        mood: 'neutral',
        weather: 'cloudy',
        images: '[]',
        location: null,
        created_at: '2026-04-01T08:00:00.000Z',
        updated_at: '2026-04-01T08:00:00.000Z',
        tags: '[]',
        hidden: 0,
      },
    ],
  });

  const adminCookie = await loginAsAdmin(env);

  const invalidImport = await batchImportEntries({
    request: new Request('https://example.com/api/entries/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        entries: [
          {
            title: '坏数据',
            content: 'imported',
            content_type: 'html',
          },
        ],
      }),
    }),
    env,
  });
  assert.equal(invalidImport.status, 400);

  const invalidBatchUpdate = await batchUpdateEntries({
    request: new Request('https://example.com/api/entries/batch', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        entries: [
          {
            id: 1,
            title: '坏时间',
            content: 'updated',
            created_at: 'not-a-date',
          },
        ],
      }),
    }),
    env,
  });
  assert.equal(invalidBatchUpdate.status, 400);

  const tooManyTagsImport = await batchImportEntries({
    request: new Request('https://example.com/api/entries/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        entries: [
          {
            title: '标签过多',
            content: 'imported',
            tags: Array.from({ length: 31 }, (_, index) => `tag-${index}`),
          },
        ],
      }),
    }),
    env,
  });
  assert.equal(tooManyTagsImport.status, 400);

  const db = env.DB as unknown as MockD1Database;
  assert.equal(db.entries[0].title, '旧内容');
});

test('batch import pre-validates all entries to prevent partial writes', async () => {
  const env = createEnv({
    settings: {
      admin_password: 'admin-pass',
      app_password_enabled: 'false',
      quick_filters_enabled: 'true',
      export_enabled: 'true',
      archive_view_enabled: 'true',
      welcome_page_enabled: 'true',
    },
    entries: [
      {
        id: 1,
        title: '已有内容',
        content: 'old',
        content_type: 'markdown',
        mood: 'neutral',
        weather: 'cloudy',
        images: '[]',
        location: null,
        created_at: '2026-04-01T08:00:00.000Z',
        updated_at: '2026-04-01T08:00:00.000Z',
        tags: '[]',
        hidden: 0,
      },
    ],
  });

  const adminCookie = await loginAsAdmin(env);

  const response = await batchImportEntries({
    request: new Request('https://example.com/api/entries/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        entries: [
          {
            title: '本应成功但不应落库',
            content: 'valid',
            content_type: 'markdown',
          },
          {
            title: '坏数据',
            content: 'invalid',
            content_type: 'html',
          },
        ],
      }),
    }),
    env,
  });
  assert.equal(response.status, 400);

  const db = env.DB as unknown as MockD1Database;
  assert.equal(db.entries.length, 1);
  assert.equal(db.entries[0].title, '已有内容');
});

test('batch import accepts embedded base64 images without requiring upload files', async () => {
  const env = createEnv({
    settings: {
      admin_password: 'admin-pass',
      app_password_enabled: 'false',
      quick_filters_enabled: 'true',
      export_enabled: 'true',
      archive_view_enabled: 'true',
      welcome_page_enabled: 'true',
    },
  });

  const adminCookie = await loginAsAdmin(env);

  const response = await batchImportEntries({
    request: new Request('https://example.com/api/entries/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        entries: [
          {
            title: '带内嵌图片',
            content: 'imported',
            images: ['data:image/png;base64,aGVsbG8='],
          },
        ],
      }),
    }),
    env,
  });

  assert.equal(response.status, 200);
  const payload = await response.json() as { success: boolean; data?: Array<{ images?: string[] }> };
  assert.equal(payload.success, true);
  assert.deepEqual(payload.data?.[0]?.images, ['data:image/png;base64,aGVsbG8=']);
});

test('batch update enforces valid ids and prevents partial writes', async () => {
  const env = createEnv({
    settings: {
      admin_password: 'admin-pass',
      app_password_enabled: 'false',
      quick_filters_enabled: 'true',
      export_enabled: 'true',
      archive_view_enabled: 'true',
      welcome_page_enabled: 'true',
    },
    entries: [
      {
        id: 1,
        title: '第一篇',
        content: 'old-1',
        content_type: 'markdown',
        mood: 'neutral',
        weather: 'cloudy',
        images: '[]',
        location: null,
        created_at: '2026-04-01T08:00:00.000Z',
        updated_at: '2026-04-01T08:00:00.000Z',
        tags: '[]',
        hidden: 0,
      },
      {
        id: 2,
        title: '第二篇',
        content: 'old-2',
        content_type: 'markdown',
        mood: 'neutral',
        weather: 'cloudy',
        images: '[]',
        location: null,
        created_at: '2026-04-02T08:00:00.000Z',
        updated_at: '2026-04-02T08:00:00.000Z',
        tags: '[]',
        hidden: 0,
      },
    ],
  });

  const adminCookie = await loginAsAdmin(env);

  const invalidIdResponse = await batchUpdateEntries({
    request: new Request('https://example.com/api/entries/batch', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        entries: [
          {
            id: 1,
            title: '会被拦截',
            content: 'new-1',
          },
          {
            id: '2',
            title: '非法id',
            content: 'new-2',
          },
        ],
      }),
    }),
    env,
  });
  assert.equal(invalidIdResponse.status, 400);

  const dbAfterInvalidId = env.DB as unknown as MockD1Database;
  assert.equal(dbAfterInvalidId.entries.find((entry) => entry.id === 1)?.title, '第一篇');
  assert.equal(dbAfterInvalidId.entries.find((entry) => entry.id === 2)?.title, '第二篇');

  const duplicateIdResponse = await batchUpdateEntries({
    request: new Request('https://example.com/api/entries/batch', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        entries: [
          {
            id: 1,
            title: '重复-1',
            content: 'dup-1',
          },
          {
            id: 1,
            title: '重复-2',
            content: 'dup-2',
          },
        ],
      }),
    }),
    env,
  });
  assert.equal(duplicateIdResponse.status, 400);

  const missingTargetResponse = await batchUpdateEntries({
    request: new Request('https://example.com/api/entries/batch', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        entries: [
          {
            id: 1,
            title: '仍不应更新',
            content: 'new-1',
          },
          {
            id: 999,
            title: '不存在',
            content: 'new-999',
          },
        ],
      }),
    }),
    env,
  });
  assert.equal(missingTargetResponse.status, 404);

  const dbAfterMissingTarget = env.DB as unknown as MockD1Database;
  assert.equal(dbAfterMissingTarget.entries.find((entry) => entry.id === 1)?.title, '第一篇');
});

test('batch endpoints reject oversized batch payloads with 413', async () => {
  const env = createEnv({
    settings: {
      admin_password: 'admin-pass',
      app_password_enabled: 'false',
      quick_filters_enabled: 'true',
      export_enabled: 'true',
      archive_view_enabled: 'true',
      welcome_page_enabled: 'true',
    },
  });

  const adminCookie = await loginAsAdmin(env);
  const oversizedImportEntries = Array.from({ length: 201 }, (_, index) => ({
    title: `批量导入-${index}`,
    content: `content-${index}`,
  }));

  const oversizedImportResponse = await batchImportEntries({
    request: new Request('https://example.com/api/entries/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ entries: oversizedImportEntries }),
    }),
    env,
  });
  assert.equal(oversizedImportResponse.status, 413);

  const oversizedUpdateEntries = Array.from({ length: 201 }, (_, index) => ({
    id: index + 1,
    title: `批量更新-${index}`,
    content: `content-${index}`,
  }));

  const oversizedUpdateResponse = await batchUpdateEntries({
    request: new Request('https://example.com/api/entries/batch', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ entries: oversizedUpdateEntries }),
    }),
    env,
  });
  assert.equal(oversizedUpdateResponse.status, 413);
});

test('admin settings endpoints reject guests and require app password before enabling protection', async () => {
  const env = createEnv({
    settings: {
      admin_password: 'admin-pass',
      app_password_enabled: 'false',
      quick_filters_enabled: 'true',
      export_enabled: 'true',
      archive_view_enabled: 'true',
      welcome_page_enabled: 'true',
    },
  });

  const guestAdminSettings = await getAdminSettings({
    request: new Request('https://example.com/api/settings/admin'),
    env,
  });
  assert.equal(guestAdminSettings.status, 401);

  const guestEnableProtection = await updateSetting({
    params: { key: 'app_password_enabled' },
    request: new Request('https://example.com/api/settings/app_password_enabled', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'true' }),
    }),
    env,
  });
  assert.equal(guestEnableProtection.status, 401);

  const adminCookie = await loginAsAdmin(env);

  const enableWithoutPassword = await updateSetting({
    params: { key: 'app_password_enabled' },
    request: new Request('https://example.com/api/settings/app_password_enabled', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ value: 'true' }),
    }),
    env,
  });
  assert.equal(enableWithoutPassword.status, 400);

  const setAppPasswordResponse = await updateSetting({
    params: { key: 'app_password' },
    request: new Request('https://example.com/api/settings/app_password', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ value: 'diary-pass' }),
    }),
    env,
  });
  assert.equal(setAppPasswordResponse.status, 200);

  const enableWithPassword = await updateSetting({
    params: { key: 'app_password_enabled' },
    request: new Request('https://example.com/api/settings/app_password_enabled', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ value: 'true' }),
    }),
    env,
  });
  assert.equal(enableWithPassword.status, 200);

  const adminSettingsResponse = await getAdminSettings({
    request: new Request('https://example.com/api/settings/admin', {
      headers: { Cookie: adminCookie },
    }),
    env,
  });
  assert.equal(adminSettingsResponse.status, 200);
  const adminSettingsBody = await parseJson<{ success: boolean; data: { passwordProtectionEnabled: boolean; appPasswordConfigured: boolean } }>(adminSettingsResponse);
  assert.equal(adminSettingsBody.data.passwordProtectionEnabled, true);
  assert.equal(adminSettingsBody.data.appPasswordConfigured, true);
});

test('settings updates reject invalid values with 400 responses', async () => {
  const env = createEnv({
    settings: {
      admin_password: 'admin-pass',
      app_password_enabled: 'false',
      quick_filters_enabled: 'true',
      export_enabled: 'true',
      archive_view_enabled: 'true',
      welcome_page_enabled: 'true',
    },
  });

  const adminCookie = await loginAsAdmin(env);

  const invalidBoolean = await updateSetting({
    params: { key: 'app_password_enabled' },
    request: new Request('https://example.com/api/settings/app_password_enabled', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ value: 'yes' }),
    }),
    env,
  });
  assert.equal(invalidBoolean.status, 400);

  const shortPassword = await updateSetting({
    params: { key: 'app_password' },
    request: new Request('https://example.com/api/settings/app_password', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ value: '123' }),
    }),
    env,
  });
  assert.equal(shortPassword.status, 400);

  const oversizedPassword = await updateSetting({
    params: { key: 'app_password' },
    request: new Request('https://example.com/api/settings/app_password', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ value: 'x'.repeat(257) }),
    }),
    env,
  });
  assert.equal(oversizedPassword.status, 400);

  const nonStringValue = await updateSetting({
    params: { key: 'quick_filters_enabled' },
    request: new Request('https://example.com/api/settings/quick_filters_enabled', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ value: true }),
    }),
    env,
  });
  assert.equal(nonStringValue.status, 400);
});

test('deleting password settings clears both hash and legacy keys', async () => {
  const env = createEnv({
    settings: {
      admin_password: 'admin-pass',
      app_password_enabled: 'false',
      quick_filters_enabled: 'true',
      export_enabled: 'true',
      archive_view_enabled: 'true',
      welcome_page_enabled: 'true',
    },
  });

  const adminCookie = await loginAsAdmin(env);
  const db = env.DB as unknown as MockD1Database;

  db.settings.set('admin_password', 'legacy-backdoor');
  assert.equal(db.settings.has('admin_password_hash'), true);
  assert.equal(db.settings.has('admin_password'), true);

  const deleteResponse = await deleteSetting({
    params: { key: 'admin_password' },
    request: new Request('https://example.com/api/settings/admin_password', {
      method: 'DELETE',
      headers: { Cookie: adminCookie },
    }),
    env,
  });
  assert.equal(deleteResponse.status, 200);
  assert.equal(db.settings.has('admin_password_hash'), false);
  assert.equal(db.settings.has('admin_password'), false);

  const legacyLogin = await login({
    request: new Request('https://example.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'admin', password: 'legacy-backdoor' }),
    }),
    env,
  });
  assert.equal(legacyLogin.status, 401);
});

test('deleting app password disables app password protection automatically', async () => {
  const env = createEnv({
    settings: {
      admin_password: 'admin-pass',
      app_password: 'reader-pass',
      app_password_enabled: 'true',
      quick_filters_enabled: 'true',
      export_enabled: 'true',
      archive_view_enabled: 'true',
      welcome_page_enabled: 'true',
    },
  });

  const adminCookie = await loginAsAdmin(env);

  const deleteResponse = await deleteSetting({
    params: { key: 'app_password' },
    request: new Request('https://example.com/api/settings/app_password', {
      method: 'DELETE',
      headers: { Cookie: adminCookie },
    }),
    env,
  });
  assert.equal(deleteResponse.status, 200);

  const db = env.DB as unknown as MockD1Database;
  assert.equal(db.settings.has('app_password'), false);
  assert.equal(db.settings.has('app_password_hash'), false);
  assert.equal(db.settings.get('app_password_enabled'), 'false');

  const appLoginWithoutPassword = await loginAsApp(env, '');
  assert.equal(appLoginWithoutPassword.status, 200);
});

test('invalid json payloads return 400 across auth and write endpoints', async () => {
  const env = createEnv({
    settings: {
      admin_password: 'admin-pass',
      app_password_enabled: 'false',
      quick_filters_enabled: 'true',
      export_enabled: 'true',
      archive_view_enabled: 'true',
      welcome_page_enabled: 'true',
    },
  });

  const invalidLogin = await login({
    request: new Request('https://example.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"scope":"admin","password":"admin-pass"',
    }),
    env,
  });
  assert.equal(invalidLogin.status, 400);

  const adminCookie = await loginAsAdmin(env);

  const invalidCreate = await createEntry({
    request: new Request('https://example.com/api/entries', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: '{"title":"bad-json","content":"x"',
    }),
    env,
  });
  assert.equal(invalidCreate.status, 400);

  const invalidSetting = await updateSetting({
    params: { key: 'quick_filters_enabled' },
    request: new Request('https://example.com/api/settings/quick_filters_enabled', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: '{"value":"true"',
    }),
    env,
  });
  assert.equal(invalidSetting.status, 400);

  const invalidBatch = await batchImportEntries({
    request: new Request('https://example.com/api/entries/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: '{"entries":[{"title":"x","content":"y"}]',
    }),
    env,
  });
  assert.equal(invalidBatch.status, 400);
});

test('json endpoints require application/json content type', async () => {
  const env = createEnv({
    settings: {
      admin_password: 'admin-pass',
      app_password_enabled: 'false',
      quick_filters_enabled: 'true',
      export_enabled: 'true',
      archive_view_enabled: 'true',
      welcome_page_enabled: 'true',
    },
  });

  const loginWrongType = await login({
    request: new Request('https://example.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ scope: 'admin', password: 'admin-pass' }),
    }),
    env,
  });
  assert.equal(loginWrongType.status, 415);

  const adminCookie = await loginAsAdmin(env);

  const createWrongType = await createEntry({
    request: new Request('https://example.com/api/entries', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ title: 'x', content: 'y' }),
    }),
    env,
  });
  assert.equal(createWrongType.status, 415);

  const settingWrongType = await updateSetting({
    params: { key: 'quick_filters_enabled' },
    request: new Request('https://example.com/api/settings/quick_filters_enabled', {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/plain',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ value: 'true' }),
    }),
    env,
  });
  assert.equal(settingWrongType.status, 415);
});

test('json endpoints reject oversized payloads with 413', async () => {
  const env = createEnv({
    settings: {
      admin_password: 'admin-pass',
      app_password_enabled: 'false',
      quick_filters_enabled: 'true',
      export_enabled: 'true',
      archive_view_enabled: 'true',
      welcome_page_enabled: 'true',
    },
  });

  const oversizedLogin = await login({
    request: new Request('https://example.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'admin', password: 'x'.repeat(20 * 1024) }),
    }),
    env,
  });
  assert.equal(oversizedLogin.status, 413);

  const adminCookie = await loginAsAdmin(env);

  const oversizedCreate = await createEntry({
    request: new Request('https://example.com/api/entries', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ title: '大内容', content: 'x'.repeat(41 * 1024 * 1024) }),
    }),
    env,
  });
  assert.equal(oversizedCreate.status, 413);

  const oversizedSetting = await updateSetting({
    params: { key: 'quick_filters_enabled' },
    request: new Request('https://example.com/api/settings/quick_filters_enabled', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ value: 'x'.repeat(70 * 1024) }),
    }),
    env,
  });
  assert.equal(oversizedSetting.status, 413);

  const oversizedBatch = await batchImportEntries({
    request: new Request('https://example.com/api/entries/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        entries: [
          {
            title: '超大批量',
            content: 'x'.repeat(52 * 1024 * 1024),
          },
        ],
      }),
    }),
    env,
  });
  assert.equal(oversizedBatch.status, 413);
});

test('production login fails when SESSION_SECRET is missing', async () => {
  const env = createEnv({
    environment: 'production',
    settings: {
      admin_password: 'admin-pass',
      app_password_enabled: 'false',
      quick_filters_enabled: 'true',
      export_enabled: 'true',
      archive_view_enabled: 'true',
      welcome_page_enabled: 'true',
    },
  });

  const response = await login({
    request: new Request('https://example.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'admin', password: 'admin-pass' }),
    }),
    env,
  });

  assert.equal(response.status, 500);
  const body = await parseJson<{ success: boolean; error: string }>(response);
  assert.equal(body.success, false);
  assert.match(body.error, /SESSION_SECRET/);
});
