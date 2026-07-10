import test from 'node:test';
import assert from 'node:assert/strict';

type SessionState = {
  isAuthenticated: boolean;
  isAdminAuthenticated: boolean;
};

class MockLocalStorage {
  private readonly store = new Map<string, string>();
  failGet = false;
  failRemoveKeys = new Set<string>();
  failSetKeys = new Set<string>();

  clear() {
    this.store.clear();
    this.failGet = false;
    this.failRemoveKeys.clear();
    this.failSetKeys.clear();
  }

  getItem(key: string) {
    if (this.failGet) {
      throw new DOMException('Blocked', 'SecurityError');
    }

    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string) {
    if (this.failRemoveKeys.has(key)) {
      throw new DOMException('Blocked', 'SecurityError');
    }

    this.store.delete(key);
  }

  setItem(key: string, value: string) {
    if (this.failSetKeys.has(key)) {
      throw new DOMException('Storage is full', 'QuotaExceededError');
    }

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

async function loadRemoteApiClientModule() {
  return import('../src/services/remoteApiClient.ts');
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

async function flushPromises(iterations = 10) {
  for (let index = 0; index < iterations; index += 1) {
    await Promise.resolve();
  }
}

test('remote api client rejects non-json success responses with request context', async () => {
  const { ApiRequestError, RemoteApiClient } = await loadRemoteApiClientModule();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => new Response('ok', {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
    },
  });

  try {
    const client = new RemoteApiClient();
    await assert.rejects(
      client.request('/settings/admin'),
      (error) => error instanceof ApiRequestError
        && error.status === 200
        && /有效的 JSON/.test(error.message)
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('remote api client aborts stalled requests with a readable timeout error', async (t) => {
  const { ApiRequestError, RemoteApiClient } = await loadRemoteApiClientModule();
  const originalFetch = globalThis.fetch;
  t.mock.timers.enable({ apis: ['setTimeout'] });

  let observedSignal: AbortSignal | undefined;
  let abortEvents = 0;

  globalThis.fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
    observedSignal = init?.signal ?? undefined;
    observedSignal?.addEventListener('abort', () => {
      abortEvents += 1;
      reject(new DOMException('Request aborted', 'AbortError'));
    }, { once: true });
  });

  try {
    const client = new RemoteApiClient({ requestTimeoutMs: 1000 });
    const request = client.request('/settings/admin');

    await Promise.resolve();
    assert.equal(observedSignal instanceof AbortSignal, true);
    assert.equal(observedSignal?.aborted, false);

    t.mock.timers.tick(1000);

    await assert.rejects(
      request,
      (error) => error instanceof ApiRequestError
        && error.status === 0
        && /远程请求超时/.test(error.message)
    );
    assert.equal(observedSignal?.aborted, true);
    assert.equal(abortEvents, 1);
  } finally {
    globalThis.fetch = originalFetch;
    t.mock.timers.reset();
  }
});

test('remote api client aborts stalled 401 session refreshes and emits signed out', async (t) => {
  const { ApiRequestError, RemoteApiClient } = await loadRemoteApiClientModule();
  const originalFetch = globalThis.fetch;
  t.mock.timers.enable({ apis: ['setTimeout'] });

  const events: SessionState[] = [];
  let attempts = 0;
  let refreshSignal: AbortSignal | undefined;

  globalThis.fetch = async (_input, init) => {
    attempts += 1;

    if (attempts === 1) {
      return jsonResponse({
        success: false,
        error: '访问被拒绝',
      }, 401);
    }

    return new Promise<Response>((_resolve, reject) => {
      refreshSignal = init?.signal ?? undefined;
      refreshSignal?.addEventListener('abort', () => {
        reject(new DOMException('Request aborted', 'AbortError'));
      }, { once: true });
    });
  };

  try {
    const client = new RemoteApiClient({
      requestTimeoutMs: 1000,
      onSessionChange: (session) => {
        events.push(session);
      },
    });
    const request = client.request('/stats');
    const rejection = assert.rejects(
      request,
      (error) => error instanceof ApiRequestError
        && error.status === 401
        && error.message === '访问被拒绝'
    );

    for (let index = 0; index < 10 && !refreshSignal; index += 1) {
      await Promise.resolve();
    }

    assert.equal(refreshSignal instanceof AbortSignal, true);
    assert.equal(refreshSignal?.aborted, false);

    t.mock.timers.tick(1000);

    await rejection;
    assert.equal(refreshSignal?.aborted, true);
    assert.deepEqual(events, [
      { isAuthenticated: false, isAdminAuthenticated: false },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    t.mock.timers.reset();
  }
});

test('remote api client ignores malformed error fields on non-ok json responses', async () => {
  const { ApiRequestError, RemoteApiClient } = await loadRemoteApiClientModule();
  const originalFetch = globalThis.fetch;
  let attempts = 0;

  globalThis.fetch = async () => {
    attempts += 1;

    if (attempts === 1) {
      return jsonResponse({
        success: false,
        error: { detail: 'nested error should not be used' },
        message: '可读错误',
      }, 418);
    }

    return jsonResponse({
      success: false,
      error: ['not', 'a', 'message'],
    }, 502);
  };

  try {
    const client = new RemoteApiClient();

    await assert.rejects(
      client.request('/settings/admin'),
      (error) => error instanceof ApiRequestError
        && error.status === 418
        && error.message === '可读错误'
    );
    await assert.rejects(
      client.request('/settings/admin'),
      (error) => error instanceof ApiRequestError
        && error.status === 502
        && error.message === 'HTTP error! status: 502'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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

test('remote session responses reject invalid success payload shapes without emitting changes', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_remote', 'true');

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;

    if (url.endsWith('/api/auth/session')) {
      return jsonResponse({
        success: true,
        data: {
          isAuthenticated: 'yes',
          isAdminAuthenticated: false,
        },
      });
    }

    if (url.endsWith('/api/auth/login')) {
      return jsonResponse({
        success: true,
        data: {
          isAuthenticated: true,
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
      () => service.getSession(),
      /会话状态响应格式无效/
    );
    await assert.rejects(
      () => service.loginApp('app-password'),
      /登录响应格式无效/
    );

    assert.deepEqual(events, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
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

test('api service emits signed-out session when a 401 refresh returns malformed session data', async () => {
  localStorageMock.clear();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;

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
          isAuthenticated: 'still-bad',
          isAdminAuthenticated: true,
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
      () => service.getStats(),
      /访问被拒绝/
    );

    assert.deepEqual(events, [
      { isAuthenticated: false, isAdminAuthenticated: false },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('api service emits signed-out session when a 401 refresh returns non-boolean success flag', async () => {
  localStorageMock.clear();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;

    if (url.endsWith('/api/stats')) {
      return jsonResponse({
        success: false,
        error: '访问被拒绝',
      }, 401);
    }

    if (url.endsWith('/api/auth/session')) {
      return jsonResponse({
        success: 'true',
        data: {
          isAuthenticated: true,
          isAdminAuthenticated: true,
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
      () => service.getStats(),
      /访问被拒绝/
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

test('mock mode rejects invalid entry writes to match server rules', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_local', 'true');
  localStorageMock.setItem('diary-app-authenticated', 'true');
  localStorageMock.setItem('diary-admin-authenticated', 'true');

  const {
    MAX_ENTRY_TAGS_COUNT,
    MAX_ENTRY_TITLE_LENGTH,
  } = await import('../src/utils/entryTextValidation.ts');
  const ApiService = await loadApiServiceClass();
  const service = new ApiService();

  await assert.rejects(
    () => service.createEntry({
      title: 'x'.repeat(MAX_ENTRY_TITLE_LENGTH + 1),
      content: 'valid-content',
    }),
    /标题长度不能超过/
  );

  await assert.rejects(
    () => service.createEntry({
      title: '图片异常',
      content: 'valid-content',
      images: ['javascript:alert(1)'],
    }),
    /图片列表格式无效/
  );

  await assert.rejects(
    () => service.createEntry({
      title: '标签异常',
      content: 'valid-content',
      tags: Array.from({ length: MAX_ENTRY_TAGS_COUNT + 1 }, (_, index) => `tag-${index}`),
    }),
    /标签列表格式无效/
  );

  await assert.rejects(
    () => service.createEntry({
      title: '位置异常',
      content: 'valid-content',
      location: {
        latitude: 91,
        longitude: 121.4,
      },
    }),
    /位置信息格式无效/
  );

  const createdEntry = await service.createEntry({
    title: '有效内容',
    content: 'valid-content',
  });

  await assert.rejects(
    () => service.updateEntry(createdEntry.id!, {
      content: '   ',
    }),
    /日记内容不能为空/
  );

  const entryCountBeforeImport = (await service.getAllEntries()).length;

  await assert.rejects(
    () => service.batchImportEntries([
      {
        title: '不应写入的导入',
        content: 'valid-content',
      },
      {
        title: '导入图片异常',
        content: 'valid-content',
        images: ['javascript:alert(1)'],
      },
    ]),
    /第 2 条导入数据的图片列表无效/
  );

  const entriesAfterImport = await service.getAllEntries();
  assert.equal(entriesAfterImport.length, entryCountBeforeImport);
  assert.equal(entriesAfterImport.some((entry) => entry.title === '不应写入的导入'), false);

  await assert.rejects(
    () => service.batchUpdateEntries([
      {
        ...createdEntry,
        title: '不应落盘的批量更新',
        content: 'valid-content',
      },
      {
        ...createdEntry,
        id: createdEntry.id! + 10000,
        title: '不存在的批量更新目标',
        content: 'valid-content',
      },
    ]),
    /第 2 条更新目标不存在/
  );

  const entryAfterBatchUpdate = await service.getEntry(createdEntry.id!);
  assert.equal(entryAfterBatchUpdate?.title, '有效内容');
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
    {
      id: 3,
      title: 'sqlite timestamp',
      content: 'valid sqlite timestamp',
      content_type: 'markdown',
      mood: 'neutral',
      weather: 'sunny',
      images: [],
      location: null,
      tags: [],
      hidden: false,
      created_at: '2026-04-09 09:00:00',
      updated_at: '2026-04-09 09:00:00',
    },
  ]));

  const ApiService = await loadApiServiceClass();
  const service = new ApiService();
  const stats = await service.getStats();

  assert.equal(stats.total_entries, 3);
  assert.equal(stats.total_days_with_entries, 1);
  assert.equal(Number.isInteger(stats.consecutive_days), true);
  assert.equal(stats.latest_entry_date, '2026-04-09 09:00:00');
  assert.equal(stats.first_entry_date, '2026-04-09T08:00:00.000Z');
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

test('remote stats and diagnostics responses reject invalid success payload shapes', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_remote', 'true');

  const validStats = {
    consecutive_days: 2,
    total_days_with_entries: 3,
    total_entries: 4,
    latest_entry_date: '2026-04-10 08:00:00',
    first_entry_date: '2026-04-08T08:00:00.000Z',
    current_streak_start: null,
  };
  const originalFetch = globalThis.fetch;
  let statsAttempts = 0;

  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;

    if (url.endsWith('/api/stats')) {
      statsAttempts += 1;
      return jsonResponse({
        success: true,
        data: statsAttempts === 1
          ? {
            ...validStats,
            total_entries: '4',
          }
          : validStats,
      });
    }

    if (url.endsWith('/api/diagnostics/r2')) {
      return jsonResponse({
        success: true,
        data: {
          bucketBindingPresent: true,
          canWrite: true,
          canRead: true,
          canDelete: true,
          readBackMatches: 'yes',
          testedKey: null,
          keyPrefix: 'diary/',
          message: 'ok',
        },
      });
    }

    throw new Error(`Unexpected fetch URL in test: ${url}`);
  };

  try {
    const ApiService = await loadApiServiceClass();
    const service = new ApiService();

    await assert.rejects(
      () => service.getStats(),
      /统计响应格式无效/
    );

    const stats = await service.getStats();
    assert.deepEqual(stats, validStats);

    await assert.rejects(
      () => service.runR2SelfCheck(),
      /R2 自检响应格式无效/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('remote success envelopes ignore malformed error fields and use readable fallbacks', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_remote', 'true');

  const originalFetch = globalThis.fetch;
  let statsAttempts = 0;
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;

    if (url.endsWith('/api/stats')) {
      statsAttempts += 1;
      return jsonResponse(statsAttempts === 1
        ? {
          success: false,
          error: { detail: 'nested error should not be used' },
          message: '统计暂不可用',
        }
        : {
          success: false,
          error: ['not', 'a', 'message'],
        });
    }

    throw new Error(`Unexpected fetch URL in test: ${url}`);
  };

  try {
    const ApiService = await loadApiServiceClass();
    const service = new ApiService();

    await assert.rejects(
      () => service.getStats(),
      /统计暂不可用/
    );
    await assert.rejects(
      () => service.getStats(),
      /获取统计信息失败/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
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

test('remote settings responses reject invalid success payload shapes without caching them', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_remote', 'true');

  const validPublicSettings = {
    passwordProtectionEnabled: false,
    readingDeskEnabled: true,
    quickFiltersEnabled: true,
    exportEnabled: true,
    archiveViewEnabled: true,
    welcomePageEnabled: true,
    recommendationsEnabled: true,
    browseStatusEnabled: true,
    deviceStatusEnabled: true,
  };
  const originalFetch = globalThis.fetch;
  let publicSettingsAttempts = 0;
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;

    if (url.endsWith('/api/settings')) {
      publicSettingsAttempts += 1;
      return jsonResponse({
        success: true,
        data: publicSettingsAttempts === 1
          ? {
            ...validPublicSettings,
            quickFiltersEnabled: 'true',
          }
          : validPublicSettings,
      });
    }

    if (url.endsWith('/api/settings/admin')) {
      return jsonResponse({
        success: true,
        data: {
          ...validPublicSettings,
          adminPasswordConfigured: true,
          appPasswordConfigured: false,
          syncAccessTokenConfigured: 'no',
        },
      });
    }

    throw new Error(`Unexpected fetch URL in test: ${url}`);
  };

  try {
    const ApiService = await loadApiServiceClass();
    const service = new ApiService();

    await assert.rejects(
      () => service.getPublicSettings(),
      /公开设置响应格式无效/
    );

    const settings = await service.getPublicSettings();
    assert.deepEqual(settings, validPublicSettings);
    assert.equal(publicSettingsAttempts, 2);

    await assert.rejects(
      () => service.getAdminSettings(),
      /管理员设置响应格式无效/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('remote getSetting rejects invalid success payload shapes', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_remote', 'true');

  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;

    if (url.endsWith('/api/settings/app_password_enabled')) {
      attempts += 1;
      return jsonResponse({
        success: true,
        data: attempts === 1
          ? {}
          : {
            app_password_enabled: true,
          },
      });
    }

    throw new Error(`Unexpected fetch URL in test: ${url}`);
  };

  try {
    const ApiService = await loadApiServiceClass();
    const service = new ApiService();

    await assert.rejects(
      () => service.getSetting('app_password_enabled'),
      /设置响应格式无效/
    );

    assert.equal(await service.getSetting('app_password_enabled'), 'true');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('remote success envelopes require boolean true success flags', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_remote', 'true');

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;

    if (url.endsWith('/api/settings/app_password_enabled')) {
      if (init?.method === 'PUT') {
        return jsonResponse({
          success: 'true',
          message: '设置更新成功',
        });
      }

      return jsonResponse({
        success: 'true',
        data: {
          app_password_enabled: 'true',
        },
      });
    }

    throw new Error(`Unexpected fetch URL in test: ${url}`);
  };

  try {
    const ApiService = await loadApiServiceClass();
    const service = new ApiService();

    await assert.rejects(
      () => service.getSetting('app_password_enabled'),
      /获取设置失败/
    );
    await assert.rejects(
      () => service.setSetting('app_password_enabled', 'true'),
      /设置更新失败/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
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

test('remote image upload rejects unsafe upload urls before using fallback responses', async () => {
  localStorageMock.clear();

  const originalFetch = globalThis.fetch;
  let uploadAttempts = 0;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;

    if (url.endsWith('/api/uploads/image')) {
      uploadAttempts += 1;

      if (uploadAttempts === 1) {
        return jsonResponse({
          success: true,
          data: {
            url: 'javascript:alert(1)',
          },
        });
      }

      const parsedBody = init?.body ? JSON.parse(String(init.body)) as { dataUrl?: string } : {};
      assert.equal(typeof parsedBody.dataUrl, 'string');

      return jsonResponse({
        success: true,
        data: {
          url: '/api/images/diary%2Fsafe-fallback.png',
        },
      });
    }

    throw new Error(`Unexpected fetch URL in test: ${url}`);
  };

  try {
    const ApiService = await loadApiServiceClass();
    const service = new ApiService();
    const uploadResult = await service.uploadImageWithStatus(new File(['hello'], 'a.png', { type: 'image/png' }));

    assert.equal(uploadAttempts, 2);
    assert.equal(uploadResult.url, '/api/images/diary%2Fsafe-fallback.png');
    assert.equal(uploadResult.storage, 'r2');
    assert.match(uploadResult.warning ?? '', /图片上传响应无效/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('remote image upload treats case-insensitive data image urls as embedded storage', async () => {
  localStorageMock.clear();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;

    if (url.endsWith('/api/uploads/image')) {
      return jsonResponse({
        success: true,
        data: {
          url: 'data:IMAGE/PNG;base64,aGVsbG8=',
        },
      });
    }

    throw new Error(`Unexpected fetch URL in test: ${url}`);
  };

  try {
    const ApiService = await loadApiServiceClass();
    const service = new ApiService();
    const uploadResult = await service.uploadImageWithStatus(new File(['hello'], 'a.png', { type: 'image/png' }));

    assert.equal(uploadResult.url, 'data:IMAGE/PNG;base64,aGVsbG8=');
    assert.equal(uploadResult.storage, 'embedded');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('remote image upload falls back to embedded data urls when all upload responses are malformed', async () => {
  localStorageMock.clear();

  const originalFetch = globalThis.fetch;
  let arrayBufferCalls = 0;

  class CountingFile extends File {
    override async arrayBuffer() {
      arrayBufferCalls += 1;
      return super.arrayBuffer();
    }
  }

  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;

    if (url.endsWith('/api/uploads/image')) {
      return jsonResponse({
        success: true,
        data: {
          url: { href: '/api/images/diary%2Fnot-a-string.png' },
        },
      });
    }

    throw new Error(`Unexpected fetch URL in test: ${url}`);
  };

  try {
    const ApiService = await loadApiServiceClass();
    const service = new ApiService();
    const uploadResult = await service.uploadImageWithStatus(new CountingFile(['hello'], 'a.png', { type: 'image/png' }));

    assert.equal(uploadResult.storage, 'embedded');
    assert.equal(uploadResult.url.startsWith('data:image/png;base64,'), true);
    assert.match(uploadResult.warning ?? '', /图片上传响应无效/);
    assert.equal(arrayBufferCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('remote image upload times out when base64 fallback file reads never settle', async (t) => {
  localStorageMock.clear();
  t.mock.timers.enable({ apis: ['setTimeout'] });

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

  class HangingFile extends File {
    override async arrayBuffer() {
      return new Promise<ArrayBuffer>(() => {});
    }
  }

  try {
    const ApiService = await loadApiServiceClass();
    const service = new ApiService();
    const uploadPromise = service.uploadImageWithStatus(new HangingFile(['hello'], 'a.png', { type: 'image/png' }));
    const rejectionAssertion = assert.rejects(
      uploadPromise,
      /图片读取超时/
    );

    await flushPromises();
    t.mock.timers.tick(15_000);

    await rejectionAssertion;
  } finally {
    globalThis.fetch = originalFetch;
    t.mock.timers.reset();
  }
});

test('remote image upload rejects empty files before embedded fallback', async () => {
  localStorageMock.clear();

  const originalFetch = globalThis.fetch;
  let uploadAttempts = 0;
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;

    if (url.endsWith('/api/uploads/image')) {
      uploadAttempts += 1;
      return jsonResponse({
        success: false,
        error: '图片文件为空',
      }, 400);
    }

    throw new Error(`Unexpected fetch URL in test: ${url}`);
  };

  try {
    const ApiService = await loadApiServiceClass();
    const service = new ApiService();

    await assert.rejects(
      () => service.uploadImageWithStatus(new File([], 'empty.png', { type: 'image/png' })),
      /图片文件为空/
    );
    assert.equal(uploadAttempts, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('local image upload accepts case-insensitive image file media types', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_local', 'true');

  const originalFileReader = globalThis.FileReader;
  class SuccessfulFileReader {
    static readonly LOADING = 1;
    static readonly DONE = 2;

    readyState = SuccessfulFileReader.DONE;
    result: string | ArrayBuffer | null = 'data:IMAGE/PNG;base64,aGVsbG8=';
    error: DOMException | null = null;
    onload: ((this: FileReader, event: ProgressEvent<FileReader>) => unknown) | null = null;
    onerror: ((this: FileReader, event: ProgressEvent<FileReader>) => unknown) | null = null;
    onabort: ((this: FileReader, event: ProgressEvent<FileReader>) => unknown) | null = null;

    abort() {}

    readAsDataURL() {
      queueMicrotask(() => {
        this.onload?.call(
          this as unknown as FileReader,
          {} as ProgressEvent<FileReader>
        );
      });
    }
  }

  globalThis.FileReader = SuccessfulFileReader as unknown as typeof FileReader;

  try {
    const ApiService = await loadApiServiceClass();
    const service = new ApiService();
    await service.loginAdmin('admin123');

    const uploadResult = await service.uploadImageWithStatus(new File(['hello'], 'a.png', { type: 'IMAGE/PNG' }));

    assert.equal(uploadResult.url, 'data:IMAGE/PNG;base64,aGVsbG8=');
    assert.equal(uploadResult.storage, 'embedded');
  } finally {
    globalThis.FileReader = originalFileReader;
  }
});

test('local image upload rejects empty image files before reading', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_local', 'true');

  const ApiService = await loadApiServiceClass();
  const service = new ApiService();
  await service.loginAdmin('admin123');

  await assert.rejects(
    () => service.uploadImageWithStatus(new File([], 'empty.png', { type: 'image/png' })),
    /图片文件为空/
  );
});

test('local image upload rejects non-image data urls returned by FileReader', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_local', 'true');

  const originalFileReader = globalThis.FileReader;
  class HtmlDataFileReader {
    static readonly LOADING = 1;
    static readonly DONE = 2;

    readyState = HtmlDataFileReader.DONE;
    result: string | ArrayBuffer | null = 'data:text/html;base64,PGgxPkJvb208L2gxPg==';
    error: DOMException | null = null;
    onload: ((this: FileReader, event: ProgressEvent<FileReader>) => unknown) | null = null;
    onerror: ((this: FileReader, event: ProgressEvent<FileReader>) => unknown) | null = null;
    onabort: ((this: FileReader, event: ProgressEvent<FileReader>) => unknown) | null = null;

    abort() {}

    readAsDataURL() {
      queueMicrotask(() => {
        this.onload?.call(
          this as unknown as FileReader,
          {} as ProgressEvent<FileReader>
        );
      });
    }
  }

  globalThis.FileReader = HtmlDataFileReader as unknown as typeof FileReader;

  try {
    const ApiService = await loadApiServiceClass();
    const service = new ApiService();
    await service.loginAdmin('admin123');

    await assert.rejects(
      () => service.uploadImageWithStatus(new File(['hello'], 'a.png', { type: 'image/png' })),
      /图片读取失败/
    );
  } finally {
    globalThis.FileReader = originalFileReader;
  }
});

test('local image upload times out when FileReader never settles', async (t) => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_local', 'true');
  t.mock.timers.enable({ apis: ['setTimeout'] });

  const originalFileReader = globalThis.FileReader;
  const readers: HangingFileReader[] = [];

  class HangingFileReader {
    static readonly LOADING = 1;
    static readonly DONE = 2;

    readyState = HangingFileReader.LOADING;
    result: string | ArrayBuffer | null = null;
    error: DOMException | null = null;
    onload: ((this: FileReader, event: ProgressEvent<FileReader>) => unknown) | null = null;
    onerror: ((this: FileReader, event: ProgressEvent<FileReader>) => unknown) | null = null;
    onabort: ((this: FileReader, event: ProgressEvent<FileReader>) => unknown) | null = null;
    abortCalls = 0;

    constructor() {
      readers.push(this);
    }

    abort() {
      this.abortCalls += 1;
      this.readyState = HangingFileReader.DONE;
    }

    readAsDataURL() {
      this.readyState = HangingFileReader.LOADING;
    }
  }

  globalThis.FileReader = HangingFileReader as unknown as typeof FileReader;

  try {
    const ApiService = await loadApiServiceClass();
    const service = new ApiService();
    const loginPromise = service.loginAdmin('admin123');
    t.mock.timers.tick(80);
    await loginPromise;

    const uploadPromise = service.uploadImageWithStatus(new File(['hello'], 'a.png', { type: 'image/png' }));
    const rejectionAssertion = assert.rejects(
      uploadPromise,
      /图片读取超时/
    );

    for (let index = 0; index < 10 && readers.length === 0; index += 1) {
      await flushPromises();
      t.mock.timers.tick(80);
      await flushPromises();
    }

    assert.equal(readers.length, 1);
    t.mock.timers.tick(15_000);

    await rejectionAssertion;
    assert.equal(readers[0]?.abortCalls, 1);
  } finally {
    globalThis.FileReader = originalFileReader;
    t.mock.timers.reset();
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

test('api service rejects invalid entry ids before local or remote mutations', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_local', 'true');

  const ApiService = await loadApiServiceClass();
  const localService = new ApiService();

  await assert.rejects(
    () => localService.updateEntry(Number.NaN, { title: '无效更新' }),
    /日记 ID 无效/
  );
  await assert.rejects(
    () => localService.deleteEntry(0),
    /日记 ID 无效/
  );
  await assert.rejects(
    () => localService.toggleEntryVisibility(-1),
    /日记 ID 无效/
  );

  localStorageMock.clear();
  localStorageMock.setItem('diary_force_remote', 'true');
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return jsonResponse({ success: true, data: null });
  };

  try {
    const remoteService = new ApiService();

    await assert.rejects(
      () => remoteService.getEntry(Number.POSITIVE_INFINITY),
      /日记 ID 无效/
    );
    await assert.rejects(
      () => remoteService.updateEntry(1.5, { title: '无效更新' }),
      /日记 ID 无效/
    );
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('remote diary responses are normalized before reaching the app', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_remote', 'true');

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;

    if (url.endsWith('/api/entries')) {
      return jsonResponse({
        success: true,
        data: [
          {
            id: 1,
            title: '',
            content: 123,
            content_type: 'html',
            mood: null,
            weather: 42,
            images: ['javascript:alert(1)', '/api/images/diary%2Fsafe.png'],
            tags: [' ok ', 123, '', 'ok'],
            hidden: 'false',
            location: {
              latitude: 91,
              longitude: 121.4,
            },
            created_at: '2026-04-12T10:00:00.000Z',
            updated_at: 'not-a-date',
          },
        ],
      });
    }

    throw new Error(`Unexpected fetch URL in test: ${url}`);
  };

  try {
    const ApiService = await loadApiServiceClass();
    const service = new ApiService();
    const entries = await service.getAllEntries();
    const entry = entries[0];

    assert.equal(entry?.title, '无标题');
    assert.equal(entry?.content, '');
    assert.equal(entry?.content_type, 'markdown');
    assert.equal(entry?.mood, 'neutral');
    assert.equal(entry?.weather, 'unknown');
    assert.deepEqual(entry?.images, ['/api/images/diary%2Fsafe.png']);
    assert.deepEqual(entry?.tags, ['ok']);
    assert.equal(entry?.hidden, false);
    assert.equal(entry?.location, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('remote diary responses reject invalid success payload shapes', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_remote', 'true');

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;

    if (url.endsWith('/api/entries')) {
      return jsonResponse({
        success: true,
        data: {},
      });
    }

    if (url.endsWith('/api/entries/1')) {
      return jsonResponse({
        success: true,
        data: 'bad-entry',
      });
    }

    if (url.endsWith('/api/entries/2')) {
      return jsonResponse({
        success: false,
        error: '远端读取失败',
      });
    }

    throw new Error(`Unexpected fetch URL in test: ${url}`);
  };

  try {
    const ApiService = await loadApiServiceClass();
    const service = new ApiService();

    await assert.rejects(
      () => service.getAllEntries(),
      /日记列表响应格式无效/
    );
    await assert.rejects(
      () => service.getEntry(1),
      /日记响应格式无效/
    );
    await assert.rejects(
      () => service.getEntry(2),
      /远端读取失败/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
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

test('remote sync config rejects unsafe or incomplete base urls', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_local', 'true');
  localStorageMock.setItem('diary-app-authenticated', 'true');
  localStorageMock.setItem('diary-admin-authenticated', 'true');

  const ApiService = await loadApiServiceClass();
  const service = new ApiService();

  await service.saveRemoteSyncConfig({
    baseUrl: 'https://diary.example.com/app/?debug=true#section',
    syncToken: ' remote-sync-token ',
  });

  let config = await service.getRemoteSyncConfig();
  assert.equal(config.baseUrl, 'https://diary.example.com/app');
  assert.equal(config.syncToken, 'remote-sync-token');

  await assert.rejects(
    service.saveRemoteSyncConfig({
      baseUrl: '/api',
      syncToken: 'remote-sync-token',
    }),
    /完整的 http\(s\) 地址/
  );
  await assert.rejects(
    service.saveRemoteSyncConfig({
      baseUrl: 'javascript:alert(1)',
      syncToken: 'remote-sync-token',
    }),
    /仅支持 http 或 https/
  );
  await assert.rejects(
    service.saveRemoteSyncConfig({
      baseUrl: 'https://user:pass@diary.example.com',
      syncToken: 'remote-sync-token',
    }),
    /不能包含用户名或密码/
  );

  config = await service.getRemoteSyncConfig();
  assert.equal(config.baseUrl, 'https://diary.example.com/app');
  assert.equal(config.syncToken, 'remote-sync-token');
});

test('bindRemoteAdmin rejects invalid remote base urls before fetching', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_local', 'true');
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return jsonResponse({ success: true });
  };

  try {
    const ApiService = await loadApiServiceClass();
    const service = new ApiService();

    await assert.rejects(
      service.bindRemoteAdmin({
        baseUrl: 'file:///tmp/diary',
        syncToken: 'remote-sync-token',
        adminPassword: 'remote-admin-pass',
        syncLocalEntries: false,
      }),
      /仅支持 http 或 https/
    );

    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('bindRemoteAdmin rejects malformed remote login sessions before binding locally', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_local', 'true');

  const originalFetch = globalThis.fetch;
  let syncCalled = false;
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;

    if (url === 'https://diary.example.com/api/auth/login') {
      return jsonResponse({
        success: true,
        data: {
          isAuthenticated: true,
          isAdminAuthenticated: 'yes',
        },
      });
    }

    if (url === 'https://diary.example.com/api/sync') {
      syncCalled = true;
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

    await assert.rejects(
      service.bindRemoteAdmin({
        baseUrl: 'https://diary.example.com/',
        syncToken: 'remote-sync-token',
        adminPassword: 'remote-admin-pass',
        syncLocalEntries: false,
      }),
      /远程管理员验证响应格式无效/
    );

    assert.equal(syncCalled, false);

    const profile = await service.getAdminAccessProfile();
    assert.equal(profile.remoteBound, false);
    assert.equal(profile.remoteSyncConfigured, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('bindRemoteAdmin rejects non-boolean remote login success flags before binding locally', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_local', 'true');

  const originalFetch = globalThis.fetch;
  let syncCalled = false;
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;

    if (url === 'https://diary.example.com/api/auth/login') {
      return jsonResponse({
        success: 'true',
        data: {
          isAuthenticated: true,
          isAdminAuthenticated: true,
        },
      });
    }

    if (url === 'https://diary.example.com/api/sync') {
      syncCalled = true;
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

    await assert.rejects(
      service.bindRemoteAdmin({
        baseUrl: 'https://diary.example.com/',
        syncToken: 'remote-sync-token',
        adminPassword: 'remote-admin-pass',
        syncLocalEntries: false,
      }),
      /远程管理员验证失败/
    );

    assert.equal(syncCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('bindRemoteAdmin ignores malformed remote login error fields before binding locally', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_local', 'true');

  const originalFetch = globalThis.fetch;
  let syncCalled = false;
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;

    if (url === 'https://diary.example.com/api/auth/login') {
      return jsonResponse({
        success: false,
        error: {
          code: 'INVALID_ADMIN_PASSWORD',
        },
      });
    }

    if (url === 'https://diary.example.com/api/sync') {
      syncCalled = true;
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

    await assert.rejects(
      service.bindRemoteAdmin({
        baseUrl: 'https://diary.example.com/',
        syncToken: 'remote-sync-token',
        adminPassword: 'remote-admin-pass',
        syncLocalEntries: false,
      }),
      /远程管理员验证失败/
    );

    assert.equal(syncCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('bindRemoteAdmin aborts stalled remote credential verification', async (t) => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_local', 'true');
  t.mock.timers.enable({ apis: ['setTimeout'] });

  const originalFetch = globalThis.fetch;
  let observedSignal: AbortSignal | undefined;

  const flushPromises = async () => {
    for (let index = 0; index < 10; index += 1) {
      await Promise.resolve();
    }
  };

  globalThis.fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
    observedSignal = init?.signal ?? undefined;
    observedSignal?.addEventListener('abort', () => {
      reject(new DOMException('Request aborted', 'AbortError'));
    }, { once: true });
  });

  try {
    const ApiService = await loadApiServiceClass();
    const service = new ApiService();
    const binding = service.bindRemoteAdmin({
      baseUrl: 'https://diary.example.com/',
      syncToken: 'remote-sync-token',
      adminPassword: 'remote-admin-pass',
      syncLocalEntries: false,
    });

    await Promise.resolve();
    assert.equal(observedSignal instanceof AbortSignal, true);

    t.mock.timers.tick(15_000);

    await assert.rejects(
      binding,
      /远程管理员验证超时/
    );
    assert.equal(observedSignal?.aborted, true);
  } finally {
    globalThis.fetch = originalFetch;
    t.mock.timers.reset();
  }
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

test('api service tolerates unreadable data mode storage when choosing initial mode', async () => {
  localStorageMock.clear();
  localStorageMock.failGet = true;

  try {
    const ApiService = await loadApiServiceClass();
    const service = new ApiService();

    assert.equal(service.getCurrentMode(), 'remote');
  } finally {
    localStorageMock.clear();
  }
});

test('api service keeps the current mode when remote mode persistence fails', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_local', 'true');
  localStorageMock.failSetKeys.add('diary_force_remote');

  try {
    const ApiService = await loadApiServiceClass();
    const service = new ApiService();

    assert.equal(service.getCurrentMode(), 'local');
    assert.throws(
      () => service.enableRemoteMode(),
      /浏览器无法保存远程模式设置/
    );
    assert.equal(service.getCurrentMode(), 'local');
    assert.equal(localStorageMock.getItem('diary_force_local'), 'true');
    assert.equal(localStorageMock.getItem('diary_force_remote'), null);
  } finally {
    localStorageMock.clear();
  }
});

test('api service keeps local mode when stale local flag cannot be cleared', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_local', 'true');
  localStorageMock.failRemoveKeys.add('diary_force_local');

  try {
    const ApiService = await loadApiServiceClass();
    const service = new ApiService();

    assert.equal(service.getCurrentMode(), 'local');
    assert.throws(
      () => service.enableRemoteMode(),
      /浏览器无法清除本地模式设置/
    );
    assert.equal(service.getCurrentMode(), 'local');
    assert.equal(localStorageMock.getItem('diary_force_local'), 'true');
    assert.equal(localStorageMock.getItem('diary_force_remote'), null);
  } finally {
    localStorageMock.clear();
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
        confirmedEntryUuids: [` ${expectedEntryUuid} `],
        syncedAt: '  2026-04-18T13:00:00.000Z  ',
        entries: [
          {
            id: 101,
            entry_uuid: 'remote-entry-101',
            title: '云端已有',
            content: '远端内容',
            content_type: 'html',
            mood: null,
            weather: 42,
            images: ['javascript:alert(1)', '/api/images/diary%2Fremote.png'],
            tags: [' remote ', 'remote', 123],
            hidden: 'false',
            created_at: ' 2026-04-18T09:00:00.000Z ',
            updated_at: ' 2026-04-18T09:00:00.000Z ',
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
    assert.equal(syncResult.syncedAt, '2026-04-18T13:00:00.000Z');
    assert.deepEqual(syncResult.entries.find((entry) => entry.entry_uuid === 'remote-entry-101')?.images, ['/api/images/diary%2Fremote.png']);
    assert.deepEqual(syncResult.entries.find((entry) => entry.entry_uuid === 'remote-entry-101')?.tags, ['remote']);
    assert.equal(syncResult.entries.find((entry) => entry.entry_uuid === 'remote-entry-101')?.content_type, 'markdown');
    assert.equal(syncResult.entries.find((entry) => entry.entry_uuid === 'remote-entry-101')?.hidden, false);

    const allEntries = await service.getAllEntries();
    assert.equal(allEntries.length, 2);
    assert.equal(allEntries[0]?.title, '待同步日记');
    assert.equal(allEntries[0]?.entry_uuid, expectedEntryUuid);
    assert.equal(allEntries[1]?.title, '云端已有');
    assert.equal(allEntries[1]?.created_at, '2026-04-18T09:00:00.000Z');
    assert.equal(allEntries[1]?.updated_at, '2026-04-18T09:00:00.000Z');
    assert.deepEqual(allEntries[1]?.images, ['/api/images/diary%2Fremote.png']);
    assert.deepEqual(allEntries[1]?.tags, ['remote']);

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

test('syncLocalEntriesToRemote rejects malformed success payloads before mutating local sync state', async () => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_local', 'true');

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;

    if (url !== 'https://diary.example.com/api/sync') {
      throw new Error(`Unexpected fetch URL in test: ${url}`);
    }

    const parsedBody = JSON.parse(String(init?.body ?? '{}')) as { entries?: unknown[] };
    assert.equal(parsedBody.entries?.length, 1);

    return jsonResponse({
      success: true,
      data: {
        pushedCount: 1,
        deletedCount: 0,
        confirmedEntryUuids: ['should-not-be-applied'],
        syncedAt: '2026-04-18T14:00:00.000Z',
        entries: {},
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
      title: '坏响应待同步',
      content: '本地内容',
    });

    await assert.rejects(
      () => service.syncLocalEntriesToRemote(),
      /同步响应格式无效/
    );

    const syncStatus = await service.getLocalSyncStatus();
    assert.equal(syncStatus.totalPending, 1);
    assert.equal(syncStatus.lastSyncedAt, null);

    const pendingEntries = await service.getPendingLocalSyncEntries();
    assert.deepEqual(pendingEntries.map((entry) => entry.entry_uuid), [createdEntry.entry_uuid]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('syncLocalEntriesToRemote rejects malformed sync payload fields before mutating local sync state', async () => {
  const originalFetch = globalThis.fetch;
  const invalidPayloads = [
    {
      name: 'blank confirmed entry uuid',
      buildData: () => ({
        pushedCount: 1,
        deletedCount: 0,
        confirmedEntryUuids: ['   '],
        syncedAt: '2026-04-18T14:30:00.000Z',
        entries: [],
      }),
    },
    {
      name: 'remote entry without sync identifier',
      buildData: (entryUuid: string) => ({
        pushedCount: 1,
        deletedCount: 0,
        confirmedEntryUuids: [entryUuid],
        syncedAt: '2026-04-18T14:30:00.000Z',
        entries: [{
          id: 301,
          title: '缺少同步标识',
          content: '远端内容',
          created_at: '2026-04-18T10:00:00.000Z',
          updated_at: '2026-04-18T10:00:00.000Z',
        }],
      }),
    },
    {
      name: 'remote entry with blank sync identifier',
      buildData: (entryUuid: string) => ({
        pushedCount: 1,
        deletedCount: 0,
        confirmedEntryUuids: [entryUuid],
        syncedAt: '2026-04-18T14:30:00.000Z',
        entries: [{
          id: 302,
          entry_uuid: '   ',
          title: '空白同步标识',
          content: '远端内容',
          created_at: '2026-04-18T10:00:00.000Z',
          updated_at: '2026-04-18T10:00:00.000Z',
        }],
      }),
    },
    {
      name: 'remote entry without created timestamp',
      buildData: (entryUuid: string) => ({
        pushedCount: 1,
        deletedCount: 0,
        confirmedEntryUuids: [entryUuid],
        syncedAt: '2026-04-18T14:30:00.000Z',
        entries: [{
          id: 303,
          entry_uuid: 'remote-entry-missing-created',
          title: '缺少创建时间',
          content: '远端内容',
          updated_at: '2026-04-18T10:00:00.000Z',
        }],
      }),
    },
    {
      name: 'remote entry with invalid updated timestamp',
      buildData: (entryUuid: string) => ({
        pushedCount: 1,
        deletedCount: 0,
        confirmedEntryUuids: [entryUuid],
        syncedAt: '2026-04-18T14:30:00.000Z',
        entries: [{
          id: 304,
          entry_uuid: 'remote-entry-invalid-updated',
          title: '坏更新时间',
          content: '远端内容',
          created_at: '2026-04-18T10:00:00.000Z',
          updated_at: 'not-a-date',
        }],
      }),
    },
    {
      name: 'remote entry with invalid deleted timestamp',
      buildData: (entryUuid: string) => ({
        pushedCount: 1,
        deletedCount: 0,
        confirmedEntryUuids: [entryUuid],
        syncedAt: '2026-04-18T14:30:00.000Z',
        entries: [{
          id: 305,
          entry_uuid: 'remote-entry-invalid-deleted',
          title: '坏删除时间',
          content: '远端内容',
          created_at: '2026-04-18T10:00:00.000Z',
          updated_at: '2026-04-18T10:00:00.000Z',
          deleted_at: 'not-a-date',
        }],
      }),
    },
    {
      name: 'invalid syncedAt',
      buildData: (entryUuid: string) => ({
        pushedCount: 1,
        deletedCount: 0,
        confirmedEntryUuids: [entryUuid],
        syncedAt: 'not-a-date',
        entries: [],
      }),
    },
  ];

  try {
    for (const invalidPayload of invalidPayloads) {
      localStorageMock.clear();
      localStorageMock.setItem('diary_force_local', 'true');

      let expectedEntryUuid = '';
      globalThis.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input.url;

        if (url !== 'https://diary.example.com/api/sync') {
          throw new Error(`Unexpected fetch URL in test: ${url}`);
        }

        const parsedBody = JSON.parse(String(init?.body ?? '{}')) as { entries?: unknown[] };
        assert.equal(parsedBody.entries?.length, 1);

        return jsonResponse({
          success: true,
          data: invalidPayload.buildData(expectedEntryUuid),
        });
      };

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
        title: `坏确认 ${invalidPayload.name}`,
        content: '本地内容',
      });
      expectedEntryUuid = createdEntry.entry_uuid ?? '';

      await assert.rejects(
        () => service.syncLocalEntriesToRemote(),
        /同步响应格式无效/,
        invalidPayload.name
      );

      const syncStatus = await service.getLocalSyncStatus();
      assert.equal(syncStatus.totalPending, 1);
      assert.equal(syncStatus.lastSyncedAt, null);

      const pendingEntries = await service.getPendingLocalSyncEntries();
      assert.deepEqual(pendingEntries.map((entry) => entry.entry_uuid), [createdEntry.entry_uuid]);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('syncLocalEntriesToRemote aborts stalled direct remote sync without mutating local sync state', async (t) => {
  localStorageMock.clear();
  localStorageMock.setItem('diary_force_local', 'true');

  const ApiService = await loadApiServiceClass();
  const service = new ApiService();
  await service.loginAdmin('admin123');
  await service.saveRemoteSyncConfig({
    baseUrl: 'https://diary.example.com',
    syncToken: 'remote-sync-token',
  });
  const createdEntry = await service.createEntry({
    title: '卡住的同步',
    content: '本地内容',
  });

  t.mock.timers.enable({ apis: ['setTimeout'] });

  const originalFetch = globalThis.fetch;
  let observedSignal: AbortSignal | undefined;

  const flushPromises = async () => {
    for (let index = 0; index < 10; index += 1) {
      await Promise.resolve();
    }
  };

  globalThis.fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
    observedSignal = init?.signal ?? undefined;
    observedSignal?.addEventListener('abort', () => {
      reject(new DOMException('Request aborted', 'AbortError'));
    }, { once: true });
  });

  try {
    const sync = service.syncLocalEntriesToRemote();

    for (let index = 0; index < 20 && !observedSignal; index += 1) {
      t.mock.timers.tick(30);
      await flushPromises();
    }

    assert.equal(observedSignal instanceof AbortSignal, true);
    t.mock.timers.tick(15_000);

    await assert.rejects(
      sync,
      /同步请求超时/
    );
    assert.equal(observedSignal?.aborted, true);

    t.mock.timers.reset();
    const pendingEntries = await service.getPendingLocalSyncEntries();
    assert.deepEqual(pendingEntries.map((entry) => entry.entry_uuid), [createdEntry.entry_uuid]);
  } finally {
    globalThis.fetch = originalFetch;
    t.mock.timers.reset();
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
