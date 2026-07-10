import type { DiaryEntry, ApiResponse, DiaryStats } from '../types/index.ts';
import type {
  AdminAccessProfile,
  AdminSettingsResponse,
  PublicSettingsResponse,
  RemoteBindingInput,
  SessionState,
} from './apiTypes.ts';
import { ApiModeStore } from './apiModeStore.ts';
import { normalizeDiaryEntry, type DiarySyncStatus } from './entrySync.ts';
import { MockApiService } from './mockApiService.ts';
import { PublicSettingsStore } from './publicSettingsStore.ts';
import { ApiRequestError, RemoteApiClient } from './remoteApiClient.ts';
import { withRetry, verifyDeletion, getConsistencyErrorMessage } from '../utils/d1Utils.ts';
import { isPersistedDiaryEntryId } from '../utils/diaryEntryIdentity.ts';
import { isValidImageSource } from '../utils/imageSourceValidation.ts';
import { prepareImageForUpload } from '../utils/imageUploadCompression.ts';
import { debugWarn } from '../utils/logger.ts';
import { parseTimeString } from '../utils/timestampUtils.ts';

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

const DIRECT_REMOTE_REQUEST_TIMEOUT_MS = 15_000;
const FILE_TO_DATA_URL_TIMEOUT_MS = 15_000;

const publicSettingsResponseFields = [
  'passwordProtectionEnabled',
  'readingDeskEnabled',
  'quickFiltersEnabled',
  'exportEnabled',
  'archiveViewEnabled',
  'welcomePageEnabled',
  'recommendationsEnabled',
  'browseStatusEnabled',
  'deviceStatusEnabled',
] as const satisfies readonly (keyof PublicSettingsResponse)[];

const adminSettingsResponseFields = [
  ...publicSettingsResponseFields,
  'adminPasswordConfigured',
  'appPasswordConfigured',
  'syncAccessTokenConfigured',
] as const satisfies readonly (keyof AdminSettingsResponse)[];

function encodeBytesToBase64(bytes: Uint8Array) {
  let binary = '';

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }

  return btoa(binary);
}

async function readFileArrayBufferWithTimeout(file: File): Promise<ArrayBuffer> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('图片读取超时，请重新选择文件后再试'));
    }, FILE_TO_DATA_URL_TIMEOUT_MS);
  });

  try {
    return await Promise.race([
      file.arrayBuffer(),
      timeoutPromise,
    ]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

async function convertFileToDataUrl(file: File): Promise<string> {
  const bytes = new Uint8Array(await readFileArrayBufferWithTimeout(file));
  if (bytes.byteLength === 0) {
    throw new Error('图片文件为空');
  }

  // 图片文件必须具有有效的 MIME 类型；回退到 image/png 而非 application/octet-stream
  // 以确保生成的 data URL 通过 isValidImageSource 校验
  const contentType = file.type && file.type.startsWith('image/') ? file.type : 'image/png';
  return `data:${contentType};base64,${encodeBytesToBase64(bytes)}`;
}

async function fetchDirectRemote(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMessage: string
) {
  const abortController = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    abortController.abort();
  }, DIRECT_REMOTE_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: abortController.signal,
    });
  } catch (error) {
    if (timedOut) {
      throw new Error(timeoutMessage);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function inferUploadStorage(url: string): ImageUploadStorage {
  if (url.toLowerCase().startsWith('data:image/')) {
    return 'embedded';
  }

  if (url.includes('/api/images/')) {
    return 'r2';
  }

  return 'external';
}

function normalizeRemoteSyncApiBaseUrl(rawBaseUrl: string): string {
  const normalizedBaseUrl = normalizeRemoteSyncBaseUrl(rawBaseUrl);
  if (!normalizedBaseUrl) {
    throw new Error('请先填写同步地址');
  }

  return normalizedBaseUrl.endsWith('/api') ? normalizedBaseUrl : `${normalizedBaseUrl}/api`;
}

function normalizeRemoteSyncBaseUrl(rawBaseUrl: string): string {
  const trimmedValue = rawBaseUrl.trim();
  if (!trimmedValue) {
    return '';
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmedValue);
  } catch {
    throw new Error('同步地址必须是完整的 http(s) 地址');
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('同步地址仅支持 http 或 https');
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new Error('同步地址不能包含用户名或密码');
  }

  parsedUrl.search = '';
  parsedUrl.hash = '';
  return parsedUrl.toString().replace(/\/+$/, '');
}

function assertPersistedEntryId(id: number): void {
  if (!isPersistedDiaryEntryId(id)) {
    throw new Error('日记 ID 无效');
  }
}

async function parseApiEnvelope<T>(response: Response): Promise<ApiEnvelope<T> | null> {
  try {
    return await response.json() as ApiEnvelope<T>;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getNonEmptyStringField(payload: unknown, key: 'error' | 'message'): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  const value = payload[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function getApiErrorMessage(payload: unknown, fallbackMessage: string): string {
  const errorMessage = getNonEmptyStringField(payload, 'error');
  if (errorMessage) {
    return errorMessage;
  }

  return isRecord(payload) && payload.success === false
    ? getNonEmptyStringField(payload, 'message') ?? fallbackMessage
    : fallbackMessage;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringOrNull(value: unknown): value is string | null {
  return typeof value === 'string' || value === null;
}

function isValidStatsTime(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && parseTimeString(value) !== null);
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
    if (response.success !== true || response.data === undefined) {
      throw new Error(getApiErrorMessage(response, fallbackMessage));
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

  private normalizeRemoteSessionState(session: unknown, fallbackMessage: string): SessionState {
    if (
      !isRecord(session)
      || typeof session.isAuthenticated !== 'boolean'
      || typeof session.isAdminAuthenticated !== 'boolean'
    ) {
      throw new Error(fallbackMessage);
    }

    return {
      isAuthenticated: session.isAuthenticated,
      isAdminAuthenticated: session.isAdminAuthenticated,
    };
  }

  private normalizeBooleanFieldRecord<T extends object>(
    payload: unknown,
    fields: readonly (keyof T)[],
    fallbackMessage: string
  ): T {
    if (!isRecord(payload) || fields.some((field) => typeof payload[field as string] !== 'boolean')) {
      throw new Error(fallbackMessage);
    }

    const normalized = {} as Partial<T>;
    for (const field of fields) {
      normalized[field] = payload[field as string] as T[keyof T];
    }

    return normalized as T;
  }

  private normalizeRemotePublicSettings(settings: unknown): PublicSettingsResponse {
    return this.normalizeBooleanFieldRecord<PublicSettingsResponse>(
      settings,
      publicSettingsResponseFields,
      '公开设置响应格式无效'
    );
  }

  private normalizeRemoteAdminSettings(settings: unknown): AdminSettingsResponse {
    return this.normalizeBooleanFieldRecord<AdminSettingsResponse>(
      settings,
      adminSettingsResponseFields,
      '管理员设置响应格式无效'
    );
  }

  private normalizeRemoteDiaryStats(stats: unknown): DiaryStats {
    if (
      !isRecord(stats)
      || !isNonNegativeInteger(stats.consecutive_days)
      || !isNonNegativeInteger(stats.total_days_with_entries)
      || !isNonNegativeInteger(stats.total_entries)
      || !isValidStatsTime(stats.latest_entry_date)
      || !isValidStatsTime(stats.first_entry_date)
      || !isValidStatsTime(stats.current_streak_start)
    ) {
      throw new Error('统计响应格式无效');
    }

    return {
      consecutive_days: stats.consecutive_days,
      total_days_with_entries: stats.total_days_with_entries,
      total_entries: stats.total_entries,
      latest_entry_date: stats.latest_entry_date,
      first_entry_date: stats.first_entry_date,
      current_streak_start: stats.current_streak_start,
    };
  }

  private normalizeRemoteR2SelfCheckResult(result: unknown): R2SelfCheckResult {
    if (
      !isRecord(result)
      || typeof result.bucketBindingPresent !== 'boolean'
      || typeof result.canWrite !== 'boolean'
      || typeof result.canRead !== 'boolean'
      || typeof result.canDelete !== 'boolean'
      || typeof result.readBackMatches !== 'boolean'
      || !isStringOrNull(result.testedKey)
      || typeof result.keyPrefix !== 'string'
      || typeof result.message !== 'string'
    ) {
      throw new Error('R2 自检响应格式无效');
    }

    return {
      bucketBindingPresent: result.bucketBindingPresent,
      canWrite: result.canWrite,
      canRead: result.canRead,
      canDelete: result.canDelete,
      readBackMatches: result.readBackMatches,
      testedKey: result.testedKey,
      keyPrefix: result.keyPrefix,
      message: result.message,
    };
  }

  private normalizeRemoteDiaryEntry(entry: unknown, fallbackMessage: string): DiaryEntry {
    if (!isRecord(entry)) {
      throw new Error(fallbackMessage);
    }

    return normalizeDiaryEntry(entry as unknown as DiaryEntry);
  }

  private normalizeOptionalRemoteDiaryEntry(entry: unknown, fallbackMessage: string): DiaryEntry | null {
    if (entry === null || entry === undefined) {
      return null;
    }

    return this.normalizeRemoteDiaryEntry(entry, fallbackMessage);
  }

  private normalizeRemoteDiaryEntries(entries: unknown, fallbackMessage: string): DiaryEntry[] {
    if (!Array.isArray(entries)) {
      throw new Error(fallbackMessage);
    }

    return entries.map((entry) => this.normalizeRemoteDiaryEntry(entry, fallbackMessage));
  }

  private normalizeRequiredRemoteSyncTimestamp(value: unknown, fallbackMessage: string): string {
    if (!isNonEmptyString(value)) {
      throw new Error(fallbackMessage);
    }

    const normalizedValue = value.trim();
    if (parseTimeString(normalizedValue) === null) {
      throw new Error(fallbackMessage);
    }

    return normalizedValue;
  }

  private normalizeOptionalRemoteSyncTimestamp(value: unknown, fallbackMessage: string): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    return this.normalizeRequiredRemoteSyncTimestamp(value, fallbackMessage);
  }

  private normalizeRemoteSyncEntries(entries: unknown, fallbackMessage: string): DiaryEntry[] {
    if (!Array.isArray(entries)) {
      throw new Error(fallbackMessage);
    }

    return entries.map((entry) => {
      if (!isRecord(entry) || !isNonEmptyString(entry.entry_uuid)) {
        throw new Error(fallbackMessage);
      }

      return this.normalizeRemoteDiaryEntry({
        ...entry,
        entry_uuid: entry.entry_uuid.trim(),
        created_at: this.normalizeRequiredRemoteSyncTimestamp(entry.created_at, fallbackMessage),
        updated_at: this.normalizeRequiredRemoteSyncTimestamp(entry.updated_at, fallbackMessage),
        deleted_at: this.normalizeOptionalRemoteSyncTimestamp(entry.deleted_at, fallbackMessage),
      }, fallbackMessage);
    });
  }

  private normalizeRemoteSyncPayload(payload: unknown, fallbackMessage: string): RemoteSyncPayload {
    if (!isRecord(payload)) {
      throw new Error(fallbackMessage);
    }

    const {
      entries,
      pushedCount,
      deletedCount,
      confirmedEntryUuids,
      syncedAt,
    } = payload;
    const normalizedSyncedAt = isNonEmptyString(syncedAt) ? syncedAt.trim() : '';
    let normalizedConfirmedEntryUuids: string[] | undefined;

    if (confirmedEntryUuids !== undefined) {
      if (!Array.isArray(confirmedEntryUuids)) {
        throw new Error(fallbackMessage);
      }

      normalizedConfirmedEntryUuids = [];
      for (const entryUuid of confirmedEntryUuids) {
        if (!isNonEmptyString(entryUuid)) {
          throw new Error(fallbackMessage);
        }

        normalizedConfirmedEntryUuids.push(entryUuid.trim());
      }
    }

    if (
      !Array.isArray(entries)
      || !isNonNegativeInteger(pushedCount)
      || !isNonNegativeInteger(deletedCount)
      || !normalizedSyncedAt
      || parseTimeString(normalizedSyncedAt) === null
    ) {
      throw new Error(fallbackMessage);
    }

    return {
      entries: this.normalizeRemoteSyncEntries(entries, fallbackMessage),
      pushedCount,
      deletedCount,
      confirmedEntryUuids: normalizedConfirmedEntryUuids,
      syncedAt: normalizedSyncedAt,
    };
  }

  private normalizeUploadedImageUrl(payload: unknown): string {
    const url = isRecord(payload) ? payload.url : undefined;
    if (!isValidImageSource(url)) {
      throw new Error('图片上传响应无效');
    }

    return url;
  }

  private async requestDirectRemoteSync(
    baseUrl: string,
    syncToken: string,
    entries: DiaryEntry[],
    lastSyncedAt?: string | null
  ): Promise<RemoteSyncPayload> {
    const response = await fetchDirectRemote(`${normalizeRemoteSyncApiBaseUrl(baseUrl)}/sync`, {
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
    }, '同步请求超时，请稍后重试');

    const responsePayload = await parseApiEnvelope<RemoteSyncPayload>(response);

    if (!response.ok || responsePayload?.success !== true || responsePayload.data === undefined) {
      throw new Error(getApiErrorMessage(responsePayload, '同步失败'));
    }

    return this.normalizeRemoteSyncPayload(responsePayload.data, '同步响应格式无效');
  }

  private normalizeSettingValue(value: string | boolean | null | undefined): string | null {
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }

    return value ?? null;
  }

  private normalizeRemoteSettingValue(payload: unknown, key: string): string | null {
    if (!isRecord(payload) || !(key in payload)) {
      throw new Error('设置响应格式无效');
    }

    const value = payload[key];
    if (value !== null && typeof value !== 'string' && typeof value !== 'boolean') {
      throw new Error('设置响应格式无效');
    }

    return this.normalizeSettingValue(value);
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
          .then((session) => this.normalizeRemoteSessionState(session, '会话状态响应格式无效'))
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
        }).then((session) => this.normalizeRemoteSessionState(session, '登录响应格式无效'))
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
        }).then((session) => this.normalizeRemoteSessionState(session, '登录响应格式无效'))
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

        if (response.success !== true) {
          throw new Error(getApiErrorMessage(response, '退出登录失败'));
        }
      },
    });

    this.emitSessionChange(signedOutSession);
  }

  async getAllEntries(): Promise<DiaryEntry[]> {
    return this.runWithCurrentMode({
      mock: () => this.mockService.getAllEntries(),
      remote: async () => this.normalizeRemoteDiaryEntries(
        await this.requestRemoteData<DiaryEntry[]>('/entries', '获取日记列表失败'),
        '日记列表响应格式无效'
      ),
    });
  }

  async getEntry(id: number): Promise<DiaryEntry | null> {
    assertPersistedEntryId(id);

    return this.runWithCurrentMode({
      mock: () => this.mockService.getEntry(id),
      remote: async () => {
        const response = await this.remoteClient.request<DiaryEntry>(`/entries/${id}`);
        if (response.success !== true) {
          throw new Error(getApiErrorMessage(response, '获取日记失败'));
        }

        return this.normalizeOptionalRemoteDiaryEntry(response.data, '日记响应格式无效');
      },
    });
  }

  async createEntry(entry: Omit<DiaryEntry, 'id' | 'created_at' | 'updated_at'>): Promise<DiaryEntry> {
    return this.runWithCurrentMode({
      mock: () => this.mockService.createEntry(entry),
      remote: async () => this.normalizeRemoteDiaryEntry(
        await this.requestRemoteData<DiaryEntry>('/entries', '创建日记失败', {
          method: 'POST',
          body: JSON.stringify(entry),
        }),
        '创建日记响应格式无效'
      ),
    });
  }

  async uploadImageWithStatus(file: File): Promise<ImageUploadResult> {
    const preparedFile = await prepareImageForUpload(file);

    return this.runWithCurrentMode({
      mock: async () => {
        const url = await this.mockService.uploadImage(preparedFile);
        return {
          url,
          storage: inferUploadStorage(url),
        };
      },
      remote: async () => {
        try {
          const formData = new FormData();
          formData.set('file', preparedFile, preparedFile.name);

          const payload = await this.requestRemoteData<{ url: string }>('/uploads/image', '图片上传失败', {
            method: 'POST',
            body: formData,
          });

          const uploadedUrl = this.normalizeUploadedImageUrl(payload);

          return {
            url: uploadedUrl,
            storage: inferUploadStorage(uploadedUrl),
          };
        } catch (multipartError) {
          let dataUrl: string | null = null;

          try {
            dataUrl = await convertFileToDataUrl(preparedFile);
            const payload = await this.requestRemoteData<{ url: string }>('/uploads/image', '图片上传失败', {
              method: 'POST',
              body: JSON.stringify({
                dataUrl,
                filename: preparedFile.name,
              }),
            });

            const uploadedUrl = this.normalizeUploadedImageUrl(payload);

            return {
              url: uploadedUrl,
              storage: inferUploadStorage(uploadedUrl),
              warning: multipartError instanceof Error ? multipartError.message : '文件表单上传失败，已改用 base64 上传',
            };
          } catch (jsonFallbackError) {
            debugWarn('远程图片上传失败，回退为内嵌 base64 图片:', jsonFallbackError);
            if (!dataUrl) {
              throw jsonFallbackError;
            }

            const warningMessage = jsonFallbackError instanceof Error
              ? jsonFallbackError.message
              : multipartError instanceof Error
                ? multipartError.message
                : '上传接口失败';

            return {
              url: dataUrl,
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
      remote: async () => this.normalizeRemoteR2SelfCheckResult(
        await this.requestRemoteData<R2SelfCheckResult>('/diagnostics/r2', 'R2 自检失败')
      ),
    });
  }

  async updateEntry(id: number, entry: Partial<DiaryEntry>): Promise<DiaryEntry> {
    assertPersistedEntryId(id);

    return this.runWithCurrentMode({
      mock: () => this.mockService.updateEntry(id, entry),
      remote: async () => this.normalizeRemoteDiaryEntry(
        await this.requestRemoteData<DiaryEntry>(`/entries/${id}`, '更新日记失败', {
          method: 'PUT',
          body: JSON.stringify(entry),
        }),
        '更新日记响应格式无效'
      ),
    });
  }

  async toggleEntryVisibility(id: number): Promise<DiaryEntry> {
    assertPersistedEntryId(id);

    return this.runWithCurrentMode({
      mock: async () => {
        const current = await this.mockService.getEntry(id);
        if (!current) {
          throw new Error('日记不存在');
        }

        return this.mockService.updateEntry(id, { hidden: !current.hidden });
      },
      remote: async () => this.normalizeRemoteDiaryEntry(
        await this.requestRemoteData<DiaryEntry>(`/entries/${id}/toggle-visibility`, '切换隐藏状态失败', {
          method: 'POST',
        }),
        '切换隐藏状态响应格式无效'
      ),
    });
  }

  async deleteEntry(id: number): Promise<void> {
    assertPersistedEntryId(id);

    if (this.useMockService) {
      return this.mockService.deleteEntry(id);
    }

    try {
      await withRetry(async () => {
        const response = await this.remoteClient.request(`/entries/${id}`, {
          method: 'DELETE',
        });

          if (response.success !== true) {
            throw new Error(getApiErrorMessage(response, '删除失败'));
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
      remote: async () => this.normalizeRemoteDiaryEntries(
        await this.requestRemoteData<DiaryEntry[]>('/entries/batch', '批量导入失败', {
          method: 'POST',
          body: JSON.stringify({ entries, options }),
        }),
        '批量导入响应格式无效'
      ),
    });
  }

  async batchUpdateEntries(entries: DiaryEntry[]): Promise<DiaryEntry[]> {
    return this.runWithCurrentMode({
      mock: () => this.mockService.batchUpdateEntries(entries),
      remote: async () => this.normalizeRemoteDiaryEntries(
        await this.requestRemoteData<DiaryEntry[]>('/entries/batch', '批量更新失败', {
          method: 'PUT',
          body: JSON.stringify({ entries }),
        }),
        '批量更新响应格式无效'
      ),
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
          this.normalizeRemotePublicSettings(this.ensureSuccess(response, '获取公开设置失败'))
        ))
    );
  }

  async getAdminSettings(): Promise<AdminSettingsResponse> {
    return this.runWithCurrentMode({
      mock: () => this.mockService.getAdminSettings(),
      remote: async () => this.normalizeRemoteAdminSettings(
        await this.requestRemoteData<AdminSettingsResponse>('/settings/admin', '获取管理员设置失败')
      ),
    });
  }

  async getSetting(key: string): Promise<string | null> {
    return this.runWithCurrentMode({
      mock: () => this.mockService.getSetting(key),
      remote: async () => {
        const data = await this.requestRemoteData<Record<string, string | boolean | null>>(`/settings/${key}`, '获取设置失败');
        return this.normalizeRemoteSettingValue(data, key);
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

          if (response.success !== true) {
            throw new Error(getApiErrorMessage(response, '设置更新失败'));
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
    const response = await fetchDirectRemote(`${apiBaseUrl}/auth/login`, {
      method: 'POST',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scope: 'admin',
        password: adminPassword,
      }),
    }, '远程管理员验证超时，请稍后重试');
    const payload = await parseApiEnvelope<{ isAuthenticated: boolean; isAdminAuthenticated: boolean }>(response);

    if (!response.ok || payload?.success !== true) {
      throw new Error(getApiErrorMessage(payload, '远程管理员验证失败'));
    }

    const session = this.normalizeRemoteSessionState(payload.data, '远程管理员验证响应格式无效');
    if (!session.isAuthenticated || !session.isAdminAuthenticated) {
      throw new Error('远程管理员验证失败');
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
    this.modeStore.enableLocalMode();
    this.useMockService = true;
    this.publicSettingsStore.clear();
  }

  enableRemoteMode(): void {
    this.modeStore.enableRemoteMode();
    this.useMockService = false;
    this.publicSettingsStore.clear();
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

        return this.requestRemoteData<DiaryStats>('/stats', '获取统计信息失败', { headers })
          .then((stats) => this.normalizeRemoteDiaryStats(stats));
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
        payload = this.normalizeRemoteSyncPayload(
          this.ensureSuccess(
            await this.remoteClient.request<RemoteSyncPayload>('/sync', {
              method: 'POST',
              body: JSON.stringify({
                entries: pendingEntries,
                lastSyncedAt: localSyncStatus.lastSyncedAt ?? undefined,
              }),
            }),
            '同步失败'
          ),
          '同步响应格式无效'
        );
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 401) {
          throw new Error('云端管理员会话已失效，请先切到远程模式登录管理员后再执行同步');
        }

        throw error;
      }
    }

    const normalizedRemoteEntries = payload.entries;
    await this.mockService.applyRemoteSyncResult(
      pendingEntries,
      payload.confirmedEntryUuids ?? [],
      normalizedRemoteEntries,
      payload.syncedAt
    );

    return {
      ...payload,
      entries: normalizedRemoteEntries,
      pendingCount: pendingEntries.length,
      remoteCount: normalizedRemoteEntries.length,
    };
  }
}

export const apiService = new ApiService();
