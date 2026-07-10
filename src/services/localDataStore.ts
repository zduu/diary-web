import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';

import type { DiaryEntry } from '../types/index.ts';
import {
  getLocalStorageItem,
  isLocalStorageAvailable,
  removeLocalStorageItem,
  setLocalStorageItem,
  setLocalStorageItemStrict,
} from '../utils/browserStorage.ts';
import { isDiaryEntryArray } from '../utils/diaryEntryValidation.ts';
import type { SessionState } from './apiTypes.ts';

const DATA_ROOT = 'diary-local';
const ENTRIES_FILE_PATH = `${DATA_ROOT}/entries.json`;
const SETTINGS_FILE_PATH = `${DATA_ROOT}/settings.json`;
const SESSION_FILE_PATH = `${DATA_ROOT}/session.json`;
const RUNTIME_FILE_PATH = `${DATA_ROOT}/runtime.json`;
const NATIVE_FILESYSTEM_OPERATION_TIMEOUT_MS = 8_000;

type RuntimeState = {
  disableDefaults: boolean;
};

type StorageKeys = {
  entries: string;
  settings: string;
  appAuth: string;
  adminAuth: string;
  disableDefaults: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string');
}

function readStorageJson<T>(key: string): T | null {
  try {
    const data = getLocalStorageItem(key);
    return data ? JSON.parse(data) as T : null;
  } catch {
    return null;
  }
}

function readStorageFlag(key: string) {
  return getLocalStorageItem(key) === 'true';
}

function isQuotaExceededError(error: unknown) {
  if (error instanceof DOMException) {
    return error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED';
  }

  if (error instanceof Error) {
    return /quota|storage.*full|exceeded/i.test(error.message);
  }

  return false;
}

function writeStorageItem(key: string, value: string, quotaMessage: string) {
  try {
    setLocalStorageItemStrict(key, value);
  } catch (error) {
    if (isQuotaExceededError(error)) {
      throw new Error(quotaMessage);
    }

    throw error;
  }
}

function isSessionState(value: unknown): value is SessionState {
  return isRecord(value) &&
    typeof value.isAuthenticated === 'boolean' &&
    typeof value.isAdminAuthenticated === 'boolean';
}

function isRuntimeState(value: unknown): value is RuntimeState {
  return isRecord(value) && typeof value.disableDefaults === 'boolean';
}

async function withNativeFilesystemTimeout<T>(operation: Promise<T>, timeoutMessage: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, NATIVE_FILESYSTEM_OPERATION_TIMEOUT_MS);
  });

  try {
    return await Promise.race([
      operation,
      timeoutPromise,
    ]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

async function readNativeJson<T>(path: string): Promise<T | null> {
  try {
    const result = await withNativeFilesystemTimeout(
      Filesystem.readFile({
        path,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      }),
      '原生本地数据读取超时'
    );
    const raw = typeof result.data === 'string' ? result.data : '';
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

async function writeNativeJson(path: string, value: unknown): Promise<void> {
  await withNativeFilesystemTimeout(
    Filesystem.writeFile({
      path,
      directory: Directory.Data,
      data: JSON.stringify(value),
      encoding: Encoding.UTF8,
      recursive: true,
    }),
    '原生本地数据保存超时'
  );
}

function isMissingNativeFileError(error: unknown) {
  if (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'OS-PLUG-FILE-0008'
  ) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error ?? '');
  return /not found|does not exist|no such file|missing file/i.test(message);
}

async function deleteNativeFile(path: string): Promise<void> {
  try {
    await withNativeFilesystemTimeout(
      Filesystem.deleteFile({
        path,
        directory: Directory.Data,
      }),
      '原生本地数据清理超时'
    );
  } catch (error) {
    if (!isMissingNativeFileError(error)) {
      throw error;
    }
  }
}

function restoreStorageItem(key: string, previousValue: string | null) {
  if (previousValue === null) {
    removeLocalStorageItem(key);
    return;
  }

  setLocalStorageItem(key, previousValue);
}

export class LocalDataStore {
  private readonly storageKeys: StorageKeys;

  constructor(storageKeys: StorageKeys) {
    this.storageKeys = storageKeys;
  }

  private isNativeFilesystemRuntime(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    // 注意：这里刻意用 isNativePlatform() 而非 isNativeAppRuntime()。
    // capacitor: 协议但桥未注入时，@capacitor/filesystem 的 Web 实现（IndexedDB）
    // 依然会注册并通过 isPluginAvailable 检查，误入会绕开 localStorage 回退。
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Filesystem');
  }

  private async readEntriesFromNative(): Promise<DiaryEntry[] | null> {
    const nativeEntries = await readNativeJson<DiaryEntry[]>(ENTRIES_FILE_PATH);
    if (isDiaryEntryArray(nativeEntries)) {
      return nativeEntries;
    }

    const legacyEntries = readStorageJson<DiaryEntry[]>(this.storageKeys.entries);
    if (isDiaryEntryArray(legacyEntries)) {
      try {
        await writeNativeJson(ENTRIES_FILE_PATH, legacyEntries);
      } catch {
        // Keep serving valid legacy data even if native migration is temporarily unavailable.
      }
      return legacyEntries;
    }

    return null;
  }

  private async readSettingsFromNative(): Promise<Record<string, string> | null> {
    const nativeSettings = await readNativeJson<Record<string, string>>(SETTINGS_FILE_PATH);
    if (isStringRecord(nativeSettings)) {
      return nativeSettings;
    }

    const legacySettings = readStorageJson<Record<string, string>>(this.storageKeys.settings);
    if (isStringRecord(legacySettings)) {
      try {
        await writeNativeJson(SETTINGS_FILE_PATH, legacySettings);
      } catch {
        // Keep serving valid legacy data even if native migration is temporarily unavailable.
      }
      return legacySettings;
    }

    return null;
  }

  private async readSessionFromNative(): Promise<SessionState | null> {
    const nativeSession = await readNativeJson<SessionState>(SESSION_FILE_PATH);
    if (isSessionState(nativeSession)) {
      return nativeSession;
    }

    const legacySession: SessionState = {
      isAuthenticated: readStorageFlag(this.storageKeys.appAuth) || readStorageFlag(this.storageKeys.adminAuth),
      isAdminAuthenticated: readStorageFlag(this.storageKeys.adminAuth),
    };

    if (legacySession.isAuthenticated || legacySession.isAdminAuthenticated) {
      try {
        await writeNativeJson(SESSION_FILE_PATH, legacySession);
      } catch {
        // Keep serving valid legacy data even if native migration is temporarily unavailable.
      }
      return legacySession;
    }

    return null;
  }

  private async readRuntimeFromNative(): Promise<RuntimeState | null> {
    const nativeRuntime = await readNativeJson<RuntimeState>(RUNTIME_FILE_PATH);
    if (isRuntimeState(nativeRuntime)) {
      return nativeRuntime;
    }

    const legacyRuntime: RuntimeState = {
      disableDefaults: readStorageFlag(this.storageKeys.disableDefaults),
    };
    if (legacyRuntime.disableDefaults) {
      try {
        await writeNativeJson(RUNTIME_FILE_PATH, legacyRuntime);
      } catch {
        // Keep serving valid legacy data even if native migration is temporarily unavailable.
      }
      return legacyRuntime;
    }

    return null;
  }

  async getEntries(getDefaultEntries: () => DiaryEntry[]): Promise<DiaryEntry[]> {
    if (this.isNativeFilesystemRuntime()) {
      const storedEntries = await this.readEntriesFromNative();
      if (storedEntries) {
        return storedEntries;
      }

      return (await this.isDefaultDataDisabled()) ? [] : getDefaultEntries();
    }

    const storedEntries = readStorageJson<DiaryEntry[]>(this.storageKeys.entries);
    if (isDiaryEntryArray(storedEntries)) {
      return storedEntries;
    }

    return readStorageFlag(this.storageKeys.disableDefaults) ? [] : getDefaultEntries();
  }

  async saveEntries(entries: DiaryEntry[]): Promise<void> {
    if (this.isNativeFilesystemRuntime()) {
      await writeNativeJson(ENTRIES_FILE_PATH, entries);
      return;
    }

    if (!isLocalStorageAvailable()) {
      throw new Error('浏览器本地存储不可用，当前 Web 端无法保存日记数据。请检查浏览器隐私设置或改用 APK。');
    }

    writeStorageItem(
      this.storageKeys.entries,
      JSON.stringify(entries),
      '浏览器本地存储空间已满，当前 Web 端无法继续保存这批日记。请减少导入体积、清理本地数据，或改用 APK 导入/同步。'
    );
  }

  async getSettings(getDefaultSettings: () => Record<string, string>): Promise<Record<string, string>> {
    if (this.isNativeFilesystemRuntime()) {
      const storedSettings = await this.readSettingsFromNative();
      return storedSettings ?? getDefaultSettings();
    }

    const storedSettings = readStorageJson<Record<string, string>>(this.storageKeys.settings);
    return isStringRecord(storedSettings) ? storedSettings : getDefaultSettings();
  }

  async saveSettings(settings: Record<string, string>): Promise<void> {
    if (this.isNativeFilesystemRuntime()) {
      await writeNativeJson(SETTINGS_FILE_PATH, settings);
      return;
    }

    if (!isLocalStorageAvailable()) {
      throw new Error('浏览器本地存储不可用，当前 Web 端无法保存设置。请检查浏览器隐私设置或改用 APK。');
    }

    writeStorageItem(
      this.storageKeys.settings,
      JSON.stringify(settings),
      '浏览器本地存储空间已满，当前 Web 端无法保存设置。请清理浏览器站点数据后重试。'
    );
  }

  async getSession(): Promise<SessionState> {
    if (this.isNativeFilesystemRuntime()) {
      return (await this.readSessionFromNative()) ?? {
        isAuthenticated: false,
        isAdminAuthenticated: false,
      };
    }

    const isAdminAuthenticated = readStorageFlag(this.storageKeys.adminAuth);
    const isAuthenticated = isAdminAuthenticated || readStorageFlag(this.storageKeys.appAuth);

    return {
      isAuthenticated,
      isAdminAuthenticated,
    };
  }

  async saveSession(session: SessionState): Promise<void> {
    if (this.isNativeFilesystemRuntime()) {
      await writeNativeJson(SESSION_FILE_PATH, session);
      return;
    }

    if (!isLocalStorageAvailable()) {
      throw new Error('浏览器本地存储不可用，当前 Web 端无法保存登录状态。请检查浏览器隐私设置或改用 APK。');
    }

    const previousAppAuth = getLocalStorageItem(this.storageKeys.appAuth);
    const previousAdminAuth = getLocalStorageItem(this.storageKeys.adminAuth);

    try {
      writeStorageItem(
        this.storageKeys.appAuth,
        String(session.isAuthenticated),
        '浏览器本地存储空间已满，当前 Web 端无法保存登录状态。请清理浏览器站点数据后重试。'
      );
      writeStorageItem(
        this.storageKeys.adminAuth,
        String(session.isAdminAuthenticated),
        '浏览器本地存储空间已满，当前 Web 端无法保存登录状态。请清理浏览器站点数据后重试。'
      );
    } catch (error) {
      restoreStorageItem(this.storageKeys.appAuth, previousAppAuth);
      restoreStorageItem(this.storageKeys.adminAuth, previousAdminAuth);
      throw error;
    }
  }

  async clearSession(): Promise<void> {
    if (this.isNativeFilesystemRuntime()) {
      await deleteNativeFile(SESSION_FILE_PATH);
    }

    if (!isLocalStorageAvailable()) {
      return;
    }

    removeLocalStorageItem(this.storageKeys.appAuth);
    removeLocalStorageItem(this.storageKeys.adminAuth);
  }

  async isDefaultDataDisabled(): Promise<boolean> {
    if (this.isNativeFilesystemRuntime()) {
      return (await this.readRuntimeFromNative())?.disableDefaults ?? false;
    }

    return readStorageFlag(this.storageKeys.disableDefaults);
  }

  async setDefaultDataEnabled(enabled: boolean): Promise<void> {
    if (this.isNativeFilesystemRuntime()) {
      if (enabled) {
        await deleteNativeFile(RUNTIME_FILE_PATH);
      } else {
        await writeNativeJson(RUNTIME_FILE_PATH, { disableDefaults: true } satisfies RuntimeState);
      }
    }

    if (!isLocalStorageAvailable()) {
      return;
    }

    if (enabled) {
      removeLocalStorageItem(this.storageKeys.disableDefaults);
      return;
    }

    setLocalStorageItem(this.storageKeys.disableDefaults, 'true');
  }

  async clearCoreData(): Promise<void> {
    if (this.isNativeFilesystemRuntime()) {
      await Promise.all([
        deleteNativeFile(ENTRIES_FILE_PATH),
        deleteNativeFile(SETTINGS_FILE_PATH),
        deleteNativeFile(SESSION_FILE_PATH),
        deleteNativeFile(RUNTIME_FILE_PATH),
      ]);
    }

    if (!isLocalStorageAvailable()) {
      return;
    }

    removeLocalStorageItem(this.storageKeys.entries);
    removeLocalStorageItem(this.storageKeys.settings);
    removeLocalStorageItem(this.storageKeys.appAuth);
    removeLocalStorageItem(this.storageKeys.adminAuth);
  }
}
