import type { DiaryEntry, ApiResponse, DiaryStats } from '../types/index.ts';
import type { AdminSettingsResponse, PublicSettingsResponse, SessionState } from './apiTypes.ts';
import { ApiModeStore } from './apiModeStore.ts';
import { MockApiService } from './mockApiService.ts';
import { PublicSettingsStore } from './publicSettingsStore.ts';
import { ApiRequestError, RemoteApiClient } from './remoteApiClient.ts';
import { withRetry, verifyDeletion, getConsistencyErrorMessage } from '../utils/d1Utils.ts';
import { debugWarn } from '../utils/logger.ts';

function getViteEnvValue(key: 'MODE' | 'VITE_USE_MOCK_API'): string | undefined {
  return import.meta.env?.[key];
}

type SessionChangeListener = (session: SessionState) => void;
type ServiceModeHandlers<T> = {
  mock: () => Promise<T>;
  remote: () => Promise<T>;
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

  async uploadImage(file: File): Promise<string> {
    return this.runWithCurrentMode({
      mock: () => this.mockService.uploadImage(file),
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

          return payload.url;
        } catch (error) {
          debugWarn('远程图片上传失败，回退为内嵌 base64 图片:', error);
          return convertFileToDataUrl(file);
        }
      },
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
}

export const apiService = new ApiService();
