import type { ApiResponse, DiaryEntry, LocationDetails, LocationInfo, POI } from '../../src/types/index.ts';
import {
  createPublicSettingsResponse,
  isPublicBooleanSettingKey,
  publicBooleanSettingKeys,
  publicBooleanSettingStorageDefaults,
} from '../../src/services/publicSettingsSchema.ts';
import type { PublicBooleanSettingKey } from '../../src/services/publicSettingsSchema.ts';

export interface Env {
  DB: D1Database;
  IMAGES_BUCKET?: R2Bucket;
  ENVIRONMENT?: string;
  APP_TIMEZONE?: string;
  SESSION_SECRET?: string;
  ADMIN_BOOTSTRAP_PASSWORD?: string;
  APP_BOOTSTRAP_PASSWORD?: string;
  STATS_API_KEY?: string;
  IMAGES_ACCOUNT_ID?: string;
  IMAGES_API_TOKEN?: string;
  IMAGES_DELIVERY_URL?: string;
  IMAGES_VARIANT?: string;
}

export type AuthScope = 'app' | 'admin';

type PasswordConfig = {
  hashKey: 'admin_password_hash' | 'app_password_hash';
  legacyKey: 'admin_password' | 'app_password';
  bootstrapPassword?: string;
};

type SessionPayload = {
  role: AuthScope;
  exp: number;
};

export type SessionInfo = {
  isAuthenticated: boolean;
  isAdminAuthenticated: boolean;
  role: AuthScope | null;
};

const textEncoder = new TextEncoder();
const SESSION_COOKIE_NAME = 'diary_session';
const PASSWORD_HASH_PREFIX = 'pbkdf2';
const PASSWORD_HASH_ITERATIONS = 100000;
const MAX_SUPPORTED_PASSWORD_HASH_ITERATIONS = 100000;
const MAX_TITLE_LENGTH = 200;
const MAX_CONTENT_LENGTH = 50000;
const MAX_MOOD_LENGTH = 50;
const MAX_WEATHER_LENGTH = 50;
const MAX_IMAGES_COUNT = 20;
const MAX_IMAGE_URL_LENGTH = 2048;
const MAX_TAGS_COUNT = 30;
const MAX_TAG_LENGTH = 64;
const MAX_LOCATION_JSON_LENGTH = 8192;
export type PublicSettingKey = PublicBooleanSettingKey;

type EntryInput = Partial<Omit<DiaryEntry, 'id' | 'updated_at'>>;

type NormalizedEntryInput = {
  title?: string;
  content?: string;
  content_type?: 'markdown' | 'plain';
  mood?: string;
  weather?: string;
  images?: string;
  location?: string | null;
  tags?: string;
  hidden?: number;
  created_at?: string;
};

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
};

const defaultApiHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
  'X-Content-Type-Options': 'nosniff',
};

function toBase64Url(value: string | Uint8Array): string {
  const bytes = typeof value === 'string' ? textEncoder.encode(value) : value;
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = textEncoder.encode(left);
  const rightBytes = textEncoder.encode(right);
  let mismatch = leftBytes.length === rightBytes.length ? 0 : 1;
  const length = Math.max(leftBytes.length, rightBytes.length);

  for (let index = 0; index < length; index += 1) {
    mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return mismatch === 0;
}

function getPasswordConfig(scope: AuthScope, env: Env): PasswordConfig {
  return scope === 'admin'
    ? {
        hashKey: 'admin_password_hash',
        legacyKey: 'admin_password',
        bootstrapPassword: env.ADMIN_BOOTSTRAP_PASSWORD,
      }
    : {
        hashKey: 'app_password_hash',
        legacyKey: 'app_password',
        bootstrapPassword: env.APP_BOOTSTRAP_PASSWORD,
      };
}

function getSessionSecret(env: Env): string | null {
  const configuredSecret = env.SESSION_SECRET?.trim();
  if (configuredSecret) {
    return configuredSecret;
  }

  if (env.ENVIRONMENT === 'production') {
    return null;
  }

  return env.ADMIN_BOOTSTRAP_PASSWORD?.trim() || 'local-dev-session-secret';
}

function requireSessionSecret(env: Env): string {
  const secret = getSessionSecret(env);

  if (!secret) {
    throw new Error('SESSION_SECRET 未配置，生产环境拒绝创建会话');
  }

  return secret;
}

function isSecureCookieRequest(request: Request | undefined, env: Env): boolean {
  if (request) {
    const forwardedProto = request.headers.get('X-Forwarded-Proto')?.trim().toLowerCase();
    if (forwardedProto === 'https') {
      return true;
    }

    if (forwardedProto === 'http') {
      return false;
    }

    try {
      return new URL(request.url).protocol === 'https:';
    } catch {
      // Fall through to env-based fallback when request URL is malformed.
    }
  }

  return env.ENVIRONMENT === 'production';
}

function validateMaxLength(value: string, maxLength: number, error: string): string | null {
  if (value.length > maxLength) {
    return error;
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPoi(value: unknown): value is POI {
  return isRecord(value)
    && typeof value.name === 'string'
    && typeof value.type === 'string'
    && isFiniteNumber(value.distance);
}

function isLocationDetails(value: unknown): value is LocationDetails {
  if (!isRecord(value)) {
    return false;
  }

  return isOptionalString(value.building)
    && isOptionalString(value.house_number)
    && isOptionalString(value.road)
    && isOptionalString(value.neighbourhood)
    && isOptionalString(value.suburb)
    && isOptionalString(value.city)
    && isOptionalString(value.state)
    && isOptionalString(value.country);
}

function isLocationInfo(value: unknown): value is LocationInfo {
  if (!isRecord(value)) {
    return false;
  }

  const nearbyPOIs = value.nearbyPOIs;
  const details = value.details;

  return isOptionalString(value.name)
    && (value.latitude === undefined || isFiniteNumber(value.latitude))
    && (value.longitude === undefined || isFiniteNumber(value.longitude))
    && isOptionalString(value.address)
    && (nearbyPOIs === undefined || (Array.isArray(nearbyPOIs) && nearbyPOIs.every(isPoi)))
    && (details === undefined || isLocationDetails(details));
}

function parseStoredJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function parseStoredStringArray(value: unknown): string[] {
  const parsed = parseStoredJson<unknown>(value, []);
  return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : [];
}

function parseStoredLocation(value: unknown): LocationInfo | null {
  if (typeof value !== 'string' || !value) {
    return null;
  }

  const parsed = parseStoredJson<unknown>(value, null);
  return isLocationInfo(parsed) ? parsed : null;
}

function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(';').reduce<Record<string, string>>((cookies, part) => {
    const [rawKey, ...rawValue] = part.trim().split('=');

    if (!rawKey) {
      return cookies;
    }

    const rawCookieValue = rawValue.join('=');

    try {
      cookies[rawKey] = decodeURIComponent(rawCookieValue);
    } catch {
      cookies[rawKey] = rawCookieValue;
    }

    return cookies;
  }, {});
}

async function derivePasswordHash(password: string, salt: string, iterations: number): Promise<string> {
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: textEncoder.encode(salt),
      iterations,
    },
    passwordKey,
    256
  );

  return toBase64Url(new Uint8Array(derivedBits));
}

export async function createPasswordHash(password: string): Promise<string> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = Array.from(saltBytes, (value) => value.toString(16).padStart(2, '0')).join('');
  const hash = await derivePasswordHash(password, salt, PASSWORD_HASH_ITERATIONS);
  return `${PASSWORD_HASH_PREFIX}$${PASSWORD_HASH_ITERATIONS}$${salt}$${hash}`;
}

async function verifyPasswordHash(storedHash: string, password: string): Promise<boolean> {
  const [prefix, iterationsValue, salt, expectedHash] = storedHash.split('$');
  const iterations = Number(iterationsValue);

  if (prefix !== PASSWORD_HASH_PREFIX || !salt || !expectedHash || !Number.isFinite(iterations)) {
    return false;
  }

  if (iterations < 1 || iterations > MAX_SUPPORTED_PASSWORD_HASH_ITERATIONS) {
    throw new Error(
      `当前部署环境不支持该密码哈希参数，请重置密码后重试（支持的最大 PBKDF2 迭代次数为 ${MAX_SUPPORTED_PASSWORD_HASH_ITERATIONS}）`
    );
  }

  const actualHash = await derivePasswordHash(password, salt, iterations);
  return timingSafeEqual(actualHash, expectedHash);
}

export async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const result = await db.prepare(
    'SELECT setting_value FROM app_settings WHERE setting_key = ?'
  ).bind(key).first<{ setting_value: string }>();

  return result?.setting_value ?? null;
}

export async function setSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db.prepare(`
    INSERT INTO app_settings (setting_key, setting_value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(setting_key)
    DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP
  `).bind(key, value).run();
}

export async function deleteSetting(db: D1Database, key: string): Promise<void> {
  await db.prepare('DELETE FROM app_settings WHERE setting_key = ?').bind(key).run();
}

export async function getPublicSettings(db: D1Database): Promise<Record<PublicSettingKey, string>> {
  const placeholders = publicBooleanSettingKeys.map(() => '?').join(', ');
  const { results } = await db.prepare(
    `SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN (${placeholders})`
  ).bind(...publicBooleanSettingKeys).all<{ setting_key: PublicSettingKey; setting_value: string }>();

  const settings: Record<PublicSettingKey, string> = { ...publicBooleanSettingStorageDefaults };

  for (const row of results) {
    settings[row.setting_key] = row.setting_value;
  }

  return settings;
}

async function buildPublicSettingsPayload(db: D1Database) {
  return createPublicSettingsResponse(await getPublicSettings(db));
}

export async function isPasswordConfigured(db: D1Database, scope: AuthScope, env: Env): Promise<boolean> {
  const config = getPasswordConfig(scope, env);
  const [hashValue, legacyValue] = await Promise.all([
    getSetting(db, config.hashKey),
    getSetting(db, config.legacyKey),
  ]);

  return Boolean(hashValue || legacyValue || config.bootstrapPassword?.trim());
}

export async function setPasswordForScope(db: D1Database, scope: AuthScope, password: string): Promise<void> {
  const config = getPasswordConfig(scope, {} as Env);
  const passwordHash = await createPasswordHash(password);

  await setSetting(db, config.hashKey, passwordHash);
  await deleteSetting(db, config.legacyKey);
}

export async function verifyPasswordForScope(
  db: D1Database,
  scope: AuthScope,
  candidate: string,
  env: Env
): Promise<boolean> {
  const config = getPasswordConfig(scope, env);
  const [hashValue, legacyValue] = await Promise.all([
    getSetting(db, config.hashKey),
    getSetting(db, config.legacyKey),
  ]);

  if (hashValue) {
    try {
      return await verifyPasswordHash(hashValue, candidate);
    } catch (error) {
      if (
        error instanceof Error
        && config.bootstrapPassword?.trim()
        && timingSafeEqual(config.bootstrapPassword, candidate)
      ) {
        await setPasswordForScope(db, scope, candidate);
        return true;
      }

      throw error;
    }
  }

  if (legacyValue) {
    const matched = timingSafeEqual(legacyValue, candidate);

    if (matched) {
      await setPasswordForScope(db, scope, candidate);
    }

    return matched;
  }

  if (config.bootstrapPassword?.trim() && timingSafeEqual(config.bootstrapPassword, candidate)) {
    await setPasswordForScope(db, scope, candidate);
    return true;
  }

  return false;
}

async function importSessionKey(
  env: Env,
  usage: 'sign' | 'verify',
  requireSecret = false
): Promise<CryptoKey | null> {
  const secret = requireSecret ? requireSessionSecret(env) : getSessionSecret(env);
  if (!secret) {
    return null;
  }

  return crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage]
  );
}

async function signSessionPayload(payloadBase64: string, env: Env, requireSecret = false): Promise<string | null> {
  const key = await importSessionKey(env, 'sign', requireSecret);
  if (!key) {
    return null;
  }

  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(payloadBase64));
  return toBase64Url(new Uint8Array(signature));
}

export async function createSessionToken(scope: AuthScope, env: Env): Promise<string> {
  const payload: SessionPayload = {
    role: scope,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };

  const payloadBase64 = toBase64Url(JSON.stringify(payload));
  const signature = await signSessionPayload(payloadBase64, env, true);
  if (!signature) {
    throw new Error('SESSION_SECRET 未配置，生产环境拒绝创建会话');
  }

  return `${payloadBase64}.${signature}`;
}

export async function readSession(
  request: Request,
  env: Env
): Promise<SessionInfo> {
  const cookies = parseCookies(request.headers.get('Cookie'));
  const token = cookies[SESSION_COOKIE_NAME];

  if (!token) {
    return { isAuthenticated: false, isAdminAuthenticated: false, role: null };
  }

  const tokenParts = token.split('.');
  if (tokenParts.length !== 2) {
    return { isAuthenticated: false, isAdminAuthenticated: false, role: null };
  }

  const [payloadBase64, providedSignature] = tokenParts;

  if (!payloadBase64 || !providedSignature) {
    return { isAuthenticated: false, isAdminAuthenticated: false, role: null };
  }

  const expectedSignature = await signSessionPayload(payloadBase64, env);
  if (!expectedSignature) {
    return { isAuthenticated: false, isAdminAuthenticated: false, role: null };
  }

  if (!timingSafeEqual(expectedSignature, providedSignature)) {
    return { isAuthenticated: false, isAdminAuthenticated: false, role: null };
  }

  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadBase64))) as SessionPayload;

    if (payload.exp <= Date.now() || (payload.role !== 'app' && payload.role !== 'admin')) {
      return { isAuthenticated: false, isAdminAuthenticated: false, role: null };
    }

    return {
      isAuthenticated: true,
      isAdminAuthenticated: payload.role === 'admin',
      role: payload.role,
    };
  } catch {
    return { isAuthenticated: false, isAdminAuthenticated: false, role: null };
  }
}

export function getAdminAccessStatus(session: Pick<SessionInfo, 'isAuthenticated' | 'isAdminAuthenticated'>): 401 | 403 {
  return session.isAuthenticated && !session.isAdminAuthenticated ? 403 : 401;
}

export function requireAdminSession(session: SessionInfo): Response | null {
  if (session.isAdminAuthenticated) {
    return null;
  }

  return jsonResponse<ApiResponse>({
    success: false,
    error: '需要管理员权限',
  }, { status: getAdminAccessStatus(session) });
}

export function buildSessionCookie(token: string, env: Env, request?: Request): string {
  const secure = isSecureCookieRequest(request, env) ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure}`;
}

export function clearSessionCookie(env: Env, request?: Request): string {
  const secure = isSecureCookieRequest(request, env) ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`;
}

export async function getAdminSettingsPayload(db: D1Database, env: Env) {
  const publicSettings = await buildPublicSettingsPayload(db);
  const [adminPasswordConfigured, appPasswordConfigured] = await Promise.all([
    isPasswordConfigured(db, 'admin', env),
    isPasswordConfigured(db, 'app', env),
  ]);

  return {
    ...publicSettings,
    adminPasswordConfigured,
    appPasswordConfigured,
  };
}

export async function getPublicSettingsPayload(db: D1Database) {
  return buildPublicSettingsPayload(db);
}

export function isPublicSettingKey(key: string): key is PublicSettingKey {
  return isPublicBooleanSettingKey(key);
}

export function formatEntry(row: Record<string, unknown>): DiaryEntry {
  return {
    id: Number(row.id),
    title: String(row.title ?? ''),
    content: String(row.content ?? ''),
    content_type: (row.content_type as 'markdown' | 'plain') || 'markdown',
    mood: String(row.mood ?? 'neutral'),
    weather: String(row.weather ?? 'unknown'),
    images: parseStoredStringArray(row.images),
    location: parseStoredLocation(row.location),
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
    tags: parseStoredStringArray(row.tags),
    hidden: Boolean(row.hidden),
  };
}

export function normalizeEntryInput(
  input: unknown,
  options: {
    requireContent?: boolean;
    includeCreatedAt?: boolean;
    allowPartial?: boolean;
  } = {}
): { data?: NormalizedEntryInput; error?: string } {
  if (!isRecord(input)) {
    return { error: '请求体格式无效' };
  }

  const data: NormalizedEntryInput = {};
  const {
    requireContent = false,
    includeCreatedAt = false,
    allowPartial = false,
  } = options;

  if (!allowPartial || input.title !== undefined) {
    if (input.title !== undefined && typeof input.title !== 'string') {
      return { error: '标题必须是字符串' };
    }

    if (!allowPartial || input.title !== undefined) {
      const title = typeof input.title === 'string' ? input.title.trim() || '无标题' : '无标题';
      const titleError = validateMaxLength(title, MAX_TITLE_LENGTH, `标题长度不能超过 ${MAX_TITLE_LENGTH} 字符`);
      if (titleError) {
        return { error: titleError };
      }

      data.title = title;
    }
  }

  if (input.content !== undefined) {
    if (typeof input.content !== 'string') {
      return { error: '内容必须是字符串' };
    }

    const content = input.content.trim();
    if (!content) {
      return { error: '日记内容不能为空' };
    }

    const contentError = validateMaxLength(content, MAX_CONTENT_LENGTH, `内容长度不能超过 ${MAX_CONTENT_LENGTH} 字符`);
    if (contentError) {
      return { error: contentError };
    }

    data.content = content;
  } else if (requireContent) {
    return { error: '日记内容不能为空' };
  } else if (!allowPartial) {
    data.content = '';
  }

  if (!allowPartial || input.content_type !== undefined) {
    if (input.content_type !== undefined && input.content_type !== 'markdown' && input.content_type !== 'plain') {
      return { error: '内容类型仅支持 markdown 或 plain' };
    }

    if (!allowPartial || input.content_type !== undefined) {
      data.content_type = (input.content_type as 'markdown' | 'plain' | undefined) ?? 'markdown';
    }
  }

  if (!allowPartial || input.mood !== undefined) {
    if (input.mood !== undefined && typeof input.mood !== 'string') {
      return { error: '心情必须是字符串' };
    }

    if (!allowPartial || input.mood !== undefined) {
      const mood = typeof input.mood === 'string' ? input.mood : 'neutral';
      const moodError = validateMaxLength(mood, MAX_MOOD_LENGTH, `心情长度不能超过 ${MAX_MOOD_LENGTH} 字符`);
      if (moodError) {
        return { error: moodError };
      }

      data.mood = mood;
    }
  }

  if (!allowPartial || input.weather !== undefined) {
    if (input.weather !== undefined && typeof input.weather !== 'string') {
      return { error: '天气必须是字符串' };
    }

    if (!allowPartial || input.weather !== undefined) {
      const weather = typeof input.weather === 'string' ? input.weather : 'unknown';
      const weatherError = validateMaxLength(weather, MAX_WEATHER_LENGTH, `天气长度不能超过 ${MAX_WEATHER_LENGTH} 字符`);
      if (weatherError) {
        return { error: weatherError };
      }

      data.weather = weather;
    }
  }

  if (!allowPartial || input.images !== undefined) {
    if (input.images !== undefined) {
      if (!Array.isArray(input.images) || !input.images.every((item) => typeof item === 'string')) {
        return { error: '图片列表必须是字符串数组' };
      }

      if (input.images.length > MAX_IMAGES_COUNT) {
        return { error: `图片数量不能超过 ${MAX_IMAGES_COUNT} 张` };
      }

      if (input.images.some((item) => item.length > MAX_IMAGE_URL_LENGTH)) {
        return { error: `图片地址长度不能超过 ${MAX_IMAGE_URL_LENGTH} 字符` };
      }

      data.images = JSON.stringify(input.images);
    } else if (!allowPartial) {
      data.images = '[]';
    }
  }

  if (!allowPartial || input.tags !== undefined) {
    if (input.tags !== undefined) {
      if (!Array.isArray(input.tags) || !input.tags.every((item) => typeof item === 'string')) {
        return { error: '标签列表必须是字符串数组' };
      }

      if (input.tags.length > MAX_TAGS_COUNT) {
        return { error: `标签数量不能超过 ${MAX_TAGS_COUNT} 个` };
      }

      if (input.tags.some((item) => item.length > MAX_TAG_LENGTH)) {
        return { error: `单个标签长度不能超过 ${MAX_TAG_LENGTH} 字符` };
      }

      data.tags = JSON.stringify(input.tags);
    } else if (!allowPartial) {
      data.tags = '[]';
    }
  }

  if (!allowPartial || input.location !== undefined) {
    if (input.location !== undefined) {
      if (input.location !== null && !isLocationInfo(input.location)) {
        return { error: '位置信息格式无效' };
      }

      if (input.location) {
        const serializedLocation = JSON.stringify(input.location);
        if (serializedLocation.length > MAX_LOCATION_JSON_LENGTH) {
          return { error: '位置信息过大，请精简后重试' };
        }

        data.location = serializedLocation;
      } else {
        data.location = null;
      }
    } else if (!allowPartial) {
      data.location = null;
    }
  }

  if (!allowPartial || input.hidden !== undefined) {
    if (input.hidden !== undefined && typeof input.hidden !== 'boolean') {
      return { error: '隐藏状态必须是布尔值' };
    }

    if (!allowPartial || input.hidden !== undefined) {
      data.hidden = input.hidden ? 1 : 0;
    }
  }

  if (includeCreatedAt && input.created_at !== undefined) {
    if (typeof input.created_at !== 'string' || Number.isNaN(Date.parse(input.created_at))) {
      return { error: '创建时间格式无效' };
    }

    data.created_at = input.created_at;
  } else if (includeCreatedAt && !allowPartial) {
    data.created_at = new Date().toISOString();
  }

  return { data };
}

export function parseEntryId(value: string): number | null {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function jsonResponse<T>(
  payload: ApiResponse<T>,
  init: ResponseInit = {}
): Response {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');

  for (const [key, value] of Object.entries(defaultApiHeaders)) {
    if (!headers.has(key)) {
      headers.set(key, value);
    }
  }

  for (const [key, value] of Object.entries(corsHeaders)) {
    if (!headers.has(key)) {
      headers.set(key, value);
    }
  }

  return new Response(JSON.stringify(payload), {
    ...init,
    headers,
  });
}

export async function parseJsonBody<T>(
  request: Request,
  options: {
    requireObject?: boolean;
    requireJsonContentType?: boolean;
    maxBodyBytes?: number;
  } = {}
): Promise<{ data?: T; error?: string; status?: number }> {
  if (options.requireJsonContentType) {
    const contentType = request.headers.get('Content-Type')?.toLowerCase() ?? '';
    if (!contentType.includes('application/json')) {
      return {
        error: '请求 Content-Type 必须为 application/json',
        status: 415,
      };
    }
  }

  let rawBody = '';
  try {
    rawBody = await request.text();
  } catch {
    return { error: '请求体读取失败', status: 400 };
  }

  if (options.maxBodyBytes != null && textEncoder.encode(rawBody).length > options.maxBodyBytes) {
    return {
      error: `请求体超过大小限制（最大 ${options.maxBodyBytes} 字节）`,
      status: 413,
    };
  }

  try {
    const data = JSON.parse(rawBody) as T;

    if (
      options.requireObject
      && (data == null || typeof data !== 'object' || Array.isArray(data))
    ) {
      return { error: '请求体必须是 JSON 对象', status: 400 };
    }

    return { data };
  } catch {
    return { error: '请求体不是合法 JSON', status: 400 };
  }
}

export function optionsResponse(): Response {
  const headers = new Headers(corsHeaders);

  for (const [key, value] of Object.entries(defaultApiHeaders)) {
    headers.set(key, value);
  }

  return new Response(null, { headers });
}
