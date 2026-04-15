import { Capacitor } from '@capacitor/core';

type EnvValueGetter = (key: 'MODE' | 'VITE_USE_MOCK_API') => string | undefined;

export class ApiModeStore {
  private static readonly FORCE_LOCAL_KEY = 'diary_force_local';
  private static readonly FORCE_REMOTE_KEY = 'diary_force_remote';
  private static readonly DISABLE_DEFAULTS_KEY = 'diary_disable_defaults';
  private static readonly ENTRY_STORAGE_KEY = 'diary_app_data';
  private static readonly SETTINGS_STORAGE_KEY = 'diary_app_settings';
  private static readonly APP_AUTH_KEY = 'diary-app-authenticated';
  private static readonly ADMIN_AUTH_KEY = 'diary-admin-authenticated';

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
    localStorage.removeItem(ApiModeStore.ENTRY_STORAGE_KEY);
    localStorage.removeItem(ApiModeStore.SETTINGS_STORAGE_KEY);
    localStorage.removeItem(ApiModeStore.APP_AUTH_KEY);
    localStorage.removeItem(ApiModeStore.ADMIN_AUTH_KEY);
    localStorage.setItem(ApiModeStore.DISABLE_DEFAULTS_KEY, 'true');
  }

  setDefaultDataEnabled(enabled: boolean): void {
    if (enabled) {
      localStorage.removeItem(ApiModeStore.DISABLE_DEFAULTS_KEY);
      return;
    }

    localStorage.setItem(ApiModeStore.DISABLE_DEFAULTS_KEY, 'true');
  }
}
