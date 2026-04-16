import type { DiaryEntry, DiaryStats } from '../types/index.ts';
import type { AdminSettingsResponse, PublicSettingsResponse, SessionState } from './apiTypes.ts';
import { LocalDataStore } from './localDataStore.ts';
import {
  createPublicSettingsResponse,
  getPublicBooleanSettingStoredValue,
  isStoredBooleanString,
  isPublicBooleanSettingKey,
} from './publicSettingsSchema.ts';

const DEFAULT_APP_TIME_ZONE = 'Asia/Shanghai';

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return formatDateKey(date, timeZone);
}

function shiftDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
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

  private async getStoredEntries(): Promise<DiaryEntry[]> {
    return this.localDataStore.getEntries(() => this.getDefaultEntries());
  }

  private async saveEntries(entries: DiaryEntry[]): Promise<void> {
    await this.localDataStore.saveEntries(entries);
  }

  private async getStoredSettings(): Promise<Record<string, string>> {
    return this.localDataStore.getSettings(() => this.getDefaultSettings());
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
    return (await this.isAdminAuthenticated()) || !entry.hidden;
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

  private getDefaultEntries(): DiaryEntry[] {
    return [
      {
        id: 1,
        title: '公园散步的美好时光',
        content: '今天天气很好，和朋友一起去**公园散步**，心情特别愉快。\n\n看到了很多美丽的花朵 🌸，还遇到了可爱的小狗 🐕。和朋友聊了很多有趣的话题。\n\n> 生活中的小美好总是让人感到幸福',
        content_type: 'markdown',
        mood: 'happy',
        weather: 'sunny',
        tags: ['散步', '朋友', '公园'],
        images: [],
        created_at: new Date(Date.now() - 86400000).toISOString(),
        updated_at: new Date(Date.now() - 86400000).toISOString(),
        hidden: false,
      },
      {
        id: 2,
        title: '工作中的成长与收获',
        content: '今天在工作中遇到了一些挑战，但通过**团队合作**成功解决了问题。\n\n学到了很多新的技术知识：\n- React Hook 的高级用法\n- TypeScript 类型推导\n- 团队协作的重要性\n\n感觉自己又成长了一些 💪',
        content_type: 'markdown',
        mood: 'neutral',
        weather: 'cloudy',
        tags: ['工作', '学习', '团队'],
        images: [],
        created_at: new Date(Date.now() - 172800000).toISOString(),
        updated_at: new Date(Date.now() - 172800000).toISOString(),
        hidden: false,
      },
      {
        id: 3,
        title: '雨天的宁静思考',
        content: '下雨天总是让人感到宁静，坐在窗边听雨声，思考人生的意义。\n\n今天读了《人生的智慧》，收获颇丰。\n\n*雨声滴答，思绪万千...*\n\n有时候慢下来，静静地感受生活，也是一种幸福。',
        content_type: 'markdown',
        mood: 'peaceful',
        weather: 'rainy',
        tags: ['读书', '思考', '雨天'],
        images: [],
        created_at: new Date(Date.now() - 259200000).toISOString(),
        updated_at: new Date(Date.now() - 259200000).toISOString(),
        hidden: false,
      },
    ];
  }

  private getDefaultSettings(): Record<string, string> {
    return {
      admin_password: 'admin123',
      app_password_enabled: 'false',
      app_password: 'diary123',
      login_background_enabled: 'false',
      login_background_url: '',
      quick_filters_enabled: 'true',
      export_enabled: 'true',
      archive_view_enabled: 'true',
      welcome_page_enabled: 'true',
      recommendations_enabled: 'true',
      browse_status_enabled: 'true',
      device_status_enabled: 'true',
    };
  }

  private async generateId(): Promise<number> {
    const entries = await this.getStoredEntries();
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
        canRead: await this.canReadEntry(entry),
      })));

      return readableEntries.filter((item) => item.canRead).map((item) => item.entry);
    });
  }

  async getEntry(id: number): Promise<DiaryEntry | null> {
    return this.runMockRequest(50, async () => {
      const entries = await this.getStoredEntries();
      const entry = entries.find((item) => item.id === id) || null;
      return entry && await this.canReadEntry(entry) ? entry : null;
    });
  }

  async createEntry(entry: Omit<DiaryEntry, 'id' | 'created_at' | 'updated_at'>): Promise<DiaryEntry> {
    return this.runMockRequest(100, async () => {
      const entries = await this.getStoredEntries();
      const now = new Date().toISOString();
      const newEntry: DiaryEntry = {
        ...entry,
        id: await this.generateId(),
        created_at: now,
        updated_at: now,
        content_type: entry.content_type || 'markdown',
        mood: entry.mood || 'neutral',
        weather: entry.weather || 'unknown',
        tags: entry.tags || [],
        images: entry.images || [],
        location: entry.location || null,
        hidden: entry.hidden || false,
      };

      entries.unshift(newEntry);
      await this.saveEntries(entries);
      return newEntry;
    }, { requireAdmin: true });
  }

  async uploadImage(file: File): Promise<string> {
    return this.runMockRequest(80, () => {
      if (!file.type.startsWith('image/')) {
        throw new Error('仅支持图片文件上传');
      }

      if (file.size > 10 * 1024 * 1024) {
        throw new Error('图片大小不能超过 10MB');
      }

      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = typeof reader.result === 'string' ? reader.result : '';
          if (!result) {
            reject(new Error('图片读取失败'));
            return;
          }

          resolve(result);
        };
        reader.onerror = () => reject(new Error('图片读取失败'));
        reader.readAsDataURL(file);
      });
    }, { requireAdmin: true });
  }

  async updateEntry(id: number, updates: Partial<DiaryEntry>): Promise<DiaryEntry> {
    return this.runMockRequest(100, async () => {
      const entries = await this.getStoredEntries();
      const index = entries.findIndex((entry) => entry.id === id);

      if (index === -1) {
        throw new Error('日记不存在');
      }

      const updatedEntry: DiaryEntry = {
        ...entries[index],
        ...updates,
        id,
        updated_at: new Date().toISOString(),
      };

      entries[index] = updatedEntry;
      await this.saveEntries(entries);
      return updatedEntry;
    }, { requireAdmin: true });
  }

  async deleteEntry(id: number): Promise<void> {
    return this.runMockRequest(100, async () => {
      const entries = await this.getStoredEntries();
      const filteredEntries = entries.filter((entry) => entry.id !== id);

      if (filteredEntries.length === entries.length) {
        throw new Error('日记不存在');
      }

      await this.saveEntries(filteredEntries);
    }, { requireAdmin: true });
  }

  async batchImportEntries(newEntries: DiaryEntry[], options?: { overwrite?: boolean }): Promise<DiaryEntry[]> {
    return this.runMockRequest(200, async () => {
      const existingEntries = await this.getStoredEntries();
      const importedEntries: DiaryEntry[] = [];
      let nextId = Math.max(0, ...existingEntries.map((entry) => entry.id || 0)) + 1;

      for (const entry of newEntries) {
        const newEntry: DiaryEntry = {
          ...entry,
          id: nextId++,
          created_at: entry.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        importedEntries.push(newEntry);
      }

      let finalEntries: DiaryEntry[];

      if (options?.overwrite) {
        finalEntries = [...importedEntries];
        await this.localDataStore.setDefaultDataEnabled(false);
      } else {
        finalEntries = [...existingEntries, ...importedEntries];
      }

      finalEntries.sort((left, right) =>
        new Date(right.created_at || '').getTime() - new Date(left.created_at || '').getTime()
      );

      await this.saveEntries(finalEntries);
      return importedEntries;
    }, { requireAdmin: true });
  }

  async batchUpdateEntries(updatedEntries: DiaryEntry[]): Promise<DiaryEntry[]> {
    return this.runMockRequest(200, async () => {
      const entries = await this.getStoredEntries();
      const results: DiaryEntry[] = [];

      for (const updatedEntry of updatedEntries) {
        const index = entries.findIndex((entry) => entry.id === updatedEntry.id);
        if (index !== -1) {
          const updated: DiaryEntry = {
            ...updatedEntry,
            updated_at: new Date().toISOString(),
          };
          entries[index] = updated;
          results.push(updated);
        }
      }

      await this.saveEntries(entries);
      return results;
    }, { requireAdmin: true });
  }

  async getSetting(key: string): Promise<string | null> {
    return this.runMockRequest(50, async () => {
      const settings = await this.getStoredSettings();

      if (key === 'admin_password_configured') {
        await this.requireAdminSession();
        return settings.admin_password ? 'true' : 'false';
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
      if (key === 'admin_password') {
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

      if (password !== settings.admin_password) {
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

      return {
        ...publicSettings,
        adminPasswordConfigured: Boolean(settings.admin_password),
        appPasswordConfigured: Boolean(settings.app_password),
      };
    }, { requireAdmin: true });
  }

  async getStats(apiKey?: string): Promise<DiaryStats> {
    return this.runMockRequest(100, async () => {
      const hasApiKey = await this.hasValidStatsApiKey(apiKey);
      const isAdminAuthenticated = await this.isAdminAuthenticated();

      if (!isAdminAuthenticated && !hasApiKey) {
        throw new Error('需要管理员会话或有效的统计 API 密钥');
      }

      const entries = (await this.getStoredEntries()).filter((entry) => isAdminAuthenticated || hasApiKey || !entry.hidden);
      const { consecutive_days, current_streak_start } = this.calculateConsecutiveDays(entries);
      const total_days_with_entries = this.calculateTotalDaysWithEntries(entries);
      const total_entries = entries.length;
      const sortedEntries = [...entries].sort((left, right) =>
        new Date(right.created_at || '').getTime() - new Date(left.created_at || '').getTime()
      );
      const latest_entry_date = sortedEntries.length > 0 ? sortedEntries[0].created_at || null : null;
      const first_entry_date = sortedEntries.length > 0 ? sortedEntries[sortedEntries.length - 1].created_at || null : null;

      return {
        consecutive_days,
        total_days_with_entries,
        total_entries,
        latest_entry_date,
        first_entry_date,
        current_streak_start,
      };
    });
  }
}
