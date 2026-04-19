import test from 'node:test';
import assert from 'node:assert/strict';

type SessionState = {
  isAuthenticated: boolean;
  isAdminAuthenticated: boolean;
};

class MockLocalStorage {
  private readonly store = new Map<string, string>();

  clear() {
    this.store.clear();
  }

  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.store.delete(key);
  }

  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }

  get length() {
    return this.store.size;
  }
}

const localStorageMock = new MockLocalStorage();
globalThis.localStorage = localStorageMock as unknown as Storage;

async function loadApiServiceClass() {
  const module = await import('../src/services/api.ts');
  return module.ApiService;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

test('api service emits session changes for mock login and logout flows', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_local', 'true');

  const ApiService = await loadApiServiceClass();
  const service = new ApiService();
  const events: SessionState[] = [];
  const unsubscribe = service.subscribeToSessionChanges((session) => {
    events.push(session);
  });

  await service.getSession();
  await service.loginAdmin('admin123');
  await service.logout();
  unsubscribe();

  assert.deepEqual(events, [
    { isAuthenticated: false, isAdminAuthenticated: false },
    { isAuthenticated: true, isAdminAuthenticated: true },
    { isAuthenticated: false, isAdminAuthenticated: false },
  ]);
});

test('api service emits signed-out session when a protected remote request returns 401', async () => {
  localStorageMock.clear();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;

    if (url.endsWith('/api/settings/admin')) {
      return jsonResponse({
        success: false,
        error: '需要管理员权限',
      }, 401);
    }

    if (url.endsWith('/api/auth/session')) {
      return jsonResponse({
        success: true,
        data: {
          isAuthenticated: false,
          isAdminAuthenticated: false,
        },
      });
    }

    throw new Error(`Unexpected fetch URL in test: ${url}`);
  };

  try {
    const ApiService = await loadApiServiceClass();
    const service = new ApiService();
    const events: SessionState[] = [];
    service.subscribeToSessionChanges((session) => {
      events.push(session);
    });

    await assert.rejects(
      service.getAdminSettings(),
      /需要管理员权限/
    );

    assert.deepEqual(events, [
      { isAuthenticated: false, isAdminAuthenticated: false },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('api service keeps app session on admin-only 401 responses', async () => {
  localStorageMock.clear();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;

    if (url.endsWith('/api/settings/admin')) {
      return jsonResponse({
        success: false,
        error: '需要管理员权限',
      }, 401);
    }

    if (url.endsWith('/api/auth/session')) {
      return jsonResponse({
        success: true,
        data: {
          isAuthenticated: true,
          isAdminAuthenticated: false,
        },
      });
    }

    throw new Error(`Unexpected fetch URL in test: ${url}`);
  };

  try {
    const ApiService = await loadApiServiceClass();
    const service = new ApiService();
    const events: SessionState[] = [];
    service.subscribeToSessionChanges((session) => {
      events.push(session);
    });

    await assert.rejects(
      service.getAdminSettings(),
      /需要管理员权限/
    );

    assert.deepEqual(events, [
      { isAuthenticated: true, isAdminAuthenticated: false },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('api service does not emit session change for failed login, and stats 401 refreshes real session', async () => {
  localStorageMock.clear();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;

    if (url.endsWith('/api/auth/login')) {
      return jsonResponse({
        success: false,
        error: '管理员密码错误',
      }, 401);
    }

    if (url.endsWith('/api/stats')) {
      return jsonResponse({
        success: false,
        error: '访问被拒绝',
      }, 401);
    }

    if (url.endsWith('/api/auth/session')) {
      return jsonResponse({
        success: true,
        data: {
          isAuthenticated: true,
          isAdminAuthenticated: false,
        },
      });
    }

    throw new Error(`Unexpected fetch URL in test: ${url}`);
  };

  try {
    const ApiService = await loadApiServiceClass();
    const service = new ApiService();
    const events: SessionState[] = [];
    service.subscribeToSessionChanges((session) => {
      events.push(session);
    });

    await assert.rejects(
      service.loginAdmin('wrong-password'),
      /管理员密码错误/
    );
    await assert.rejects(
      service.getStats(),
      /访问被拒绝/
    );

    assert.deepEqual(events, [
      { isAuthenticated: true, isAdminAuthenticated: false },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('api service de-duplicates session refresh when concurrent requests get 401', async () => {
  localStorageMock.clear();

  const originalFetch = globalThis.fetch;
  let sessionRefreshCount = 0;

  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;

    if (url.endsWith('/api/settings/admin')) {
      return jsonResponse({
        success: false,
        error: '需要管理员权限',
      }, 401);
    }

    if (url.endsWith('/api/auth/session')) {
      sessionRefreshCount += 1;
      return jsonResponse({
        success: true,
        data: {
          isAuthenticated: false,
          isAdminAuthenticated: false,
        },
      });
    }

    throw new Error(`Unexpected fetch URL in test: ${url}`);
  };

  try {
    const ApiService = await loadApiServiceClass();
    const service = new ApiService();
    const events: SessionState[] = [];
    service.subscribeToSessionChanges((session) => {
      events.push(session);
    });

    const [firstResult, secondResult] = await Promise.allSettled([
      service.getAdminSettings(),
      service.getAdminSettings(),
    ]);

    assert.equal(firstResult.status, 'rejected');
    assert.equal(secondResult.status, 'rejected');
    assert.equal(sessionRefreshCount, 1);
    assert.deepEqual(events, [
      { isAuthenticated: false, isAdminAuthenticated: false },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mock mode rejects oversized password updates to match server rules', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_local', 'true');
  localStorageMock.setItem('diary-app-authenticated', 'true');
  localStorageMock.setItem('diary-admin-authenticated', 'true');

  const ApiService = await loadApiServiceClass();
  const service = new ApiService();

  await assert.rejects(
    service.setSetting('app_password', 'x'.repeat(257)),
    /不能超过 256/
  );
});

test('mock mode stats ignore malformed created_at values', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_local', 'true');
  localStorageMock.setItem('diary-app-authenticated', 'true');
  localStorageMock.setItem('diary-admin-authenticated', 'true');
  localStorageMock.setItem('diary_app_data', JSON.stringify([
    {
      id: 1,
      title: 'valid',
      content: 'valid',
      content_type: 'markdown',
      mood: 'neutral',
      weather: 'sunny',
      images: [],
      location: null,
      tags: [],
      hidden: false,
      created_at: '2026-04-09T08:00:00.000Z',
      updated_at: '2026-04-09T08:00:00.000Z',
    },
    {
      id: 2,
      title: 'invalid',
      content: 'invalid',
      content_type: 'markdown',
      mood: 'neutral',
      weather: 'cloudy',
      images: [],
      location: null,
      tags: [],
      hidden: false,
      created_at: 'not-a-date',
      updated_at: '2026-04-09T09:00:00.000Z',
    },
  ]));

  const ApiService = await loadApiServiceClass();
  const service = new ApiService();
  const stats = await service.getStats();

  assert.equal(stats.total_entries, 2);
  assert.equal(stats.total_days_with_entries, 1);
  assert.equal(Number.isInteger(stats.consecutive_days), true);
});

test('mock mode stats group entries by application timezone', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_local', 'true');
  localStorageMock.setItem('diary-app-authenticated', 'true');
  localStorageMock.setItem('diary-admin-authenticated', 'true');
  localStorageMock.setItem('diary_app_data', JSON.stringify([
    {
      id: 1,
      title: 'same-day-1',
      content: 'valid',
      content_type: 'markdown',
      mood: 'neutral',
      weather: 'sunny',
      images: [],
      location: null,
      tags: [],
      hidden: false,
      created_at: '2026-04-08T16:30:00.000Z',
      updated_at: '2026-04-08T16:30:00.000Z',
    },
    {
      id: 2,
      title: 'same-day-2',
      content: 'valid',
      content_type: 'markdown',
      mood: 'neutral',
      weather: 'sunny',
      images: [],
      location: null,
      tags: [],
      hidden: false,
      created_at: '2026-04-09T01:00:00.000Z',
      updated_at: '2026-04-09T01:00:00.000Z',
    },
  ]));

  const ApiService = await loadApiServiceClass();
  const service = new ApiService();
  const stats = await service.getStats();

  assert.equal(stats.total_entries, 2);
  assert.equal(stats.total_days_with_entries, 1);
});

test('mock mode public settings fall back to defaults on invalid boolean strings', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_local', 'true');
  localStorageMock.setItem('diary_app_settings', JSON.stringify({
    app_password_enabled: 'invalid',
    reading_desk_enabled: 'invalid',
    quick_filters_enabled: 'invalid',
    export_enabled: 'invalid',
    archive_view_enabled: 'invalid',
    welcome_page_enabled: 'invalid',
    recommendations_enabled: 'invalid',
    browse_status_enabled: 'invalid',
    device_status_enabled: 'invalid',
  }));

  const ApiService = await loadApiServiceClass();
  const service = new ApiService();
  const settings = await service.getPublicSettings();

  assert.equal(settings.passwordProtectionEnabled, false);
  assert.equal(settings.readingDeskEnabled, true);
  assert.equal(settings.quickFiltersEnabled, true);
  assert.equal(settings.exportEnabled, true);
  assert.equal(settings.archiveViewEnabled, true);
  assert.equal(settings.welcomePageEnabled, true);
  assert.equal(settings.recommendationsEnabled, true);
  assert.equal(settings.browseStatusEnabled, true);
  assert.equal(settings.deviceStatusEnabled, true);
});

test('remote image upload falls back to base64 data urls when upload endpoint fails', async () => {
  localStorageMock.clear();

  const originalFetch = globalThis.fetch;
  let uploadAttempts = 0;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;

    if (url.endsWith('/api/uploads/image')) {
      uploadAttempts += 1;

      if (uploadAttempts === 1) {
        return jsonResponse({
          success: false,
          error: '缺少图片文件，请检查上传表单是否包含图片文件',
        }, 400);
      }

      const parsedBody = init?.body ? JSON.parse(String(init.body)) as { dataUrl?: string } : {};
      return jsonResponse({
        success: true,
        data: {
          url: parsedBody.dataUrl ? 'https://example.com/api/images/diary%2Fjson-fallback.png' : '',
        },
      });
    }

    throw new Error(`Unexpected fetch URL in test: ${url}`);
  };

  try {
    const ApiService = await loadApiServiceClass();
    const service = new ApiService();
    const uploadResult = await service.uploadImageWithStatus(new File(['hello'], 'a.png', { type: 'image/png' }));

    assert.equal(uploadResult.url, 'https://example.com/api/images/diary%2Fjson-fallback.png');
    assert.equal(uploadResult.storage, 'r2');
    assert.match(uploadResult.warning ?? '', /缺少图片文件/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('local sync status tracks pending create update and delete operations', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_local', 'true');

  const ApiService = await loadApiServiceClass();
  const service = new ApiService();

  await service.loginAdmin('admin123');
  const createdEntry = await service.createEntry({
    title: '待同步新建',
    content: '新内容',
  });

  let syncStatus = await service.getLocalSyncStatus();
  assert.equal(syncStatus.pendingCreates, 1);
  assert.equal(syncStatus.totalPending, 1);

  await service.markLocalEntriesSynced([createdEntry.entry_uuid!], '2026-04-18T12:00:00.000Z');
  await service.updateEntry(createdEntry.id!, {
    content: '同步后又修改',
  });

  syncStatus = await service.getLocalSyncStatus();
  assert.equal(syncStatus.pendingUpdates, 1);

  await service.deleteEntry(createdEntry.id!);

  syncStatus = await service.getLocalSyncStatus();
  assert.equal(syncStatus.pendingDeletes, 1);
  assert.equal(syncStatus.visibleEntries >= 0, true);

  const pendingEntries = await service.getPendingLocalSyncEntries();
  assert.equal(pendingEntries.some((entry) => entry.sync_state === 'pending_delete'), true);
});

test('remote sync config is stored locally for apk sync', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_local', 'true');
  localStorageMock.setItem('diary-app-authenticated', 'true');
  localStorageMock.setItem('diary-admin-authenticated', 'true');

  const ApiService = await loadApiServiceClass();
  const service = new ApiService();

  await service.saveRemoteSyncConfig({
    baseUrl: 'https://diary.example.com/',
    syncToken: ' remote-sync-token ',
  });

  const config = await service.getRemoteSyncConfig();
  assert.equal(config.baseUrl, 'https://diary.example.com');
  assert.equal(config.syncToken, 'remote-sync-token');
});

test('bindRemoteAdmin verifies remote credentials and switches local admin auth to the bound remote password', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_local', 'true');

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;

    if (url === 'https://diary.example.com/api/auth/login') {
      const payload = JSON.parse(String(init?.body ?? '{}')) as { password?: string; scope?: string };
      assert.equal(payload.scope, 'admin');
      assert.equal(payload.password, 'remote-admin-pass');

      return jsonResponse({
        success: true,
        data: {
          isAuthenticated: true,
          isAdminAuthenticated: true,
        },
      });
    }

    if (url === 'https://diary.example.com/api/sync') {
      const payload = JSON.parse(String(init?.body ?? '{}')) as { entries?: unknown[] };
      assert.equal(new Headers(init?.headers).get('X-Sync-Token'), 'remote-sync-token');
      assert.deepEqual(payload.entries, []);

      return jsonResponse({
        success: true,
        data: {
          entries: [],
          pushedCount: 0,
          deletedCount: 0,
          syncedAt: '2026-04-19T00:00:00.000Z',
        },
      });
    }

    throw new Error(`Unexpected fetch URL in test: ${url}`);
  };

  try {
    const ApiService = await loadApiServiceClass();
    const service = new ApiService();

    await service.bindRemoteAdmin({
      baseUrl: 'https://diary.example.com/',
      syncToken: 'remote-sync-token',
      adminPassword: 'remote-admin-pass',
      syncLocalEntries: false,
    });

    let session = await service.getSession();
    assert.equal(session.isAdminAuthenticated, true);

    await service.logout();

    await assert.rejects(
      service.loginAdmin('admin123'),
      /管理员密码错误/
    );

    session = await service.loginAdmin('remote-admin-pass');
    assert.equal(session.isAdminAuthenticated, true);

    const profile = await service.getAdminAccessProfile();
    assert.equal(profile.mode, 'local');
    assert.equal(profile.remoteBound, true);
    assert.equal(profile.requiresPassword, true);
    assert.equal(profile.remoteSyncBaseUrl, 'https://diary.example.com');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('bindRemoteAdmin accepts short remote passwords that already exist on the server', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_local', 'true');

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;

    if (url === 'https://diary.example.com/api/auth/login') {
      const payload = JSON.parse(String(init?.body ?? '{}')) as { password?: string; scope?: string };
      assert.equal(payload.scope, 'admin');
      assert.equal(payload.password, '12345');

      return jsonResponse({
        success: true,
        data: {
          isAuthenticated: true,
          isAdminAuthenticated: true,
        },
      });
    }

    if (url === 'https://diary.example.com/api/sync') {
      return jsonResponse({
        success: true,
        data: {
          entries: [],
          pushedCount: 0,
          deletedCount: 0,
          syncedAt: '2026-04-19T00:00:00.000Z',
        },
      });
    }

    throw new Error(`Unexpected fetch URL in test: ${url}`);
  };

  try {
    const ApiService = await loadApiServiceClass();
    const service = new ApiService();

    await service.bindRemoteAdmin({
      baseUrl: 'https://diary.example.com/',
      syncToken: 'remote-sync-token',
      adminPassword: '12345',
      syncLocalEntries: false,
    });

    await service.logout();

    const session = await service.loginAdmin('12345');
    assert.equal(session.isAdminAuthenticated, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('native upgrade clears legacy local admin password and stale admin session without touching sync config', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_local', 'true');
  localStorageMock.setItem('diary-admin-authenticated', 'true');
  localStorageMock.setItem('diary-app-authenticated', 'true');
  localStorageMock.setItem('diary_app_settings', JSON.stringify({
    admin_password: 'legacy-local-pass',
    remote_sync_base_url: 'https://diary.example.com',
    remote_sync_token: 'saved-sync-token',
  }));

  const originalWindow = globalThis.window;
  globalThis.window = {
    location: {
      protocol: 'capacitor:',
    },
  } as Window & typeof globalThis;

  try {
    const ApiService = await loadApiServiceClass();
    const service = new ApiService();

    const session = await service.getSession();
    assert.deepEqual(session, {
      isAuthenticated: false,
      isAdminAuthenticated: false,
    });

    const profile = await service.getAdminAccessProfile();
    assert.equal(profile.mode, 'local');
    assert.equal(profile.remoteBound, false);
    assert.equal(profile.requiresPassword, false);
    assert.equal(profile.remoteSyncConfigured, true);
    assert.equal(profile.remoteSyncBaseUrl, 'https://diary.example.com');

    const storedSettings = JSON.parse(localStorageMock.getItem('diary_app_settings') ?? '{}') as Record<string, string>;
    assert.equal(storedSettings.admin_password, undefined);
    assert.equal(storedSettings.remote_sync_base_url, 'https://diary.example.com');
    assert.equal(storedSettings.remote_sync_token, 'saved-sync-token');
  } finally {
    globalThis.window = originalWindow;
  }
});

test('native release build locks data mode to local even when a legacy remote flag exists', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_remote', 'true');

  const originalWindow = globalThis.window;
  globalThis.window = {
    location: {
      protocol: 'capacitor:',
    },
  } as Window & typeof globalThis;

  try {
    const ApiService = await loadApiServiceClass();
    const service = new ApiService();

    assert.equal(service.canToggleDataMode(), false);
    assert.equal(service.getCurrentMode(), 'local');
  } finally {
    globalThis.window = originalWindow;
  }
});

test('syncLocalEntriesToRemote pushes pending local entries and merges incremental remote changes', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_local', 'true');

  let expectedEntryUuid = '';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;

    if (url !== 'https://diary.example.com/api/sync') {
      throw new Error(`Unexpected fetch URL in test: ${url}`);
    }

    const parsedBody = JSON.parse(String(init?.body ?? '{}')) as {
      lastSyncedAt?: string;
      entries?: Array<{ title?: string; sync_state?: string; entry_uuid?: string }>;
    };
    assert.equal(new Headers(init?.headers).get('X-Sync-Token'), 'remote-sync-token');
    assert.equal(Array.isArray(parsedBody.entries), true);
    assert.equal(parsedBody.entries?.length, 1);
    assert.equal(parsedBody.entries?.[0]?.title, '待同步日记');
    assert.equal(parsedBody.entries?.[0]?.sync_state, 'pending_create');
    assert.equal(parsedBody.entries?.[0]?.entry_uuid, expectedEntryUuid);
    assert.equal(parsedBody.lastSyncedAt, undefined);

    return jsonResponse({
      success: true,
      data: {
        pushedCount: 1,
        deletedCount: 0,
        confirmedEntryUuids: [expectedEntryUuid],
        syncedAt: '2026-04-18T13:00:00.000Z',
        entries: [
          {
            id: 101,
            entry_uuid: 'remote-entry-101',
            title: '云端已有',
            content: '远端内容',
            content_type: 'markdown',
            mood: 'neutral',
            weather: 'unknown',
            images: [],
            tags: [],
            hidden: false,
            created_at: '2026-04-18T09:00:00.000Z',
            updated_at: '2026-04-18T09:00:00.000Z',
          },
          {
            id: 102,
            title: '待同步日记',
            content: '本地内容',
            content_type: 'markdown',
            mood: 'neutral',
            weather: 'unknown',
            images: [],
            tags: [],
            hidden: false,
            entry_uuid: expectedEntryUuid,
            created_at: '2026-04-18T12:00:00.000Z',
            updated_at: '2026-04-18T12:00:00.000Z',
          },
        ],
      },
    });
  };

  try {
    const ApiService = await loadApiServiceClass();
    const service = new ApiService();
    service.setDefaultDataEnabled(false);
    service.clearLocalData();
    await service.loginAdmin('admin123');
    await service.saveRemoteSyncConfig({
      baseUrl: 'https://diary.example.com',
      syncToken: 'remote-sync-token',
    });
    const createdEntry = await service.createEntry({
      title: '待同步日记',
      content: '本地内容',
    });
    expectedEntryUuid = createdEntry.entry_uuid ?? '';

    const syncResult = await service.syncLocalEntriesToRemote();
    assert.equal(syncResult.pushedCount, 1);
    assert.equal(syncResult.pendingCount, 1);
    assert.equal(syncResult.remoteCount, 2);

    const allEntries = await service.getAllEntries();
    assert.equal(allEntries.length, 2);
    assert.equal(allEntries[0]?.title, '待同步日记');
    assert.equal(allEntries[0]?.entry_uuid, expectedEntryUuid);
    assert.equal(allEntries[1]?.title, '云端已有');

    const syncStatus = await service.getLocalSyncStatus();
    assert.equal(syncStatus.totalPending, 0);
    assert.equal(syncStatus.lastSyncedAt, '2026-04-18T13:00:00.000Z');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('syncLocalEntriesToRemote keeps local pending entries when the remote side does not confirm them', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_local', 'true');

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;

    if (url !== 'https://diary.example.com/api/sync') {
      throw new Error(`Unexpected fetch URL in test: ${url}`);
    }

    const parsedBody = JSON.parse(String(init?.body ?? '{}')) as {
      entries?: Array<{ title?: string; entry_uuid?: string }>;
    };
    assert.equal(parsedBody.entries?.length, 1);

    return jsonResponse({
      success: true,
      data: {
        pushedCount: 0,
        deletedCount: 0,
        confirmedEntryUuids: [],
        syncedAt: '2026-04-18T13:30:00.000Z',
        entries: [
          {
            id: 201,
            entry_uuid: 'remote-entry-201',
            title: '远端新增',
            content: '远端内容',
            content_type: 'markdown',
            mood: 'neutral',
            weather: 'unknown',
            images: [],
            tags: [],
            hidden: false,
            created_at: '2026-04-18T09:30:00.000Z',
            updated_at: '2026-04-18T09:30:00.000Z',
          },
        ],
      },
    });
  };

  try {
    const ApiService = await loadApiServiceClass();
    const service = new ApiService();
    service.setDefaultDataEnabled(false);
    service.clearLocalData();
    await service.loginAdmin('admin123');
    await service.saveRemoteSyncConfig({
      baseUrl: 'https://diary.example.com',
      syncToken: 'remote-sync-token',
    });

    const createdEntry = await service.createEntry({
      title: '仍待确认',
      content: '本地内容',
    });

    const syncResult = await service.syncLocalEntriesToRemote();
    assert.equal(syncResult.pushedCount, 0);
    assert.equal(syncResult.remoteCount, 1);

    const entries = await service.getAllEntries();
    assert.equal(entries.length, 2);
    assert.equal(entries.some((entry) => entry.entry_uuid === createdEntry.entry_uuid), true);

    const pendingEntries = await service.getPendingLocalSyncEntries();
    assert.equal(pendingEntries.length, 1);
    assert.equal(pendingEntries[0]?.entry_uuid, createdEntry.entry_uuid);

    const syncStatus = await service.getLocalSyncStatus();
    assert.equal(syncStatus.totalPending, 1);
    assert.equal(syncStatus.lastSyncedAt, '2026-04-18T13:30:00.000Z');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('bindRemoteAdmin with remote-only mode replaces local snapshot with remote entries', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_local', 'true');

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;

    if (url === 'https://diary.example.com/api/auth/login') {
      return jsonResponse({
        success: true,
        data: {
          isAuthenticated: true,
          isAdminAuthenticated: true,
        },
      });
    }

    if (url === 'https://diary.example.com/api/sync') {
      const payload = JSON.parse(String(init?.body ?? '{}')) as { entries?: unknown[] };
      assert.deepEqual(payload.entries, []);

      return jsonResponse({
        success: true,
        data: {
          pushedCount: 0,
          deletedCount: 0,
          syncedAt: '2026-04-19T02:00:00.000Z',
          entries: [
            {
              id: 201,
              entry_uuid: 'remote-only-entry',
              title: '远程内容',
              content: '仅保留远程',
              content_type: 'markdown',
              mood: 'neutral',
              weather: 'unknown',
              images: [],
              tags: [],
              hidden: false,
              created_at: '2026-04-19T01:00:00.000Z',
              updated_at: '2026-04-19T01:00:00.000Z',
            },
          ],
        },
      });
    }

    throw new Error(`Unexpected fetch URL in test: ${url}`);
  };

  try {
    const ApiService = await loadApiServiceClass();
    const service = new ApiService();

    await service.bindRemoteAdmin({
      baseUrl: 'https://diary.example.com/',
      syncToken: 'remote-sync-token',
      adminPassword: 'remote-admin-pass',
      syncLocalEntries: false,
    });

    const allEntries = await service.getAllEntries();
    assert.deepEqual(allEntries.map((entry) => entry.entry_uuid), ['remote-only-entry']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('bindRemoteAdmin with local sync mode uploads existing local entries before applying remote snapshot', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_local', 'true');

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;

    if (url === 'https://diary.example.com/api/auth/login') {
      return jsonResponse({
        success: true,
        data: {
          isAuthenticated: true,
          isAdminAuthenticated: true,
        },
      });
    }

    if (url === 'https://diary.example.com/api/sync') {
      const payload = JSON.parse(String(init?.body ?? '{}')) as { entries?: Array<{ entry_uuid?: string }> };
      assert.equal(Array.isArray(payload.entries), true);
      assert.equal((payload.entries?.length ?? 0) > 0, true);
      assert.equal(payload.entries?.some((entry) => entry.entry_uuid === 'demo-entry-1'), true);

      return jsonResponse({
        success: true,
        data: {
          pushedCount: payload.entries?.length ?? 0,
          deletedCount: 0,
          syncedAt: '2026-04-19T03:00:00.000Z',
          entries: [
            {
              id: 301,
              entry_uuid: 'remote-merged-entry',
              title: '远程已有',
              content: '远程内容',
              content_type: 'markdown',
              mood: 'neutral',
              weather: 'unknown',
              images: [],
              tags: [],
              hidden: false,
              created_at: '2026-04-19T02:00:00.000Z',
              updated_at: '2026-04-19T02:00:00.000Z',
            },
            {
              id: 1,
              entry_uuid: 'demo-entry-1',
              title: '公园散步的美好时光',
              content: '今天天气很好，和朋友一起去**公园散步**，心情特别愉快。\n\n看到了很多美丽的花朵 🌸，还遇到了可爱的小狗 🐕。和朋友聊了很多有趣的话题。\n\n> 生活中的小美好总是让人感到幸福',
              content_type: 'markdown',
              mood: 'happy',
              weather: 'sunny',
              images: [],
              tags: ['散步', '朋友', '公园'],
              hidden: false,
              created_at: '2026-04-18T00:00:00.000Z',
              updated_at: '2026-04-18T00:00:00.000Z',
            },
          ],
        },
      });
    }

    throw new Error(`Unexpected fetch URL in test: ${url}`);
  };

  try {
    const ApiService = await loadApiServiceClass();
    const service = new ApiService();

    await service.bindRemoteAdmin({
      baseUrl: 'https://diary.example.com/',
      syncToken: 'remote-sync-token',
      adminPassword: 'remote-admin-pass',
      syncLocalEntries: true,
    });

    const allEntries = await service.getAllEntries();
    assert.deepEqual(allEntries.map((entry) => entry.entry_uuid), ['remote-merged-entry', 'demo-entry-1']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('bindRemoteAdmin does not persist local binding when sync token is invalid', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_local', 'true');

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;

    if (url === 'https://diary.example.com/api/auth/login') {
      return jsonResponse({
        success: true,
        data: {
          isAuthenticated: true,
          isAdminAuthenticated: true,
        },
      });
    }

    if (url === 'https://diary.example.com/api/sync') {
      return jsonResponse({
        success: false,
        error: '同步令牌错误',
      }, 401);
    }

    throw new Error(`Unexpected fetch URL in test: ${url}`);
  };

  try {
    const ApiService = await loadApiServiceClass();
    const service = new ApiService();

    await assert.rejects(
      service.bindRemoteAdmin({
        baseUrl: 'https://diary.example.com/',
        syncToken: 'invalid-sync-token',
        adminPassword: 'remote-admin-pass',
        syncLocalEntries: false,
      }),
      /同步令牌错误/
    );

    const profile = await service.getAdminAccessProfile();
    assert.equal(profile.remoteBound, false);
    assert.equal(profile.requiresPassword, true);
    assert.equal(profile.remoteSyncConfigured, false);

    const session = await service.getSession();
    assert.equal(session.isAdminAuthenticated, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
