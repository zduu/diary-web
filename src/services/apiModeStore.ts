import { Capacitor } from '@capacitor/core';
import { LocalDataStore } from './localDataStore.ts';

type EnvValueGetter = (key: 'MODE' | 'VITE_USE_MOCK_API') => string | undefined;

export class ApiModeStore {
  private static readonly FORCE_LOCAL_KEY = 'diary_force_local';
  private static readonly FORCE_REMOTE_KEY = 'diary_force_remote';
  private static readonly DISABLE_DEFAULTS_KEY = 'diary_disable_defaults';
  private static readonly ENTRY_STORAGE_KEY = 'diary_app_data';
  private static readonly SETTINGS_STORAGE_KEY = 'diary_app_settings';
  private static readonly APP_AUTH_KEY = 'diary-app-authenticated';
  private static readonly ADMIN_AUTH_KEY = 'diary-admin-authenticated';
  private readonly localDataStore = new LocalDataStore({
    entries: ApiModeStore.ENTRY_STORAGE_KEY,
    settings: ApiModeStore.SETTINGS_STORAGE_KEY,
    appAuth: ApiModeStore.APP_AUTH_KEY,
    adminAuth: ApiModeStore.ADMIN_AUTH_KEY,
    disableDefaults: ApiModeStore.DISABLE_DEFAULTS_KEY,
  });

  private isNativeAppRuntime(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    return Capacitor.isNativePlatform() || window.location.protocol === 'capacitor:';
  }

  shouldUseMockService(getEnvValue: EnvValueGetter): boolean {
    const useMock = getEnvValue('VITE_USE_MOCK_API') === 'true';
    const forceLocal = localStorage.getItem(ApiModeStore.FORCE_LOCAL_KEY) === 'true';
    const forceRemote = localStorage.getItem(ApiModeStore.FORCE_REMOTE_KEY) === 'true';
    const mode = getEnvValue('MODE');
    const nativeAppRuntime = this.isNativeAppRuntime();

    if (mode === 'mock' || useMock || forceLocal) {
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
    localStorage.setItem(ApiModeStore.FORCE_LOCAL_KEY, 'true');
    localStorage.removeItem(ApiModeStore.FORCE_REMOTE_KEY);
  }

  enableRemoteMode(): void {
    localStorage.removeItem(ApiModeStore.FORCE_LOCAL_KEY);
    localStorage.setItem(ApiModeStore.FORCE_REMOTE_KEY, 'true');
  }

  clearLocalData(): void {
    void this.localDataStore.clearCoreData();
    void this.localDataStore.setDefaultDataEnabled(false);
  }

  setDefaultDataEnabled(enabled: boolean): void {
    void this.localDataStore.setDefaultDataEnabled(enabled);
  }
}
