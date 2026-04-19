import type { DiaryEntry, ApiResponse, DiaryStats } from '../types/index.ts';
import type {
  AdminAccessProfile,
  AdminSettingsResponse,
  PublicSettingsResponse,
  RemoteBindingInput,
  SessionState,
} from './apiTypes.ts';
import { ApiModeStore } from './apiModeStore.ts';
import type { DiarySyncStatus } from './entrySync.ts';
import { MockApiService } from './mockApiService.ts';
import { PublicSettingsStore } from './publicSettingsStore.ts';
import { ApiRequestError, RemoteApiClient } from './remoteApiClient.ts';
import { withRetry, verifyDeletion, getConsistencyErrorMessage } from '../utils/d1Utils.ts';
import { debugWarn } from '../utils/logger.ts';

function getViteEnvValue(key: 'MODE' | 'VITE_USE_MOCK_API' | 'VITE_ENABLE_DATA_MODE_SWITCH'): string | undefined {
  return import.meta.env?.[key];
}

type SessionChangeListener = (session: SessionState) => void;
type ServiceModeHandlers<T> = {
  mock: () => Promise<T>;
  remote: () => Promise<T>;
};

export type ImageUploadStorage = 'embedded' | 'external' | 'r2';

export interface ImageUploadResult {
  url: string;
  storage: ImageUploadStorage;
  warning?: string;
}

export interface R2SelfCheckResult {
  bucketBindingPresent: boolean;
  canWrite: boolean;
  canRead: boolean;
  canDelete: boolean;
  readBackMatches: boolean;
  testedKey: string | null;
  keyPrefix: string;
  message: string;
}

export interface SyncRemoteResult {
  entries: DiaryEntry[];
  pushedCount: number;
  deletedCount: number;
  syncedAt: string;
  pendingCount: number;
  remoteCount: number;
}

export interface RemoteSyncConfig {
  baseUrl: string;
  syncToken: string;
}

type RemoteSyncPayload = {
  entries: DiaryEntry[];
  pushedCount: number;
  deletedCount: number;
  confirmedEntryUuids?: string[];
  syncedAt: string;
};

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
};

const signedOutSession: SessionState = {
  isAuthenticated: false,
  isAdminAuthenticated: false,
};

function encodeBytesToBase64(bytes: Uint8Array) {
  let binary = '';

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }

  return btoa(binary);
}

async function convertFileToDataUrl(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = file.type || 'application/octet-stream';
  return `data:${contentType};base64,${encodeBytesToBase64(bytes)}`;
}

function inferUploadStorage(url: string): ImageUploadStorage {
  if (url.startsWith('data:image/')) {
    return 'embedded';
  }

  if (url.includes('/api/images/')) {
    return 'r2';
  }

  return 'external';
}

function normalizeRemoteSyncApiBaseUrl(rawBaseUrl: string): string {
  const trimmedValue = rawBaseUrl.trim();
  if (!trimmedValue) {
    throw new Error('请先填写同步地址');
  }

  const normalizedBaseUrl = trimmedValue.replace(/\/+$/, '');
  return normalizedBaseUrl.endsWith('/api') ? normalizedBaseUrl : `${normalizedBaseUrl}/api`;
}

function normalizeRemoteSyncBaseUrl(rawBaseUrl: string): string {
  const trimmedValue = rawBaseUrl.trim();
  return trimmedValue.replace(/\/+$/, '');
}

async function parseApiEnvelope<T>(response: Response): Promise<ApiEnvelope<T> | null> {
  try {
    return await response.json() as ApiEnvelope<T>;
  } catch {
    return null;
  }
}

export class ApiService {
  private readonly modeStore = new ApiModeStore();
  private mockService = new MockApiService();
  private useMockService = this.modeStore.shouldUseMockService(getViteEnvValue);
  private readonly publicSettingsStore = new PublicSettingsStore();
  private readonly sessionListeners = new Set<SessionChangeListener>();
  private readonly remoteClient = new RemoteApiClient({
    onSessionChange: (session) => {
      this.emitSessionChange(session);
    },
  });

  resetApiService(): void {
    this.useMockService = this.modeStore.shouldUseMockService(getViteEnvValue);
    this.publicSettingsStore.clear();
  }

  subscribeToSessionChanges(listener: SessionChangeListener): () => void {
    this.sessionListeners.add(listener);

    return () => {
      this.sessionListeners.delete(listener);
    };
  }

  getApiServiceStatus(): { useMockService: boolean; reason: string } {
    return this.modeStore.getStatus(this.useMockService);
  }

  canToggleDataMode(): boolean {
    return this.modeStore.canToggleDataMode(getViteEnvValue);
  }

  isNativeApp(): boolean {
    return this.modeStore.isNativeApp();
  }

  private emitSessionChange(session: SessionState) {
    for (const listener of this.sessionListeners) {
      listener(session);
    }
  }

  private ensureSuccess<T>(response: ApiResponse<T>, fallbackMessage: string): T {
    if (!response.success || response.data === undefined) {
      throw new Error(response.error || fallbackMessage);
    }

    return response.data;
  }

  private async runWithCurrentMode<T>({ mock, remote }: ServiceModeHandlers<T>): Promise<T> {
    return this.useMockService ? mock() : remote();
  }

  private async emitResolvedSession(source: Promise<SessionState>): Promise<SessionState> {
    const session = await source;
    this.emitSessionChange(session);
    return session;
  }

  private async requestRemoteData<T>(
    endpoint: string,
    fallbackMessage: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await this.remoteClient.request<T>(endpoint, options);
    return this.ensureSuccess(response, fallbackMessage);
  }

  private async requestDirectRemoteSync(
    baseUrl: string,
    syncToken: string,
    entries: DiaryEntry[],
    lastSyncedAt?: string | null
  ): Promise<RemoteSyncPayload> {
    const response = await fetch(`${normalizeRemoteSyncApiBaseUrl(baseUrl)}/sync`, {
      method: 'POST',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
        'X-Sync-Token': syncToken,
      },
      body: JSON.stringify({
        entries,
        lastSyncedAt: lastSyncedAt ?? undefined,
      }),
    });

    const responsePayload = await parseApiEnvelope<RemoteSyncPayload>(response);

    if (!response.ok || !responsePayload?.success || !responsePayload.data) {
      throw new Error(responsePayload?.error || '同步失败');
    }

    return responsePayload.data;
  }

  private normalizeSettingValue(value: string | boolean | undefined): string | null {
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }

    return value ?? null;
  }

  private async mutateSetting(
    key: string,
    value: string,
    updater: () => Promise<void>
  ): Promise<void> {
    const previousSettings = this.publicSettingsStore.getSnapshot();
    this.publicSettingsStore.clear();

    await updater();
    this.publicSettingsStore.applyMutation(previousSettings, key, value);
  }

  async getSession(): Promise<SessionState> {
    return this.runWithCurrentMode({
      mock: () => this.emitResolvedSession(this.mockService.getSession()),
      remote: () => this.emitResolvedSession(
        this.requestRemoteData<SessionState>('/auth/session', '获取会话状态失败')
      ),
    });
  }

  async loginApp(password: string): Promise<SessionState> {
    return this.runWithCurrentMode({
      mock: () => this.emitResolvedSession(this.mockService.login('app', password)),
      remote: () => this.emitResolvedSession(
        this.requestRemoteData<SessionState>('/auth/login', '应用登录失败', {
          method: 'POST',
          body: JSON.stringify({ scope: 'app', password }),
        })
      ),
    });
  }

  async loginAdmin(password: string): Promise<SessionState> {
    return this.runWithCurrentMode({
      mock: () => this.emitResolvedSession(this.mockService.login('admin', password)),
      remote: () => this.emitResolvedSession(
        this.requestRemoteData<SessionState>('/auth/login', '管理员登录失败', {
          method: 'POST',
          body: JSON.stringify({ scope: 'admin', password }),
        })
      ),
    });
  }

  async logout(): Promise<void> {
    await this.runWithCurrentMode({
      mock: () => this.mockService.logout(),
      remote: async () => {
        const response = await this.remoteClient.request('/auth/logout', {
          method: 'POST',
        });

        if (!response.success) {
          throw new Error(response.error || '退出登录失败');
        }
      },
    });

    this.emitSessionChange(signedOutSession);
  }

  async getAllEntries(): Promise<DiaryEntry[]> {
    return this.runWithCurrentMode({
      mock: () => this.mockService.getAllEntries(),
      remote: () => this.requestRemoteData<DiaryEntry[]>('/entries', '获取日记列表失败'),
    });
  }

  async getEntry(id: number): Promise<DiaryEntry | null> {
    return this.runWithCurrentMode({
      mock: () => this.mockService.getEntry(id),
      remote: async () => {
        const response = await this.remoteClient.request<DiaryEntry>(`/entries/${id}`);
        return response.data || null;
      },
    });
  }

  async createEntry(entry: Omit<DiaryEntry, 'id' | 'created_at' | 'updated_at'>): Promise<DiaryEntry> {
    return this.runWithCurrentMode({
      mock: () => this.mockService.createEntry(entry),
      remote: () => this.requestRemoteData<DiaryEntry>('/entries', '创建日记失败', {
        method: 'POST',
        body: JSON.stringify(entry),
      }),
    });
  }

  async uploadImageWithStatus(file: File): Promise<ImageUploadResult> {
    return this.runWithCurrentMode({
      mock: async () => {
        const url = await this.mockService.uploadImage(file);
        return {
          url,
          storage: inferUploadStorage(url),
        };
      },
      remote: async () => {
        try {
          const formData = new FormData();
          formData.set('file', file, file.name);

          const payload = await this.requestRemoteData<{ url: string }>('/uploads/image', '图片上传失败', {
            method: 'POST',
            body: formData,
          });

          if (!payload.url) {
            throw new Error('图片上传响应无效');
          }

          return {
            url: payload.url,
            storage: inferUploadStorage(payload.url),
          };
        } catch (multipartError) {
          try {
            const dataUrl = await convertFileToDataUrl(file);
            const payload = await this.requestRemoteData<{ url: string }>('/uploads/image', '图片上传失败', {
              method: 'POST',
              body: JSON.stringify({
                dataUrl,
                filename: file.name,
              }),
            });

            if (!payload.url) {
              throw new Error('图片上传响应无效');
            }

            return {
              url: payload.url,
              storage: inferUploadStorage(payload.url),
              warning: multipartError instanceof Error ? multipartError.message : '文件表单上传失败，已改用 base64 上传',
            };
          } catch (jsonFallbackError) {
            debugWarn('远程图片上传失败，回退为内嵌 base64 图片:', jsonFallbackError);
            const fallbackUrl = await convertFileToDataUrl(file);
            const warningMessage = jsonFallbackError instanceof Error
              ? jsonFallbackError.message
              : multipartError instanceof Error
                ? multipartError.message
                : '上传接口失败';

            return {
              url: fallbackUrl,
              storage: 'embedded',
              warning: warningMessage,
            };
          }
        }
      },
    });
  }

  async uploadImage(file: File): Promise<string> {
    const result = await this.uploadImageWithStatus(file);
    return result.url;
  }

  async runR2SelfCheck(): Promise<R2SelfCheckResult> {
    return this.runWithCurrentMode({
      mock: async () => ({
        bucketBindingPresent: false,
        canWrite: false,
        canRead: false,
        canDelete: false,
        readBackMatches: false,
        testedKey: null,
        keyPrefix: 'diary/',
        message: '当前处于本地模式，未连接 Cloudflare R2',
      }),
      remote: () => this.requestRemoteData<R2SelfCheckResult>('/diagnostics/r2', 'R2 自检失败'),
    });
  }

  async updateEntry(id: number, entry: Partial<DiaryEntry>): Promise<DiaryEntry> {
    return this.runWithCurrentMode({
      mock: () => this.mockService.updateEntry(id, entry),
      remote: () => this.requestRemoteData<DiaryEntry>(`/entries/${id}`, '更新日记失败', {
        method: 'PUT',
        body: JSON.stringify(entry),
      }),
    });
  }

  async toggleEntryVisibility(id: number): Promise<DiaryEntry> {
    return this.runWithCurrentMode({
      mock: async () => {
        const current = await this.mockService.getEntry(id);
        if (!current) {
          throw new Error('日记不存在');
        }

        return this.mockService.updateEntry(id, { hidden: !current.hidden });
      },
      remote: () => this.requestRemoteData<DiaryEntry>(`/entries/${id}/toggle-visibility`, '切换隐藏状态失败', {
        method: 'POST',
      }),
    });
  }

  async deleteEntry(id: number): Promise<void> {
    if (this.useMockService) {
      return this.mockService.deleteEntry(id);
    }

    try {
      await withRetry(async () => {
        const response = await this.remoteClient.request(`/entries/${id}`, {
          method: 'DELETE',
        });

        if (!response.success) {
          throw new Error(response.error || '删除失败');
        }
      }, { maxRetries: 2, baseDelay: 100 });

      const isDeleted = await verifyDeletion(async () => {
        try {
          await this.remoteClient.request(`/entries/${id}`);
          return false;
        } catch (error) {
          return error instanceof ApiRequestError && error.status === 404;
        }
      }, { maxRetries: 5, baseDelay: 200 });

      if (!isDeleted) {
        throw new Error('删除操作未能完全同步，请稍后重试');
      }
    } catch (error) {
      const errorMessage = getConsistencyErrorMessage(error instanceof Error ? error : new Error(String(error)));
      throw new Error(errorMessage);
    }
  }

  async batchImportEntries(entries: DiaryEntry[], options?: { overwrite?: boolean }): Promise<DiaryEntry[]> {
    return this.runWithCurrentMode({
      mock: () => this.mockService.batchImportEntries(entries, options),
      remote: () => this.requestRemoteData<DiaryEntry[]>('/entries/batch', '批量导入失败', {
        method: 'POST',
        body: JSON.stringify({ entries, options }),
      }),
    });
  }

  async batchUpdateEntries(entries: DiaryEntry[]): Promise<DiaryEntry[]> {
    return this.runWithCurrentMode({
      mock: () => this.mockService.batchUpdateEntries(entries),
      remote: () => this.requestRemoteData<DiaryEntry[]>('/entries/batch', '批量更新失败', {
        method: 'PUT',
        body: JSON.stringify({ entries }),
      }),
    });
  }

  async getPublicSettings(): Promise<PublicSettingsResponse> {
    const cachedSettings = this.publicSettingsStore.getCached();
    if (cachedSettings) {
      return cachedSettings;
    }

    const pendingRequest = this.publicSettingsStore.getPending();
    if (pendingRequest) {
      return pendingRequest;
    }

    if (this.useMockService) {
      const settings = await this.mockService.getPublicSettings();
      return this.publicSettingsStore.remember(settings);
    }

    return this.publicSettingsStore.track(
      this.remoteClient.request<PublicSettingsResponse>('/settings')
        .then((response) => this.publicSettingsStore.remember(
          this.ensureSuccess(response, '获取公开设置失败')
        ))
    );
  }

  async getAdminSettings(): Promise<AdminSettingsResponse> {
    return this.runWithCurrentMode({
      mock: () => this.mockService.getAdminSettings(),
      remote: () => this.requestRemoteData<AdminSettingsResponse>('/settings/admin', '获取管理员设置失败'),
    });
  }

  async getSetting(key: string): Promise<string | null> {
    return this.runWithCurrentMode({
      mock: () => this.mockService.getSetting(key),
      remote: async () => {
        const data = await this.requestRemoteData<Record<string, string | boolean>>(`/settings/${key}`, '获取设置失败');
        return this.normalizeSettingValue(data[key]);
      },
    });
  }

  async setSetting(key: string, value: string): Promise<void> {
    return this.mutateSetting(key, value, () =>
      this.runWithCurrentMode({
        mock: () => this.mockService.setSetting(key, value),
        remote: async () => {
          const response = await this.remoteClient.request(`/settings/${key}`, {
            method: 'PUT',
            body: JSON.stringify({ value }),
          });

          if (!response.success) {
            throw new Error(response.error || '设置更新失败');
          }
        },
      })
    );
  }

  async getAdminAccessProfile(): Promise<AdminAccessProfile> {
    if (this.useMockService) {
      return this.mockService.getAdminAccessProfile();
    }

    return {
      mode: 'remote',
      requiresPassword: true,
      remoteBound: false,
      remoteSyncConfigured: false,
      remoteSyncBaseUrl: '',
    };
  }

  private async verifyRemoteAdminPassword(apiBaseUrl: string, adminPassword: string): Promise<void> {
    const response = await fetch(`${apiBaseUrl}/auth/login`, {
      method: 'POST',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scope: 'admin',
        password: adminPassword,
      }),
    });
    const payload = await parseApiEnvelope<{ isAuthenticated: boolean; isAdminAuthenticated: boolean }>(response);

    if (!response.ok || !payload?.success) {
      throw new Error(payload?.error || '远程管理员验证失败');
    }
  }

  async bindRemoteAdmin(config: RemoteBindingInput): Promise<void> {
    if (!this.useMockService) {
      throw new Error('当前处于远程数据模式，无法执行 APK 远程绑定');
    }

    const baseUrl = normalizeRemoteSyncBaseUrl(config.baseUrl);
    const syncToken = config.syncToken.trim();
    const adminPassword = config.adminPassword.trim();

    if (!baseUrl) {
      throw new Error('请先填写同步地址');
    }

    if (!syncToken) {
      throw new Error('请先填写同步令牌');
    }

    if (!adminPassword) {
      throw new Error('请输入远程管理员密码');
    }

    const apiBaseUrl = normalizeRemoteSyncApiBaseUrl(baseUrl);
    await this.verifyRemoteAdminPassword(apiBaseUrl, adminPassword);

    const bindingEntries = config.syncLocalEntries
      ? await this.mockService.getAllLocalEntriesForBinding()
      : [];
    const snapshot = await this.requestDirectRemoteSync(baseUrl, syncToken, bindingEntries);

    await this.mockService.bindRemoteAdmin({
      baseUrl,
      syncToken,
      adminPassword,
    });
    await this.mockService.applyRemoteSyncSnapshot(snapshot.entries, snapshot.syncedAt);
    await this.emitResolvedSession(this.mockService.login('admin', adminPassword));
  }

  async unbindRemoteAdmin(): Promise<void> {
    if (!this.useMockService) {
      throw new Error('当前处于远程数据模式，无法解除 APK 远程绑定');
    }

    await this.mockService.unbindRemoteAdmin();
  }

  enableLocalMode(): void {
    this.useMockService = true;
    this.publicSettingsStore.clear();
    this.modeStore.enableLocalMode();
  }

  enableRemoteMode(): void {
    this.useMockService = false;
    this.publicSettingsStore.clear();
    this.modeStore.enableRemoteMode();
  }

  getCurrentMode(): 'local' | 'remote' {
    return this.useMockService ? 'local' : 'remote';
  }

  clearLocalData(): void {
    this.mockService = new MockApiService();
    this.publicSettingsStore.clear();
    this.modeStore.clearLocalData();
  }

  setDefaultDataEnabled(enabled: boolean): void {
    this.modeStore.setDefaultDataEnabled(enabled);
  }

  async getStats(apiKey?: string): Promise<DiaryStats> {
    return this.runWithCurrentMode({
      mock: () => this.mockService.getStats(apiKey),
      remote: () => {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        if (apiKey) {
          headers['X-API-Key'] = apiKey;
        }

        return this.requestRemoteData<DiaryStats>('/stats', '获取统计信息失败', { headers });
      },
    });
  }

  async getStatsWithKey(apiKey: string): Promise<DiaryStats> {
    return this.getStats(apiKey);
  }

  async getLocalSyncStatus(): Promise<DiarySyncStatus> {
    return this.mockService.getLocalSyncStatus();
  }

  async getPendingLocalSyncEntries(): Promise<DiaryEntry[]> {
    return this.mockService.getPendingLocalSyncEntries();
  }

  async markLocalEntriesSynced(entryUuids: string[], syncedAt?: string): Promise<void> {
    await this.mockService.markLocalEntriesSynced(entryUuids, syncedAt);
  }

  async getRemoteSyncConfig(): Promise<RemoteSyncConfig> {
    return this.mockService.getRemoteSyncConfig();
  }

  async getRemoteBindingDefaults(): Promise<RemoteSyncConfig> {
    if (!this.useMockService) {
      return {
        baseUrl: '',
        syncToken: '',
      };
    }

    return this.mockService.getRemoteBindingDefaults();
  }

  async saveRemoteSyncConfig(config: RemoteSyncConfig): Promise<void> {
    const normalizedConfig: RemoteSyncConfig = {
      baseUrl: normalizeRemoteSyncBaseUrl(config.baseUrl),
      syncToken: config.syncToken.trim(),
    };

    if (normalizedConfig.baseUrl) {
      normalizeRemoteSyncApiBaseUrl(normalizedConfig.baseUrl);
    }

    await this.mockService.saveRemoteSyncConfig(normalizedConfig);
  }

  async syncLocalEntriesToRemote(): Promise<SyncRemoteResult> {
    const localSyncStatus = await this.mockService.getLocalSyncStatus();
    const pendingEntries = await this.mockService.getPendingLocalSyncEntries();
    const remoteSyncConfig = await this.mockService.getRemoteSyncConfig();
    let payload: RemoteSyncPayload;

    if (remoteSyncConfig.baseUrl.trim()) {
      if (!remoteSyncConfig.syncToken.trim()) {
        throw new Error('请先填写同步令牌');
      }

      payload = await this.requestDirectRemoteSync(
        remoteSyncConfig.baseUrl,
        remoteSyncConfig.syncToken,
        pendingEntries,
        localSyncStatus.lastSyncedAt
      );
    } else {
      try {
        payload = this.ensureSuccess(
          await this.remoteClient.request<RemoteSyncPayload>('/sync', {
            method: 'POST',
            body: JSON.stringify({
              entries: pendingEntries,
              lastSyncedAt: localSyncStatus.lastSyncedAt ?? undefined,
            }),
          }),
          '同步失败'
        );
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 401) {
          throw new Error('云端管理员会话已失效，请先切到远程模式登录管理员后再执行同步');
        }

        throw error;
      }
    }

    await this.mockService.markLocalEntriesSynced(payload.confirmedEntryUuids ?? [], payload.syncedAt);
    await this.mockService.applyIncrementalRemoteSync(payload.entries, payload.syncedAt);

    return {
      ...payload,
      pendingCount: pendingEntries.length,
      remoteCount: payload.entries.length,
    };
  }
}

export const apiService = new ApiService();
