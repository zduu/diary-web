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
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;

    if (url.endsWith('/api/uploads/image')) {
      return jsonResponse({
        success: false,
        error: '缺少图片文件，请检查上传表单是否包含图片文件',
      }, 400);
    }

    throw new Error(`Unexpected fetch URL in test: ${url}`);
  };

  try {
    const ApiService = await loadApiServiceClass();
    const service = new ApiService();
    const uploadResult = await service.uploadImageWithStatus(new File(['hello'], 'a.png', { type: 'image/png' }));

    assert.match(uploadResult.url, /^data:image\/png;base64,/);
    assert.equal(uploadResult.storage, 'embedded');
    assert.match(uploadResult.warning ?? '', /缺少图片文件/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
