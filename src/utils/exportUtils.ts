import { Database, FileText } from 'lucide-react';
import type { ComponentType, CSSProperties } from 'react';
import { getEntryMoodLabel, getEntryWeatherLabel } from '../components/entry/entryMeta';
import type { DiaryEntry, EntrySyncState } from '../types/index.ts';
import {
  MAX_ENTRY_MOOD_LENGTH,
  MAX_ENTRY_WEATHER_LENGTH,
  sanitizeEntryContent,
  sanitizeEntryContentType,
  sanitizeEntryHidden,
  sanitizeEntryMood,
  sanitizeEntryTags,
  sanitizeEntryTitle,
  sanitizeEntryWeather,
} from './entryTextValidation.ts';
import { isValidImageSource, MAX_ENTRY_IMAGES_COUNT } from './imageSourceValidation.ts';
import { isValidLocationInfo } from './importUtils.ts';
import { parseTimeString } from './timestampUtils.ts';

export type DiaryExportFormat = 'json' | 'txt';

interface DiaryExportPayloadOptions {
  entries: DiaryEntry[];
  exportType: string;
  includeHidden: boolean;
  exportedAt?: Date;
}

interface DiaryTextExportOptions extends DiaryExportPayloadOptions {}

export interface ExportFormatOption {
  value: DiaryExportFormat;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string; style?: CSSProperties }>;
}

const exportTypeFileSegments: Record<string, string> = {
  全部日记: 'all',
  搜索结果: 'search',
  筛选结果: 'filter',
};

const exportVersion = '1.0';
const zhCnLocale = 'zh-CN';
const EXPORT_IMAGE_FETCH_TIMEOUT_MS = 15_000;
const validSyncStates = new Set<EntrySyncState>([
  'synced',
  'pending_create',
  'pending_update',
  'pending_delete',
  'conflict',
]);

export const exportFormatOptions: ExportFormatOption[] = [
  {
    value: 'json',
    title: 'JSON 格式',
    description: '完整数据，可重新导入',
    icon: Database,
  },
  {
    value: 'txt',
    title: '文本格式',
    description: '纯文本，易于阅读',
    icon: FileText,
  },
];

function formatExportDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function formatExportTimestamp(value: string | Date): string {
  const date = value instanceof Date ? value : parseTimeString(value);
  return date ? date.toLocaleString(zhCnLocale) : '未知时间';
}

function encodeBytesToBase64(bytes: Uint8Array) {
  let binary = '';

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }

  return btoa(binary);
}

function isEmbeddedImageUrl(imageUrl: string) {
  return imageUrl.toLowerCase().startsWith('data:image/');
}

function getExportableEntryImages(images: string[] | null | undefined): string[] {
  if (!Array.isArray(images)) {
    return [];
  }

  return images.filter(isValidImageSource).slice(0, MAX_ENTRY_IMAGES_COUNT);
}

async function withExportImageFetchTimeout<T>(task: (signal?: AbortSignal) => Promise<T>): Promise<T> {
  const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller?.abort();
      reject(new Error('图片获取超时'));
    }, EXPORT_IMAGE_FETCH_TIMEOUT_MS);
  });

  try {
    return await Promise.race([
      task(controller?.signal),
      timeoutPromise,
    ]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

function normalizeOptionalExportText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return undefined;
  }

  return normalizedValue.length > maxLength ? normalizedValue.slice(0, maxLength) : normalizedValue;
}

function isValidExportTimestamp(value: unknown): value is string {
  return typeof value === 'string' && parseTimeString(value) !== null;
}

function sanitizeNullableExportTimestamp(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  return isValidExportTimestamp(value) ? value : undefined;
}

function sanitizeExportTimestamps(entry: DiaryEntry): void {
  if (!isValidExportTimestamp(entry.created_at)) {
    delete entry.created_at;
  }

  if (!isValidExportTimestamp(entry.updated_at)) {
    delete entry.updated_at;
  }

  const lastSyncedAt = sanitizeNullableExportTimestamp(entry.last_synced_at);
  if (lastSyncedAt === undefined) {
    delete entry.last_synced_at;
  } else {
    entry.last_synced_at = lastSyncedAt;
  }

  const deletedAt = sanitizeNullableExportTimestamp(entry.deleted_at);
  if (deletedAt === undefined) {
    delete entry.deleted_at;
  } else {
    entry.deleted_at = deletedAt;
  }
}

function sanitizeEntriesForExport(entries: DiaryEntry[]): DiaryEntry[] {
  return entries.map((entry) => {
    const sanitizedEntry: DiaryEntry = {
      ...entry,
      title: sanitizeEntryTitle(entry.title),
      content: sanitizeEntryContent(entry.content, '（空内容）').trim() || '（空内容）',
      content_type: sanitizeEntryContentType(entry.content_type),
      images: getExportableEntryImages(entry.images),
      tags: sanitizeEntryTags(entry.tags),
      hidden: sanitizeEntryHidden(entry.hidden),
    };

    const mood = normalizeOptionalExportText(entry.mood, MAX_ENTRY_MOOD_LENGTH);
    if (mood === undefined) {
      delete sanitizedEntry.mood;
    } else {
      sanitizedEntry.mood = mood;
    }

    const weather = normalizeOptionalExportText(entry.weather, MAX_ENTRY_WEATHER_LENGTH);
    if (weather === undefined) {
      delete sanitizedEntry.weather;
    } else {
      sanitizedEntry.weather = weather;
    }

    if (!isValidLocationInfo(entry.location)) {
      sanitizedEntry.location = null;
    }

    if (typeof entry.entry_uuid !== 'string' || !entry.entry_uuid.trim()) {
      delete sanitizedEntry.entry_uuid;
    } else {
      sanitizedEntry.entry_uuid = entry.entry_uuid.trim();
    }

    if (sanitizedEntry.sync_state !== undefined && !validSyncStates.has(sanitizedEntry.sync_state)) {
      delete sanitizedEntry.sync_state;
    }

    if (typeof sanitizedEntry.id !== 'number' || !Number.isInteger(sanitizedEntry.id) || sanitizedEntry.id <= 0) {
      delete sanitizedEntry.id;
    }

    sanitizeExportTimestamps(sanitizedEntry);

    return sanitizedEntry;
  });
}

async function fetchImageAsDataUrl(
  imageUrl: string,
  options: {
    fetchImpl: typeof fetch;
    baseUrl: string;
  }
) {
  const { fetchImpl, baseUrl } = options;
  const resolvedUrl = new URL(imageUrl, baseUrl).toString();
  const response = await withExportImageFetchTimeout((signal) => fetchImpl(resolvedUrl, {
    credentials: 'same-origin',
    signal,
  }));

  if (!response.ok) {
    throw new Error(`图片获取失败（HTTP ${response.status}）`);
  }

  const bytes = new Uint8Array(await withExportImageFetchTimeout(() => response.arrayBuffer()));
  const contentType = response.headers.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase() || 'application/octet-stream';
  if (!contentType.startsWith('image/')) {
    throw new Error('导出时获取到的资源不是图片');
  }

  if (bytes.byteLength === 0) {
    throw new Error('导出时获取到的图片为空');
  }

  return `data:${contentType};base64,${encodeBytesToBase64(bytes)}`;
}

function buildEntryTextBlock(entry: DiaryEntry, index: number): string {
  const location = entry.location && isValidLocationInfo(entry.location) ? entry.location : null;
  const tags = sanitizeEntryTags(entry.tags);
  const mood = sanitizeEntryMood(entry.mood);
  const weather = sanitizeEntryWeather(entry.weather);
  const sections = [
    `## ${index + 1}. ${entry.title || '无标题'}`,
    '',
    `📅 创建时间: ${entry.created_at ? formatExportTimestamp(entry.created_at) : '未知时间'}`,
  ];

  if (mood !== 'neutral') {
    sections.push(`😊 心情: ${getEntryMoodLabel(mood)}`);
  }

  if (weather !== 'unknown') {
    sections.push(`🌤️ 天气: ${getEntryWeatherLabel(weather)}`);
  }

  if (tags.length > 0) {
    sections.push(`🏷️ 标签: ${tags.map((tag) => `#${tag}`).join(' ')}`);
  }

  if (location?.name) {
    sections.push(`📍 位置: ${location.name}`);
  }

  sections.push('', entry.content, '', '-'.repeat(30), '');
  return sections.join('\n');
}

export function buildDiaryExportFileName(exportType: string, exportedAt = new Date()): string {
  const scope = exportTypeFileSegments[exportType] ?? 'custom';
  return `diary-${scope}-${formatExportDate(exportedAt)}`;
}

export function buildDiaryBackupFileName(exportedAt = new Date()): string {
  return `diary-backup-${formatExportDate(exportedAt)}`;
}

export function createDiaryExportPayload({
  entries,
  exportType,
  includeHidden,
  exportedAt = new Date(),
}: DiaryExportPayloadOptions) {
  const exportEntries = sanitizeEntriesForExport(entries);

  return {
    entries: exportEntries,
    exportDate: exportedAt.toISOString(),
    exportType,
    totalCount: exportEntries.length,
    includeHidden,
    version: exportVersion,
  };
}

export function createDiaryTextExport({
  entries,
  exportType,
  includeHidden,
  exportedAt = new Date(),
}: DiaryTextExportOptions): string {
  const exportEntries = sanitizeEntriesForExport(entries);
  const header = [
    `# ${exportType}`,
    '',
    `导出时间: ${formatExportTimestamp(exportedAt)}`,
    `日记数量: ${exportEntries.length} 条`,
    `包含隐藏日记: ${includeHidden ? '是' : '否'}`,
    '',
    '='.repeat(50),
    '',
  ];

  return [
    ...header,
    ...exportEntries.flatMap((entry, index) => [buildEntryTextBlock(entry, index), '']),
  ].join('\n').trimEnd() + '\n';
}

export async function packageDiaryEntryImagesForExport(options: {
  entries: DiaryEntry[];
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? globalThis.location?.origin ?? 'https://localhost';
  let packagedImageCount = 0;
  let failedImageCount = 0;

  const packagedEntries: DiaryEntry[] = [];

  for (const entry of options.entries) {
    const nextImages: string[] = [];

    for (const imageUrl of getExportableEntryImages(entry.images)) {
      if (isEmbeddedImageUrl(imageUrl)) {
        nextImages.push(imageUrl);
        continue;
      }

      try {
        const dataUrl = await fetchImageAsDataUrl(imageUrl, { fetchImpl, baseUrl });
        nextImages.push(dataUrl);
        packagedImageCount += 1;
      } catch {
        nextImages.push(imageUrl);
        failedImageCount += 1;
      }
    }

    packagedEntries.push({
      ...entry,
      images: nextImages,
    });
  }

  return {
    entries: packagedEntries,
    packagedImageCount,
    failedImageCount,
  };
}

export function downloadBlobFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  try {
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    if (anchor.parentNode) {
      anchor.parentNode.removeChild(anchor);
    }
    URL.revokeObjectURL(url);
  }
}
