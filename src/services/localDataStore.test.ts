import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { Filesystem } from '@capacitor/filesystem';
import type { DiaryEntry } from '../types';
import {
  MAX_ENTRY_CONTENT_LENGTH,
  MAX_ENTRY_TAG_LENGTH,
  MAX_ENTRY_TAGS_COUNT,
  MAX_ENTRY_TITLE_LENGTH,
} from '../utils/entryTextValidation';
import { LocalDataStore } from './localDataStore';

const filesystemPluginMock = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  deleteFile: vi.fn(),
}));

vi.mock('@capacitor/filesystem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@capacitor/filesystem')>();
  return {
    ...actual,
    Filesystem: filesystemPluginMock,
  };
});

const storageKeys = {
  entries: 'test_entries',
  settings: 'test_settings',
  appAuth: 'test_app_auth',
  adminAuth: 'test_admin_auth',
  disableDefaults: 'test_disable_defaults',
};

function createStore() {
  return new LocalDataStore(storageKeys);
}

const originalFilesystemDescriptors = {
  readFile: Object.getOwnPropertyDescriptor(Filesystem, 'readFile'),
  writeFile: Object.getOwnPropertyDescriptor(Filesystem, 'writeFile'),
  deleteFile: Object.getOwnPropertyDescriptor(Filesystem, 'deleteFile'),
};

function mockNativeFilesystemRuntime() {
  vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
  vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true);
}

function stubFilesystemMethod(
  methodName: 'readFile' | 'writeFile' | 'deleteFile',
  implementation: (...args: unknown[]) => unknown
) {
  Object.defineProperty(Filesystem, methodName, {
    value: vi.fn(implementation),
    configurable: true,
  });
}

function restoreFilesystemMethods() {
  for (const methodName of ['readFile', 'writeFile', 'deleteFile'] as const) {
    const descriptor = originalFilesystemDescriptors[methodName];

    if (descriptor) {
      Object.defineProperty(Filesystem, methodName, descriptor);
    } else {
      delete Filesystem[methodName];
    }
  }
}

const validEntry: DiaryEntry = {
  id: 1,
  entry_uuid: 'entry-1',
  title: '本地日记',
  content: '本地内容',
  content_type: 'markdown',
  images: ['local.jpg'],
  tags: ['local'],
  hidden: false,
};

describe('LocalDataStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    restoreFilesystemMethods();
  });

  it('reads valid entries from localStorage', async () => {
    localStorage.setItem(storageKeys.entries, JSON.stringify([validEntry]));

    await expect(createStore().getEntries(() => [])).resolves.toEqual([validEntry]);
  });

  it('falls back to legacy entries when native file reads time out', async () => {
    vi.useFakeTimers();
    mockNativeFilesystemRuntime();
    localStorage.setItem(storageKeys.entries, JSON.stringify([validEntry]));
    stubFilesystemMethod('readFile', () => new Promise(() => {}));
    stubFilesystemMethod('writeFile', () => Promise.resolve());

    const entries = createStore().getEntries(() => []);

    await vi.advanceTimersByTimeAsync(8_000);

    await expect(entries).resolves.toEqual([validEntry]);
  });

  it('keeps serving legacy entries when native migration writes time out', async () => {
    vi.useFakeTimers();
    mockNativeFilesystemRuntime();
    localStorage.setItem(storageKeys.entries, JSON.stringify([validEntry]));
    stubFilesystemMethod('readFile', () => Promise.reject(new Error('missing native file')));
    stubFilesystemMethod('writeFile', () => new Promise(() => {}));

    const entries = createStore().getEntries(() => []);

    await vi.advanceTimersByTimeAsync(8_000);

    await expect(entries).resolves.toEqual([validEntry]);
  });

  it('falls back when stored entries are malformed', async () => {
    const defaultEntries: DiaryEntry[] = [{
      title: '默认日记',
      content: '默认内容',
    }];
    const getDefaultEntries = () => defaultEntries;

    localStorage.setItem(storageKeys.entries, JSON.stringify([{ title: '缺少内容' }]));
    await expect(createStore().getEntries(getDefaultEntries)).resolves.toEqual(defaultEntries);

    localStorage.setItem(storageKeys.entries, JSON.stringify([{ ...validEntry, tags: ['ok', 1] }]));
    await expect(createStore().getEntries(getDefaultEntries)).resolves.toEqual(defaultEntries);

    localStorage.setItem(storageKeys.entries, JSON.stringify([{ ...validEntry, images: ['javascript:alert(1)'] }]));
    await expect(createStore().getEntries(getDefaultEntries)).resolves.toEqual(defaultEntries);

    localStorage.setItem(storageKeys.entries, JSON.stringify([{ ...validEntry, content: '   ' }]));
    await expect(createStore().getEntries(getDefaultEntries)).resolves.toEqual(defaultEntries);

    localStorage.setItem(storageKeys.entries, JSON.stringify([{ ...validEntry, id: 0 }]));
    await expect(createStore().getEntries(getDefaultEntries)).resolves.toEqual(defaultEntries);

    localStorage.setItem(storageKeys.entries, JSON.stringify([{
      ...validEntry,
      location: {
        latitude: 91,
        longitude: 121.47,
      },
    }]));
    await expect(createStore().getEntries(getDefaultEntries)).resolves.toEqual(defaultEntries);

    localStorage.setItem(storageKeys.entries, '{bad json');
    await expect(createStore().getEntries(getDefaultEntries)).resolves.toEqual(defaultEntries);
  });

  it('falls back when stored entries exceed text or tag limits', async () => {
    const defaultEntries: DiaryEntry[] = [{
      title: '默认日记',
      content: '默认内容',
    }];
    const getDefaultEntries = () => defaultEntries;

    localStorage.setItem(storageKeys.entries, JSON.stringify([{
      ...validEntry,
      title: 'x'.repeat(MAX_ENTRY_TITLE_LENGTH + 1),
    }]));
    await expect(createStore().getEntries(getDefaultEntries)).resolves.toEqual(defaultEntries);

    localStorage.setItem(storageKeys.entries, JSON.stringify([{
      ...validEntry,
      content: 'x'.repeat(MAX_ENTRY_CONTENT_LENGTH + 1),
    }]));
    await expect(createStore().getEntries(getDefaultEntries)).resolves.toEqual(defaultEntries);

    localStorage.setItem(storageKeys.entries, JSON.stringify([{
      ...validEntry,
      content: `${' '.repeat(MAX_ENTRY_CONTENT_LENGTH)}正文`,
    }]));
    await expect(createStore().getEntries(getDefaultEntries)).resolves.toEqual(defaultEntries);

    localStorage.setItem(storageKeys.entries, JSON.stringify([{
      ...validEntry,
      tags: Array.from({ length: MAX_ENTRY_TAGS_COUNT + 1 }, (_, index) => `tag-${index}`),
    }]));
    await expect(createStore().getEntries(getDefaultEntries)).resolves.toEqual(defaultEntries);

    localStorage.setItem(storageKeys.entries, JSON.stringify([{
      ...validEntry,
      tags: ['x'.repeat(MAX_ENTRY_TAG_LENGTH + 1)],
    }]));
    await expect(createStore().getEntries(getDefaultEntries)).resolves.toEqual(defaultEntries);
  });

  it('returns an empty list for malformed entries when defaults are disabled', async () => {
    localStorage.setItem(storageKeys.entries, JSON.stringify([{ title: '缺少内容' }]));
    localStorage.setItem(storageKeys.disableDefaults, 'true');

    await expect(createStore().getEntries(() => [validEntry])).resolves.toEqual([]);
  });

  it('reads valid string settings from localStorage', async () => {
    localStorage.setItem(storageKeys.settings, JSON.stringify({
      welcomePageEnabled: 'true',
      archiveViewEnabled: 'false',
    }));

    await expect(createStore().getSettings(() => ({ fallback: 'true' }))).resolves.toEqual({
      welcomePageEnabled: 'true',
      archiveViewEnabled: 'false',
    });
  });

  it('falls back when stored settings are malformed or not a string record', async () => {
    const getDefaultSettings = () => ({ fallback: 'true' });

    localStorage.setItem(storageKeys.settings, JSON.stringify(['not', 'settings']));
    await expect(createStore().getSettings(getDefaultSettings)).resolves.toEqual({ fallback: 'true' });

    localStorage.setItem(storageKeys.settings, JSON.stringify({ validKey: true }));
    await expect(createStore().getSettings(getDefaultSettings)).resolves.toEqual({ fallback: 'true' });

    localStorage.setItem(storageKeys.settings, '{bad json');
    await expect(createStore().getSettings(getDefaultSettings)).resolves.toEqual({ fallback: 'true' });
  });

  it('falls back to defaults when reading storage flags fails', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });

    await expect(createStore().getEntries(() => [validEntry])).resolves.toEqual([validEntry]);
    await expect(createStore().getSession()).resolves.toEqual({
      isAuthenticated: false,
      isAdminAuthenticated: false,
    });
    await expect(createStore().isDefaultDataDisabled()).resolves.toBe(false);
  });

  it('does not reject when clearing local fallback keys fails', async () => {
    localStorage.setItem(storageKeys.appAuth, 'true');
    localStorage.setItem(storageKeys.adminAuth, 'true');
    localStorage.setItem(storageKeys.entries, JSON.stringify([validEntry]));
    localStorage.setItem(storageKeys.settings, JSON.stringify({ welcomePageEnabled: 'true' }));

    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });

    await expect(createStore().clearSession()).resolves.toBeUndefined();
    await expect(createStore().setDefaultDataEnabled(true)).resolves.toBeUndefined();
    await expect(createStore().clearCoreData()).resolves.toBeUndefined();
  });

  it('does not reject when disabling default data cannot be persisted', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage is full', 'QuotaExceededError');
    });

    await expect(createStore().setDefaultDataEnabled(false)).resolves.toBeUndefined();
  });

  it('preserves a friendly quota error when saving entries fails', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage is full', 'QuotaExceededError');
    });

    await expect(createStore().saveEntries([validEntry])).rejects.toThrow(/本地存储空间已满/);
  });

  it('rolls back both browser session flags when the second write fails', async () => {
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === storageKeys.adminAuth) {
        throw new DOMException('Storage is full', 'QuotaExceededError');
      }

      originalSetItem.call(this, key, value);
    });

    await expect(createStore().saveSession({
      isAuthenticated: true,
      isAdminAuthenticated: true,
    })).rejects.toThrow(/本地存储空间已满/);

    expect(localStorage.getItem(storageKeys.appAuth)).toBeNull();
    expect(localStorage.getItem(storageKeys.adminAuth)).toBeNull();
  });

  it('reports native cleanup timeouts instead of silently claiming success', async () => {
    vi.useFakeTimers();
    mockNativeFilesystemRuntime();
    stubFilesystemMethod('deleteFile', () => new Promise(() => {}));

    const cleanupPromise = createStore().clearCoreData();
    const cleanupExpectation = expect(cleanupPromise).rejects.toThrow('原生本地数据清理超时');
    await vi.advanceTimersByTimeAsync(8_000);

    await cleanupExpectation;
  });

  it('ignores Capacitor missing-file error codes during native session cleanup', async () => {
    mockNativeFilesystemRuntime();
    stubFilesystemMethod('deleteFile', () => Promise.reject({
      code: 'OS-PLUG-FILE-0008',
      message: 'missing',
    }));

    await expect(createStore().clearSession()).resolves.toBeUndefined();
  });
});
