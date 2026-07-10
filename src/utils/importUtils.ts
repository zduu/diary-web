import type {
  DiaryEntry,
  EntrySyncState,
  LocationCoordinate,
  LocationCoordinateOffset,
  LocationDetails,
  LocationHighAccuracyMeta,
  LocationInfo,
  POI,
} from '../types/index.ts';
import {
  MAX_ENTRY_CONTENT_LENGTH,
  MAX_ENTRY_MOOD_LENGTH,
  MAX_ENTRY_TAG_LENGTH,
  MAX_ENTRY_TAGS_COUNT,
  MAX_ENTRY_TITLE_LENGTH,
  MAX_ENTRY_WEATHER_LENGTH,
} from './entryTextValidation.ts';
import { isValidCoordinatePair, isValidLatitude, isValidLongitude } from './geoCoordinates.ts';
import { isValidImageSourceArray } from './imageSourceValidation.ts';
import { parseTimeString } from './timestampUtils.ts';

const validEntrySyncStates = new Set<EntrySyncState>([
  'synced',
  'pending_create',
  'pending_update',
  'pending_delete',
  'conflict',
]);
const BACKUP_FILE_READ_TIMEOUT_MS = 15_000;

function isEntrySyncState(value: unknown): value is EntrySyncState {
  return typeof value === 'string' && validEntrySyncStates.has(value as EntrySyncState);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isOptionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === 'boolean';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isOptionalStringArray(value: unknown): value is string[] | undefined {
  return value === undefined || (Array.isArray(value) && value.every((item) => typeof item === 'string'));
}

function isOptionalImageSourceArray(value: unknown): value is string[] | undefined {
  return value === undefined || isValidImageSourceArray(value);
}

function isValidOptionalTimestamp(value: unknown, allowNull = false) {
  if (value === undefined) {
    return true;
  }

  if (value === null) {
    return allowNull;
  }

  return typeof value === 'string' && parseTimeString(value) !== null;
}

function isValidPoi(value: unknown): value is POI {
  return isRecord(value)
    && typeof value.name === 'string'
    && typeof value.type === 'string'
    && isNonNegativeFiniteNumber(value.distance);
}

function isValidLocationDetails(value: unknown): value is LocationDetails {
  return isRecord(value)
    && isOptionalString(value.building)
    && isOptionalString(value.house_number)
    && isOptionalString(value.road)
    && isOptionalString(value.neighbourhood)
    && isOptionalString(value.suburb)
    && isOptionalString(value.city)
    && isOptionalString(value.state)
    && isOptionalString(value.country);
}

function isValidLocationCoordinate(value: unknown): value is LocationCoordinate {
  return isRecord(value)
    && isValidCoordinatePair(value.latitude, value.longitude);
}

function isValidLocationCoordinateOffset(value: unknown): value is LocationCoordinateOffset {
  return isRecord(value)
    && isValidCoordinatePair(value.latitude, value.longitude)
    && isNonNegativeFiniteNumber(value.distance);
}

function isValidHighAccuracyMeta(value: unknown): value is LocationHighAccuracyMeta {
  return isRecord(value)
    && (value.accuracy === undefined || isNonNegativeFiniteNumber(value.accuracy))
    && (value.confidence === 'high' || value.confidence === 'medium' || value.confidence === 'low')
    && typeof value.attempts === 'number'
    && Number.isInteger(value.attempts)
    && value.attempts > 0
    && (value.coordinateOffset === undefined || isValidLocationCoordinateOffset(value.coordinateOffset));
}

export function isValidLocationInfo(value: unknown): value is LocationInfo | null | undefined {
  if (value === undefined || value === null) {
    return true;
  }

  return isRecord(value)
    && isOptionalString(value.name)
    && (value.latitude === undefined || isValidLatitude(value.latitude))
    && (value.longitude === undefined || isValidLongitude(value.longitude))
    && isOptionalString(value.address)
    && (value.nearbyPOIs === undefined || (Array.isArray(value.nearbyPOIs) && value.nearbyPOIs.every(isValidPoi)))
    && (value.details === undefined || isValidLocationDetails(value.details))
    && (value.originalGPS === undefined || isValidLocationCoordinate(value.originalGPS))
    && (value.coordinateOffset === undefined || isValidLocationCoordinateOffset(value.coordinateOffset))
    && (value.highAccuracy === undefined || isValidHighAccuracyMeta(value.highAccuracy));
}

function validateImportedEntry(entry: unknown, index: number): asserts entry is DiaryEntry {
  if (!isRecord(entry)) {
    throw new Error(`第 ${index + 1} 条导入数据不是有效对象`);
  }

  if (typeof entry.title !== 'string') {
    throw new Error(`第 ${index + 1} 条导入数据缺少有效标题`);
  }

  const title = entry.title.trim() || '无标题';
  if (title.length > MAX_ENTRY_TITLE_LENGTH) {
    throw new Error(`第 ${index + 1} 条导入数据的标题长度不能超过 ${MAX_ENTRY_TITLE_LENGTH} 字符`);
  }

  if (typeof entry.content !== 'string' || !entry.content.trim()) {
    throw new Error(`第 ${index + 1} 条导入数据缺少有效内容`);
  }

  if (entry.content.length > MAX_ENTRY_CONTENT_LENGTH) {
    throw new Error(`第 ${index + 1} 条导入数据的内容长度不能超过 ${MAX_ENTRY_CONTENT_LENGTH} 字符`);
  }

  if (entry.content_type !== undefined && entry.content_type !== 'markdown' && entry.content_type !== 'plain') {
    throw new Error(`第 ${index + 1} 条导入数据的内容类型无效`);
  }

  if (!isOptionalString(entry.mood)) {
    throw new Error(`第 ${index + 1} 条导入数据的心情字段无效`);
  }

  if (typeof entry.mood === 'string' && entry.mood.length > MAX_ENTRY_MOOD_LENGTH) {
    throw new Error(`第 ${index + 1} 条导入数据的心情长度不能超过 ${MAX_ENTRY_MOOD_LENGTH} 字符`);
  }

  if (!isOptionalString(entry.weather)) {
    throw new Error(`第 ${index + 1} 条导入数据的天气字段无效`);
  }

  if (typeof entry.weather === 'string' && entry.weather.length > MAX_ENTRY_WEATHER_LENGTH) {
    throw new Error(`第 ${index + 1} 条导入数据的天气长度不能超过 ${MAX_ENTRY_WEATHER_LENGTH} 字符`);
  }

  if (!isOptionalImageSourceArray(entry.images)) {
    throw new Error(`第 ${index + 1} 条导入数据的图片列表无效`);
  }

  if (!isOptionalStringArray(entry.tags)) {
    throw new Error(`第 ${index + 1} 条导入数据的标签列表无效`);
  }

  if (entry.tags !== undefined && entry.tags.length > MAX_ENTRY_TAGS_COUNT) {
    throw new Error(`第 ${index + 1} 条导入数据的标签数量不能超过 ${MAX_ENTRY_TAGS_COUNT} 个`);
  }

  if (entry.tags !== undefined && entry.tags.some((tag) => tag.length > MAX_ENTRY_TAG_LENGTH)) {
    throw new Error(`第 ${index + 1} 条导入数据的单个标签长度不能超过 ${MAX_ENTRY_TAG_LENGTH} 字符`);
  }

  if (!isValidLocationInfo(entry.location)) {
    throw new Error(`第 ${index + 1} 条导入数据的位置信息无效`);
  }

  if (!isOptionalBoolean(entry.hidden)) {
    throw new Error(`第 ${index + 1} 条导入数据的隐藏状态无效`);
  }

  if (entry.entry_uuid !== undefined && typeof entry.entry_uuid !== 'string') {
    throw new Error(`第 ${index + 1} 条导入数据的同步标识无效`);
  }

  if (entry.sync_state !== undefined && !isEntrySyncState(entry.sync_state)) {
    throw new Error(`第 ${index + 1} 条导入数据的同步状态无效`);
  }

  if (!isValidOptionalTimestamp(entry.last_synced_at, true)) {
    throw new Error(`第 ${index + 1} 条导入数据的最后同步时间无效`);
  }

  if (!isValidOptionalTimestamp(entry.deleted_at, true)) {
    throw new Error(`第 ${index + 1} 条导入数据的删除时间无效`);
  }

  if (!isValidOptionalTimestamp(entry.created_at)) {
    throw new Error(`第 ${index + 1} 条导入数据的创建时间无效`);
  }

  if (!isValidOptionalTimestamp(entry.updated_at)) {
    throw new Error(`第 ${index + 1} 条导入数据的更新时间无效`);
  }
}

export function parseEntriesBackupData(input: unknown): DiaryEntry[] {
  const importedEntries = Array.isArray(input)
    ? input
    : isRecord(input) && Array.isArray(input.entries)
      ? input.entries
      : null;

  if (!importedEntries) {
    throw new Error('无效的备份文件格式：缺少 entries 数组或日记数组');
  }

  importedEntries.forEach((entry, index) => {
    validateImportedEntry(entry, index);
  });

  return importedEntries as DiaryEntry[];
}

function readFileAsText(file: File): Promise<string> {
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
      settle(() => reject(new Error('文件读取超时，请重新选择备份文件')));
    }, BACKUP_FILE_READ_TIMEOUT_MS);

    reader.onload = () => {
      settle(() => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
          return;
        }

        reject(new Error('文件内容为空或格式不支持'));
      });
    };

    reader.onerror = () => {
      settle(() => reject(new Error('文件读取失败，请重试')));
    };

    reader.onabort = () => {
      settle(() => reject(new Error('文件读取已取消，请重新选择备份文件')));
    };

    try {
      reader.readAsText(file);
    } catch {
      settle(() => reject(new Error('文件读取失败，请重试')));
    }
  });
}

export async function parseEntriesBackup(file: File): Promise<DiaryEntry[]> {
  const fileText = await readFileAsText(file);

  if (!fileText.trim()) {
    throw new Error('备份文件为空，请选择有效的 JSON 备份文件');
  }

  let data: unknown;
  try {
    data = JSON.parse(fileText) as unknown;
  } catch {
    throw new Error('备份文件不是有效的 JSON 格式');
  }

  return parseEntriesBackupData(data);
}
