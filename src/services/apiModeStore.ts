import { LocalDataStore } from './localDataStore.ts';
import { getLocalStorageItem, removeLocalStorageItem, setLocalStorageItem } from '../utils/browserStorage.ts';
import { debugWarn } from '../utils/logger.ts';
import { isNativeAppRuntime } from '../utils/nativePlatform.ts';

type EnvValueGetter = (key: 'MODE' | 'VITE_USE_MOCK_API' | 'VITE_ENABLE_DATA_MODE_SWITCH') => string | undefined;
type LocalModeDataStore = Pick<LocalDataStore, 'clearCoreData' | 'setDefaultDataEnabled'>;

export class ApiModeStore {
  private static readonly FORCE_LOCAL_KEY = 'diary_force_local';
  private static readonly FORCE_REMOTE_KEY = 'diary_force_remote';
  private static readonly DISABLE_DEFAULTS_KEY = 'diary_disable_defaults';
  private static readonly ENTRY_STORAGE_KEY = 'diary_app_data';
  private static readonly SETTINGS_STORAGE_KEY = 'diary_app_settings';
  private static readonly APP_AUTH_KEY = 'diary-app-authenticated';
  private static readonly ADMIN_AUTH_KEY = 'diary-admin-authenticated';
  private readonly localDataStore: LocalModeDataStore;

  constructor(localDataStore: LocalModeDataStore = new LocalDataStore({
    entries: ApiModeStore.ENTRY_STORAGE_KEY,
    settings: ApiModeStore.SETTINGS_STORAGE_KEY,
    appAuth: ApiModeStore.APP_AUTH_KEY,
    adminAuth: ApiModeStore.ADMIN_AUTH_KEY,
    disableDefaults: ApiModeStore.DISABLE_DEFAULTS_KEY,
  })) {
    this.localDataStore = localDataStore;
  }

  isNativeApp(): boolean {
    return isNativeAppRuntime();
  }

  canToggleDataMode(getEnvValue: EnvValueGetter): boolean {
    if (!isNativeAppRuntime()) {
      return true;
    }

    return getEnvValue('MODE') === 'mock'
      || getEnvValue('VITE_USE_MOCK_API') === 'true'
      || getEnvValue('VITE_ENABLE_DATA_MODE_SWITCH') === 'true';
  }

  shouldUseMockService(getEnvValue: EnvValueGetter): boolean {
    const useMock = getEnvValue('VITE_USE_MOCK_API') === 'true';
    const forceLocal = getLocalStorageItem(ApiModeStore.FORCE_LOCAL_KEY) === 'true';
    const forceRemote = getLocalStorageItem(ApiModeStore.FORCE_REMOTE_KEY) === 'true';
    const mode = getEnvValue('MODE');
    const nativeAppRuntime = isNativeAppRuntime();
    const canToggleDataMode = this.canToggleDataMode(getEnvValue);

    if (mode === 'mock' || useMock || forceLocal) {
      return true;
    }

    if (nativeAppRuntime && !canToggleDataMode) {
      return true;
    }

    if (forceRemote) {
      return false;
    }

    return nativeAppRuntime;
  }

  getStatus(useMockService: boolean): { useMockService: boolean; reason: string } {
    return {
      useMockService,
      reason: useMockService ? '本地离线数据' : '远程 Pages 数据',
    };
  }

  enableLocalMode(): void {
    if (!setLocalStorageItem(ApiModeStore.FORCE_LOCAL_KEY, 'true')) {
      throw new Error('浏览器无法保存本地模式设置，请检查站点存储权限后重试。');
    }

    removeLocalStorageItem(ApiModeStore.FORCE_REMOTE_KEY);
  }

  enableRemoteMode(): void {
    if (!setLocalStorageItem(ApiModeStore.FORCE_REMOTE_KEY, 'true')) {
      throw new Error('浏览器无法保存远程模式设置，请检查站点存储权限后重试。');
    }

    if (!removeLocalStorageItem(ApiModeStore.FORCE_LOCAL_KEY)) {
      removeLocalStorageItem(ApiModeStore.FORCE_REMOTE_KEY);
      throw new Error('浏览器无法清除本地模式设置，请检查站点存储权限后重试。');
    }
  }

  private runBackgroundLocalDataTask(task: Promise<void>, action: string): void {
    void task.catch((error: unknown) => {
      debugWarn(`Failed to ${action}:`, error);
    });
  }

  clearLocalData(): void {
    this.runBackgroundLocalDataTask((async () => {
      try {
        await this.localDataStore.clearCoreData();
      } finally {
        // 原生文件系统写入必须在清理完成后执行，避免 runtime.json 的删除与重建竞争。
        await this.localDataStore.setDefaultDataEnabled(false);
      }
    })(), 'clear local data and disable default data');
  }

  setDefaultDataEnabled(enabled: boolean): void {
    this.runBackgroundLocalDataTask(
      this.localDataStore.setDefaultDataEnabled(enabled),
      enabled ? 'enable default data' : 'disable default data'
    );
  }
}
