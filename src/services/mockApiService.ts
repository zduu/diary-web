import type { DiaryEntry, DiaryStats } from '../types/index.ts';
import type {
  AdminAccessProfile,
  AdminSettingsResponse,
  PublicSettingsResponse,
  SessionState,
} from './apiTypes.ts';
import { LocalDataStore } from './localDataStore.ts';
import {
  createPublicSettingsResponse,
  getPublicBooleanSettingStoredValue,
  isStoredBooleanString,
  isPublicBooleanSettingKey,
} from './publicSettingsSchema.ts';
import {
  applyDiarySyncResult,
  applyIncrementalRemoteEntries,
  buildDiarySyncStatus,
  createLocallyCreatedDiaryEntry,
  isDiaryEntryDeleted,
  listPendingSyncEntries,
  markDiaryEntriesSynced,
  markDiaryEntryDeletedLocally,
  markDiaryEntryUpdatedLocally,
  normalizeDiaryEntry,
  type DiarySyncStatus,
} from './entrySync.ts';
import {
  MAX_ENTRY_CONTENT_LENGTH,
  MAX_ENTRY_MOOD_LENGTH,
  MAX_ENTRY_TITLE_LENGTH,
  MAX_ENTRY_WEATHER_LENGTH,
  isValidEntryTags,
  isWithinMaxLength,
  sanitizeEntryHidden,
} from '../utils/entryTextValidation.ts';
import { getValidEntryDateRange, sortDiaryEntriesByTime } from '../utils/entryTime.ts';
import { isValidImageSourceArray, MAX_ENTRY_IMAGE_DATA_URL_LENGTH } from '../utils/imageSourceValidation.ts';
import { isRecord, isValidLocationInfo, parseEntriesBackupData } from '../utils/importUtils.ts';
import { isNativeAppRuntime } from '../utils/nativePlatform.ts';
import { parseTimeString } from '../utils/timestampUtils.ts';

const DEFAULT_APP_TIME_ZONE = 'Asia/Shanghai';
const LOCAL_PASSWORD_HASH_PREFIX = 'sha256';
const MOCK_IMAGE_READ_TIMEOUT_MS = 15_000;
// 本地模式图片以 data URL 形式入库：二进制上限由 data URL 字符上限反推
// （base64 膨胀 4/3，预留 64 字符给 data:image/...;base64, 前缀），约 9MB
const MOCK_IMAGE_MAX_BINARY_BYTES = Math.floor((MAX_ENTRY_IMAGE_DATA_URL_LENGTH - 64) / 4) * 3;
const MOCK_IMAGE_MAX_SIZE_LABEL = `${Math.floor(MOCK_IMAGE_MAX_BINARY_BYTES / (1024 * 1024))}MB`;
const textEncoder = new TextEncoder();

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = textEncoder.encode(left);
  const rightBytes = textEncoder.encode(right);
  let mismatch = leftBytes.length === rightBytes.length ? 0 : 1;
  const length = Math.max(leftBytes.length, rightBytes.length);

  for (let index = 0; index < length; index += 1) {
    mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return mismatch === 0;
}

async function deriveLocalPasswordHash(password: string, salt: string) {
  const payload = textEncoder.encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', payload);
  return toBase64Url(new Uint8Array(digest));
}

async function createLocalPasswordHash(password: string) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = Array.from(saltBytes, (value) => value.toString(16).padStart(2, '0')).join('');
  const hash = await deriveLocalPasswordHash(password, salt);
  return `${LOCAL_PASSWORD_HASH_PREFIX}$${salt}$${hash}`;
}

async function verifyLocalPasswordHash(storedHash: string, candidate: string) {
  const [prefix, salt, expectedHash] = storedHash.split('$');

  if (prefix !== LOCAL_PASSWORD_HASH_PREFIX || !salt || !expectedHash) {
    return false;
  }

  const actualHash = await deriveLocalPasswordHash(candidate, salt);
  return timingSafeEqual(actualHash, expectedHash);
}

function formatDateKey(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error(`无法格式化时区日期: ${timeZone}`);
  }

  return `${year}-${month}-${day}`;
}

function toDateKey(value: string | undefined, timeZone: string): string | null {
  const date = parseTimeString(value);
  if (!date) {
    return null;
  }

  return formatDateKey(date, timeZone);
}

function shiftDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}

function normalizeMockEntryWriteInput(input: Partial<DiaryEntry>, requireContent: boolean): Partial<DiaryEntry> {
  if (!isRecord(input)) {
    throw new Error('日记数据格式无效');
  }

  const normalized: Partial<DiaryEntry> = {};

  if (requireContent || input.title !== undefined) {
    if (input.title !== undefined && typeof input.title !== 'string') {
      throw new Error('标题必须是字符串');
    }

    const title = typeof input.title === 'string' ? input.title.trim() || '无标题' : '无标题';
    if (!isWithinMaxLength(title, MAX_ENTRY_TITLE_LENGTH)) {
      throw new Error(`标题长度不能超过 ${MAX_ENTRY_TITLE_LENGTH} 字符`);
    }
    normalized.title = title;
  }

  if (requireContent || input.content !== undefined) {
    if (typeof input.content !== 'string') {
      throw new Error('日记内容不能为空');
    }

    const content = input.content.trim();
    if (!content) {
      throw new Error('日记内容不能为空');
    }

    if (!isWithinMaxLength(content, MAX_ENTRY_CONTENT_LENGTH)) {
      throw new Error(`内容长度不能超过 ${MAX_ENTRY_CONTENT_LENGTH} 字符`);
    }
    normalized.content = content;
  }

  if (requireContent || input.content_type !== undefined) {
    if (input.content_type !== undefined && input.content_type !== 'markdown' && input.content_type !== 'plain') {
      throw new Error('内容类型仅支持 markdown 或 plain');
    }
    normalized.content_type = input.content_type ?? 'markdown';
  }

  if (requireContent || input.mood !== undefined) {
    if (input.mood !== undefined && typeof input.mood !== 'string') {
      throw new Error('心情必须是字符串');
    }

    const mood = typeof input.mood === 'string' ? input.mood : 'neutral';
    if (!isWithinMaxLength(mood, MAX_ENTRY_MOOD_LENGTH)) {
      throw new Error(`心情长度不能超过 ${MAX_ENTRY_MOOD_LENGTH} 字符`);
    }
    normalized.mood = mood;
  }

  if (requireContent || input.weather !== undefined) {
    if (input.weather !== undefined && typeof input.weather !== 'string') {
      throw new Error('天气必须是字符串');
    }

    const weather = typeof input.weather === 'string' ? input.weather : 'unknown';
    if (!isWithinMaxLength(weather, MAX_ENTRY_WEATHER_LENGTH)) {
      throw new Error(`天气长度不能超过 ${MAX_ENTRY_WEATHER_LENGTH} 字符`);
    }
    normalized.weather = weather;
  }

  if (requireContent || input.images !== undefined) {
    if (input.images !== undefined && !isValidImageSourceArray(input.images)) {
      throw new Error('图片列表格式无效');
    }
    normalized.images = input.images ?? [];
  }

  if (requireContent || input.tags !== undefined) {
    if (input.tags !== undefined && !isValidEntryTags(input.tags)) {
      throw new Error('标签列表格式无效');
    }
    normalized.tags = input.tags ?? [];
  }

  if (requireContent || input.hidden !== undefined) {
    if (input.hidden !== undefined && typeof input.hidden !== 'boolean') {
      throw new Error('隐藏状态必须是布尔值');
    }
    normalized.hidden = input.hidden ?? false;
  }

  if (input.location !== undefined) {
    if (!isValidLocationInfo(input.location)) {
      throw new Error('位置信息格式无效');
    }
    normalized.location = input.location;
  } else if (requireContent) {
    normalized.location = null;
  }

  return normalized;
}

export class MockApiService {
  private readonly STORAGE_KEY = 'diary_app_data';
  private readonly SETTINGS_KEY = 'diary_app_settings';
  private readonly APP_AUTH_KEY = 'diary-app-authenticated';
  private readonly ADMIN_AUTH_KEY = 'diary-admin-authenticated';
  private readonly MIN_PASSWORD_LENGTH = 6;
  private readonly MAX_PASSWORD_LENGTH = 256;
  private readonly localDataStore = new LocalDataStore({
    entries: this.STORAGE_KEY,
    settings: this.SETTINGS_KEY,
    appAuth: this.APP_AUTH_KEY,
    adminAuth: this.ADMIN_AUTH_KEY,
    disableDefaults: 'diary_disable_defaults',
  });
  private entryMutationQueue: Promise<void> = Promise.resolve();

  private async runEntryMutation<T>(action: () => Promise<T>): Promise<T> {
    const previousMutation = this.entryMutationQueue;
    let releaseMutation!: () => void;
    this.entryMutationQueue = new Promise<void>((resolve) => {
      releaseMutation = resolve;
    });

    await previousMutation;

    try {
      return await action();
    } finally {
      releaseMutation();
    }
  }

  private async getStoredEntries(): Promise<DiaryEntry[]> {
    const storedEntries = await this.localDataStore.getEntries(() => this.getDefaultEntries());
    const normalizedEntries = storedEntries.map(normalizeDiaryEntry);

    if (JSON.stringify(storedEntries) !== JSON.stringify(normalizedEntries)) {
      await this.localDataStore.saveEntries(normalizedEntries);
    }

    return normalizedEntries;
  }

  private async saveEntries(entries: DiaryEntry[]): Promise<void> {
    await this.localDataStore.saveEntries(entries.map(normalizeDiaryEntry));
  }

  private async getStoredSettings(): Promise<Record<string, string>> {
    const settings = await this.localDataStore.getSettings(() => this.getDefaultSettings());

    if (settings.remote_sync_admin_password) {
      delete settings.remote_sync_admin_password;
      await this.saveSettings(settings);
    }

    if (isNativeAppRuntime()) {
      const remoteBound = this.getRemoteBoundState(settings);
      const configuredAdminPassword = this.getConfiguredLocalAdminPassword(settings);

      if (!remoteBound && configuredAdminPassword) {
        delete settings.admin_password;
        await this.saveSettings(settings);

        const session = await this.localDataStore.getSession();
        if (session.isAdminAuthenticated) {
          await this.localDataStore.clearSession();
        }
      }
    }

    return settings;
  }

  private async saveSettings(settings: Record<string, string>): Promise<void> {
    await this.localDataStore.saveSettings(settings);
  }

  private async updateStoredSettings(mutator: (settings: Record<string, string>) => void): Promise<void> {
    const settings = await this.getStoredSettings();
    mutator(settings);
    await this.saveSettings(settings);
  }

  private async getSessionState(): Promise<SessionState> {
    await this.getStoredSettings();
    return this.localDataStore.getSession();
  }

  private async isAdminAuthenticated(): Promise<boolean> {
    return (await this.getSessionState()).isAdminAuthenticated;
  }

  private async requireAdminSession(): Promise<void> {
    if (!(await this.isAdminAuthenticated())) {
      throw new Error('需要管理员权限');
    }
  }

  private async runMockRequest<T>(
    delayMs: number,
    action: () => T | Promise<T>,
    options?: { requireAdmin?: boolean }
  ): Promise<T> {
    await wait(delayMs);

    if (options?.requireAdmin) {
      await this.requireAdminSession();
    }

    return action();
  }

  private async canReadEntry(entry: DiaryEntry): Promise<boolean> {
    return (await this.isAdminAuthenticated()) || !sanitizeEntryHidden(entry.hidden);
  }

  private async hasValidStatsApiKey(apiKey?: string): Promise<boolean> {
    const configuredApiKey = (await this.getStoredSettings()).stats_api_key?.trim();

    if (!configuredApiKey || !apiKey) {
      return false;
    }

    if (apiKey === configuredApiKey) {
      return true;
    }

    if (apiKey.startsWith('Bearer ')) {
      return apiKey.slice(7) === configuredApiKey;
    }

    return false;
  }

  private validatePasswordLength(value: string, label: string): string {
    const trimmedValue = value.trim();
    if (trimmedValue.length < this.MIN_PASSWORD_LENGTH) {
      throw new Error(`${label}长度至少 ${this.MIN_PASSWORD_LENGTH} 位`);
    }

    if (trimmedValue.length > this.MAX_PASSWORD_LENGTH) {
      throw new Error(`${label}长度不能超过 ${this.MAX_PASSWORD_LENGTH} 位`);
    }

    return trimmedValue;
  }

  private validateRemoteAdminPassword(value: string): string {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      throw new Error('请输入远程管理员密码');
    }

    if (trimmedValue.length > this.MAX_PASSWORD_LENGTH) {
      throw new Error(`远程管理员密码长度不能超过 ${this.MAX_PASSWORD_LENGTH} 位`);
    }

    return trimmedValue;
  }

  private getRemoteBoundState(settings: Record<string, string>) {
    return Boolean(settings.remote_admin_password_hash?.trim());
  }

  private getConfiguredLocalAdminPassword(settings: Record<string, string>) {
    return settings.admin_password?.trim() ?? '';
  }

  private async verifyConfiguredAdminPassword(settings: Record<string, string>, password: string) {
    const normalizedPassword = password.trim();
    const remoteAdminHash = settings.remote_admin_password_hash?.trim();

    if (remoteAdminHash) {
      return normalizedPassword
        ? verifyLocalPasswordHash(remoteAdminHash, normalizedPassword)
        : false;
    }

    const configuredAdminPassword = this.getConfiguredLocalAdminPassword(settings);
    if (configuredAdminPassword) {
      return timingSafeEqual(configuredAdminPassword, normalizedPassword);
    }

    return true;
  }

  private getDefaultEntries(): DiaryEntry[] {
    return [
      {
        id: 1,
        entry_uuid: 'demo-entry-1',
        title: '公园散步的美好时光',
        content: '今天天气很好，和朋友一起去**公园散步**，心情特别愉快。\n\n看到了很多美丽的花朵 🌸，还遇到了可爱的小狗 🐕。和朋友聊了很多有趣的话题。\n\n> 生活中的小美好总是让人感到幸福',
        content_type: 'markdown',
        mood: 'happy',
        weather: 'sunny',
        tags: ['散步', '朋友', '公园'],
        images: [],
        created_at: new Date(Date.now() - 86400000).toISOString(),
        updated_at: new Date(Date.now() - 86400000).toISOString(),
        last_synced_at: new Date(Date.now() - 86400000).toISOString(),
        deleted_at: null,
        sync_state: 'synced',
        hidden: false,
      },
      {
        id: 2,
        entry_uuid: 'demo-entry-2',
        title: '工作中的成长与收获',
        content: '今天在工作中遇到了一些挑战，但通过**团队合作**成功解决了问题。\n\n学到了很多新的技术知识：\n- React Hook 的高级用法\n- TypeScript 类型推导\n- 团队协作的重要性\n\n感觉自己又成长了一些 💪',
        content_type: 'markdown',
        mood: 'neutral',
        weather: 'cloudy',
        tags: ['工作', '学习', '团队'],
        images: [],
        created_at: new Date(Date.now() - 172800000).toISOString(),
        updated_at: new Date(Date.now() - 172800000).toISOString(),
        last_synced_at: new Date(Date.now() - 172800000).toISOString(),
        deleted_at: null,
        sync_state: 'synced',
        hidden: false,
      },
      {
        id: 3,
        entry_uuid: 'demo-entry-3',
        title: '雨天的宁静思考',
        content: '下雨天总是让人感到宁静，坐在窗边听雨声，思考人生的意义。\n\n今天读了《人生的智慧》，收获颇丰。\n\n*雨声滴答，思绪万千...*\n\n有时候慢下来，静静地感受生活，也是一种幸福。',
        content_type: 'markdown',
        mood: 'peaceful',
        weather: 'rainy',
        tags: ['读书', '思考', '雨天'],
        images: [],
        created_at: new Date(Date.now() - 259200000).toISOString(),
        updated_at: new Date(Date.now() - 259200000).toISOString(),
        last_synced_at: new Date(Date.now() - 259200000).toISOString(),
        deleted_at: null,
        sync_state: 'synced',
        hidden: false,
      },
    ];
  }

  private getDefaultSettings(): Record<string, string> {
    return {
      admin_password: isNativeAppRuntime() ? '' : 'admin123',
      app_password_enabled: 'false',
      app_password: 'diary123',
      login_background_enabled: 'false',
      login_background_url: '',
      reading_desk_enabled: 'true',
      quick_filters_enabled: 'true',
      export_enabled: 'true',
      archive_view_enabled: 'true',
      welcome_page_enabled: 'true',
      recommendations_enabled: 'true',
      browse_status_enabled: 'true',
      device_status_enabled: 'true',
    };
  }

  private generateId(entries: DiaryEntry[]): number {
    return Math.max(0, ...entries.map((entry) => entry.id || 0)) + 1;
  }

  private calculateConsecutiveDays(entries: DiaryEntry[]): { consecutive_days: number; current_streak_start: string | null } {
    if (entries.length === 0) {
      return { consecutive_days: 0, current_streak_start: null };
    }

    const uniqueDates = Array.from(new Set(
      entries
        .map((entry) => toDateKey(entry.created_at, DEFAULT_APP_TIME_ZONE))
        .filter((date): date is string => date !== null)
    )).sort((left, right) => right.localeCompare(left));

    if (uniqueDates.length === 0) {
      return { consecutive_days: 0, current_streak_start: null };
    }

    let consecutiveDays = 1;
    let currentStreakStart = uniqueDates[0];
    const todayStr = formatDateKey(new Date(), DEFAULT_APP_TIME_ZONE);
    const yesterdayStr = shiftDateKey(todayStr, -1);

    if (uniqueDates[0] !== todayStr && uniqueDates[0] !== yesterdayStr) {
      return { consecutive_days: 0, current_streak_start: null };
    }

    for (let index = 1; index < uniqueDates.length; index += 1) {
      const expectedDate = shiftDateKey(uniqueDates[index - 1], -1);
      if (uniqueDates[index] === expectedDate) {
        consecutiveDays += 1;
        currentStreakStart = uniqueDates[index];
        continue;
      }

      break;
    }

    return { consecutive_days: consecutiveDays, current_streak_start: currentStreakStart };
  }

  private calculateTotalDaysWithEntries(entries: DiaryEntry[]): number {
    return new Set(
      entries
        .map((entry) => toDateKey(entry.created_at, DEFAULT_APP_TIME_ZONE))
        .filter((date): date is string => date !== null)
    ).size;
  }

  async getAllEntries(): Promise<DiaryEntry[]> {
    return this.runMockRequest(100, async () => {
      const entries = await this.getStoredEntries();
      const readableEntries = await Promise.all(entries.map(async (entry) => ({
        entry,
        canRead: !isDiaryEntryDeleted(entry) && await this.canReadEntry(entry),
      })));

      return readableEntries.filter((item) => item.canRead).map((item) => item.entry);
    });
  }

  async getEntry(id: number): Promise<DiaryEntry | null> {
    return this.runMockRequest(50, async () => {
      const entries = await this.getStoredEntries();
      const entry = entries.find((item) => item.id === id) || null;
      return entry && !isDiaryEntryDeleted(entry) && await this.canReadEntry(entry) ? entry : null;
    });
  }

  async createEntry(entry: Omit<DiaryEntry, 'id' | 'created_at' | 'updated_at'>): Promise<DiaryEntry> {
    return this.runMockRequest(100, () => this.runEntryMutation(async () => {
      const entries = await this.getStoredEntries();
      const now = new Date().toISOString();
      const normalizedInput = normalizeMockEntryWriteInput(entry, true);
      const newEntry: DiaryEntry = createLocallyCreatedDiaryEntry({
        ...entry,
        ...normalizedInput,
        id: this.generateId(entries),
        created_at: now,
        updated_at: now,
      });

      entries.unshift(newEntry);
      await this.saveEntries(entries);
      return newEntry;
    }), { requireAdmin: true });
  }

  async uploadImage(file: File): Promise<string> {
    return this.runMockRequest(80, () => {
      if (!file.type.toLowerCase().startsWith('image/')) {
        throw new Error('仅支持图片文件上传');
      }

      if (file.size <= 0) {
        throw new Error('图片文件为空');
      }

      if (file.size > MOCK_IMAGE_MAX_BINARY_BYTES) {
        throw new Error(`本地模式图片大小不能超过 ${MOCK_IMAGE_MAX_SIZE_LABEL}，请压缩后重试`);
      }

      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        let settled = false;

        const cleanup = () => {
          clearTimeout(timeoutId);
          reader.onload = null;
          reader.onerror = null;
          reader.onabort = null;
        };

        const settle = (callback: () => void) => {
          if (settled) {
            return;
          }

          settled = true;
          cleanup();
          callback();
        };

        const timeoutId = setTimeout(() => {
          settle(() => {
            try {
              if (reader.readyState === FileReader.LOADING) {
                reader.abort();
              }
            } catch {
              // Ignore abort failures; the caller already gets a timeout error.
            }

            reject(new Error('图片读取超时，请重新选择图片'));
          });
        }, MOCK_IMAGE_READ_TIMEOUT_MS);

        reader.onload = () => {
          settle(() => {
            const result = typeof reader.result === 'string' ? reader.result : '';

            // readAsDataURL 的输出结构固定，这里只做廉价的前缀与长度检查，
            // 避免对多 MB 字符串做全量校验扫描（MIME 可能保留原始大小写）
            if (result.slice(0, 11).toLowerCase() !== 'data:image/') {
              reject(new Error('图片读取失败'));
              return;
            }

            if (result.length > MAX_ENTRY_IMAGE_DATA_URL_LENGTH) {
              reject(new Error(`本地模式图片大小不能超过 ${MOCK_IMAGE_MAX_SIZE_LABEL}，请压缩后重试`));
              return;
            }

            resolve(result);
          });
        };

        reader.onerror = () => {
          settle(() => reject(new Error('图片读取失败')));
        };

        reader.onabort = () => {
          settle(() => reject(new Error('图片读取已取消，请重新选择图片')));
        };

        try {
          reader.readAsDataURL(file);
        } catch {
          settle(() => reject(new Error('图片读取失败')));
        }
      });
    }, { requireAdmin: true });
  }

  async updateEntry(id: number, updates: Partial<DiaryEntry>): Promise<DiaryEntry> {
    return this.runMockRequest(100, () => this.runEntryMutation(async () => {
      const entries = await this.getStoredEntries();
      const index = entries.findIndex((entry) => entry.id === id);

      if (index === -1 || isDiaryEntryDeleted(entries[index]!)) {
        throw new Error('日记不存在');
      }

      const normalizedUpdates = normalizeMockEntryWriteInput(updates, false);
      const updatedEntry = markDiaryEntryUpdatedLocally(entries[index]!, {
        ...normalizedUpdates,
        id,
      });

      entries[index] = updatedEntry;
      await this.saveEntries(entries);
      return updatedEntry;
    }), { requireAdmin: true });
  }

  async deleteEntry(id: number): Promise<void> {
    return this.runMockRequest(100, () => this.runEntryMutation(async () => {
      const entries = await this.getStoredEntries();
      const index = entries.findIndex((entry) => entry.id === id);

      if (index === -1 || isDiaryEntryDeleted(entries[index]!)) {
        throw new Error('日记不存在');
      }

      const targetEntry = entries[index]!;

      if (targetEntry.sync_state === 'pending_create' && !targetEntry.last_synced_at) {
        const filteredEntries = entries.filter((entry) => entry.id !== id);
        await this.saveEntries(filteredEntries);
        return;
      }

      entries[index] = markDiaryEntryDeletedLocally(targetEntry);
      await this.saveEntries(entries);
    }), { requireAdmin: true });
  }

  async batchImportEntries(newEntries: DiaryEntry[], options?: { overwrite?: boolean }): Promise<DiaryEntry[]> {
    return this.runMockRequest(200, () => this.runEntryMutation(async () => {
      const validEntries = parseEntriesBackupData(newEntries);
      const existingEntries = await this.getStoredEntries();
      const importedEntries: DiaryEntry[] = [];
      let nextId = Math.max(0, ...existingEntries.map((entry) => entry.id || 0)) + 1;

      for (const entry of validEntries) {
        const newEntry: DiaryEntry = normalizeDiaryEntry({
          ...entry,
          id: nextId++,
          created_at: entry.created_at || new Date().toISOString(),
          updated_at: entry.updated_at || new Date().toISOString(),
          sync_state: entry.sync_state || 'synced',
          last_synced_at: entry.last_synced_at ?? entry.updated_at ?? entry.created_at ?? new Date().toISOString(),
          deleted_at: entry.deleted_at ?? null,
        });
        importedEntries.push(newEntry);
      }

      let finalEntries: DiaryEntry[];

      if (options?.overwrite) {
        finalEntries = [...importedEntries];
        await this.localDataStore.setDefaultDataEnabled(false);
      } else {
        finalEntries = [...existingEntries, ...importedEntries];
      }

      finalEntries = sortDiaryEntriesByTime(finalEntries);

      await this.saveEntries(finalEntries);
      return importedEntries;
    }), { requireAdmin: true });
  }

  async batchUpdateEntries(updatedEntries: DiaryEntry[]): Promise<DiaryEntry[]> {
    return this.runMockRequest(200, () => this.runEntryMutation(async () => {
      const validEntries = parseEntriesBackupData(updatedEntries);
      const entries = await this.getStoredEntries();
      const updates: Array<{ index: number; entry: DiaryEntry }> = [];
      const seenIds = new Set<number>();

      for (let index = 0; index < validEntries.length; index += 1) {
        const updatedEntry = validEntries[index]!;
        const id = updatedEntry.id;

        if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
          throw new Error(`第 ${index + 1} 条更新数据缺少有效 id`);
        }

        if (seenIds.has(id)) {
          throw new Error(`批量更新中存在重复 id: ${id}`);
        }
        seenIds.add(id);

        const entryIndex = entries.findIndex((entry) => entry.id === id && !isDiaryEntryDeleted(entry));
        if (entryIndex === -1) {
          throw new Error(`第 ${index + 1} 条更新目标不存在`);
        }

        updates.push({
          index: entryIndex,
          entry: updatedEntry,
        });
      }

      const results: DiaryEntry[] = [];

      for (const { index, entry: updatedEntry } of updates) {
        const updated: DiaryEntry = normalizeDiaryEntry({
          ...entries[index],
          ...updatedEntry,
          updated_at: updatedEntry.updated_at || new Date().toISOString(),
          sync_state: updatedEntry.sync_state || 'synced',
          last_synced_at: updatedEntry.last_synced_at ?? updatedEntry.updated_at ?? new Date().toISOString(),
        });
        entries[index] = updated;
        results.push(updated);
      }

      await this.saveEntries(entries);
      return results;
    }), { requireAdmin: true });
  }

  async getSetting(key: string): Promise<string | null> {
    return this.runMockRequest(50, async () => {
      const settings = await this.getStoredSettings();
      const remoteBound = this.getRemoteBoundState(settings);
      const configuredAdminPassword = this.getConfiguredLocalAdminPassword(settings);

      if (key === 'admin_password_configured') {
        await this.requireAdminSession();
        return remoteBound || Boolean(configuredAdminPassword) ? 'true' : 'false';
      }

      if (key === 'app_password_configured') {
        await this.requireAdminSession();
        return settings.app_password ? 'true' : 'false';
      }

      if (isPublicBooleanSettingKey(key)) {
        return getPublicBooleanSettingStoredValue(settings, key);
      }

      await this.requireAdminSession();
      return settings[key] ?? null;
    });
  }

  async setSetting(key: string, value: string): Promise<void> {
    return this.runMockRequest(50, async () => {
      const settings = await this.getStoredSettings();

      if (key === 'admin_password') {
        if (this.getRemoteBoundState(settings)) {
          throw new Error('当前已绑定远程，请先在线上修改管理员密码后再重新绑定');
        }

        if (isNativeAppRuntime()) {
          throw new Error('APK 本地管理员口令默认为免密，请使用远程绑定来对齐管理员密码');
        }

        const trimmedValue = this.validatePasswordLength(value, '管理员密码');
        await this.updateStoredSettings((settings) => {
          settings.admin_password = trimmedValue;
        });
        return;
      }

      if (key === 'app_password') {
        const trimmedValue = this.validatePasswordLength(value, '应用密码');
        await this.updateStoredSettings((settings) => {
          settings.app_password = trimmedValue;
        });
        return;
      }

      if (!isPublicBooleanSettingKey(key)) {
        throw new Error('不允许修改该设置');
      }

      if (!isStoredBooleanString(value)) {
        throw new Error('布尔设置仅允许 true 或 false');
      }

      await this.updateStoredSettings((settings) => {
        if (key === 'app_password_enabled' && value === 'true' && !settings.app_password?.trim()) {
          throw new Error('请先设置应用访问密码，再开启访问保护');
        }

        settings[key] = value;
      });
    }, { requireAdmin: true });
  }

  async login(scope: 'app' | 'admin', password: string): Promise<SessionState> {
    return this.runMockRequest(80, async () => {
      const settings = await this.getStoredSettings();

      if (scope === 'app') {
        if (settings.app_password_enabled !== 'true' || password === settings.app_password) {
          const session: SessionState = {
            isAuthenticated: true,
            isAdminAuthenticated: false,
          };
          await this.localDataStore.saveSession(session);
          return session;
        }

        throw new Error('访问密码错误');
      }

      const verified = await this.verifyConfiguredAdminPassword(settings, password);
      if (!verified) {
        throw new Error('管理员密码错误');
      }

      const session: SessionState = {
        isAuthenticated: true,
        isAdminAuthenticated: true,
      };
      await this.localDataStore.saveSession(session);
      return session;
    });
  }

  async logout(): Promise<void> {
    return this.runMockRequest(50, async () => {
      await this.localDataStore.clearSession();
    });
  }

  async getSession(): Promise<SessionState> {
    return this.runMockRequest(30, () => this.getSessionState());
  }

  async getPublicSettings(): Promise<PublicSettingsResponse> {
    return this.runMockRequest(50, async () => createPublicSettingsResponse(await this.getStoredSettings()));
  }

  async getAdminSettings(): Promise<AdminSettingsResponse> {
    return this.runMockRequest(50, async () => {
      const settings = await this.getStoredSettings();
      const publicSettings = createPublicSettingsResponse(settings);
      const remoteBound = this.getRemoteBoundState(settings);
      const configuredAdminPassword = this.getConfiguredLocalAdminPassword(settings);

      return {
        ...publicSettings,
        adminPasswordConfigured: remoteBound || Boolean(configuredAdminPassword),
        appPasswordConfigured: Boolean(settings.app_password),
        syncAccessTokenConfigured: Boolean(settings.sync_access_token),
      };
    }, { requireAdmin: true });
  }

  async getAdminAccessProfile(): Promise<AdminAccessProfile> {
    return this.runMockRequest(30, async () => {
      const settings = await this.getStoredSettings();
      const remoteBound = this.getRemoteBoundState(settings);
      const configuredAdminPassword = this.getConfiguredLocalAdminPassword(settings);
      const remoteSyncBaseUrl = settings.remote_sync_base_url?.trim() ?? '';
      const remoteSyncToken = settings.remote_sync_token?.trim() ?? '';

      return {
        mode: 'local',
        requiresPassword: remoteBound || Boolean(configuredAdminPassword),
        remoteBound,
        remoteSyncConfigured: Boolean(remoteSyncBaseUrl && remoteSyncToken),
        remoteSyncBaseUrl,
      };
    });
  }

  async getStats(apiKey?: string): Promise<DiaryStats> {
    return this.runMockRequest(100, async () => {
      const hasApiKey = await this.hasValidStatsApiKey(apiKey);
      const isAdminAuthenticated = await this.isAdminAuthenticated();

      if (!isAdminAuthenticated && !hasApiKey) {
        throw new Error('需要管理员会话或有效的统计 API 密钥');
      }

      const entries = (await this.getStoredEntries()).filter((entry) => !isDiaryEntryDeleted(entry) && (isAdminAuthenticated || hasApiKey || !sanitizeEntryHidden(entry.hidden)));
      const { consecutive_days, current_streak_start } = this.calculateConsecutiveDays(entries);
      const total_days_with_entries = this.calculateTotalDaysWithEntries(entries);
      const total_entries = entries.length;
      const { latestEntryDate, firstEntryDate } = getValidEntryDateRange(entries);

      return {
        consecutive_days,
        total_days_with_entries,
        total_entries,
        latest_entry_date: latestEntryDate,
        first_entry_date: firstEntryDate,
        current_streak_start,
      };
    });
  }

  async getLocalSyncStatus(): Promise<DiarySyncStatus> {
    return this.runMockRequest(30, async () => buildDiarySyncStatus(await this.getStoredEntries()));
  }

  async getAllLocalEntriesForBinding(): Promise<DiaryEntry[]> {
    return this.getStoredEntries();
  }

  async getPendingLocalSyncEntries(): Promise<DiaryEntry[]> {
    return this.runMockRequest(30, async () => listPendingSyncEntries(await this.getStoredEntries()));
  }

  async markLocalEntriesSynced(entryUuids: string[], syncedAt?: string): Promise<void> {
    return this.runMockRequest(30, () => this.runEntryMutation(async () => {
      const entries = await this.getStoredEntries();
      const nextEntries = markDiaryEntriesSynced(entries, entryUuids, syncedAt);
      await this.saveEntries(nextEntries);
    }));
  }

  async applyRemoteSyncSnapshot(entries: DiaryEntry[], syncedAt: string): Promise<void> {
    return this.runMockRequest(30, () => this.runEntryMutation(async () => {
      const normalizedEntries = entries.map((entry) => {
        const normalizedEntry = normalizeDiaryEntry(entry);
        return {
          ...normalizedEntry,
          deleted_at: null,
          sync_state: 'synced' as const,
          last_synced_at: syncedAt,
        };
      });

      await this.saveEntries(normalizedEntries);
    }));
  }

  async applyIncrementalRemoteSync(entries: DiaryEntry[], syncedAt: string): Promise<void> {
    return this.runMockRequest(30, () => this.runEntryMutation(async () => {
      const currentEntries = await this.getStoredEntries();
      await this.saveEntries(applyIncrementalRemoteEntries(currentEntries, entries, syncedAt));
    }));
  }

  async applyRemoteSyncResult(
    sentEntries: DiaryEntry[],
    confirmedEntryUuids: string[],
    remoteEntries: DiaryEntry[],
    syncedAt: string
  ): Promise<void> {
    return this.runMockRequest(30, () => this.runEntryMutation(async () => {
      const currentEntries = await this.getStoredEntries();
      const nextEntries = applyDiarySyncResult(
        currentEntries,
        sentEntries,
        confirmedEntryUuids,
        remoteEntries,
        syncedAt
      );
      await this.saveEntries(nextEntries);
    }));
  }

  async getRemoteSyncConfig(): Promise<{ baseUrl: string; syncToken: string }> {
    return this.runMockRequest(30, async () => {
      const settings = await this.getStoredSettings();
      return {
        baseUrl: settings.remote_sync_base_url ?? '',
        syncToken: settings.remote_sync_token ?? '',
      };
    }, { requireAdmin: true });
  }

  async getRemoteBindingDefaults(): Promise<{ baseUrl: string; syncToken: string }> {
    return this.runMockRequest(30, async () => {
      const settings = await this.getStoredSettings();
      return {
        baseUrl: settings.remote_sync_base_url ?? '',
        syncToken: settings.remote_sync_token ?? '',
      };
    });
  }

  async saveRemoteSyncConfig(config: { baseUrl: string; syncToken: string }): Promise<void> {
    return this.runMockRequest(30, async () => {
      await this.updateStoredSettings((settings) => {
        settings.remote_sync_base_url = config.baseUrl.trim();
        settings.remote_sync_token = config.syncToken;
      });
    }, { requireAdmin: true });
  }

  async bindRemoteAdmin(config: { baseUrl: string; syncToken: string; adminPassword: string }): Promise<void> {
    const trimmedPassword = this.validateRemoteAdminPassword(config.adminPassword);

    return this.runMockRequest(60, async () => {
      const passwordHash = await createLocalPasswordHash(trimmedPassword);

      await this.updateStoredSettings((settings) => {
        settings.remote_sync_base_url = config.baseUrl.trim();
        settings.remote_sync_token = config.syncToken.trim();
        settings.remote_admin_password_hash = passwordHash;
        delete settings.admin_password;
      });
    });
  }

  async unbindRemoteAdmin(): Promise<void> {
    return this.runMockRequest(30, async () => {
      await this.updateStoredSettings((settings) => {
        delete settings.remote_admin_password_hash;
        delete settings.remote_sync_base_url;
        delete settings.remote_sync_token;

        if (isNativeAppRuntime()) {
          delete settings.admin_password;
        }
      });
    });
  }
}
