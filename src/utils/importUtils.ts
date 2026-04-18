import type { DiaryEntry, LocationDetails, LocationInfo, POI } from '../types/index.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isOptionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === 'boolean';
}

function isOptionalStringArray(value: unknown): value is string[] | undefined {
  return value === undefined || (Array.isArray(value) && value.every((item) => typeof item === 'string'));
}

function isValidPoi(value: unknown): value is POI {
  return isRecord(value)
    && typeof value.name === 'string'
    && typeof value.type === 'string'
    && typeof value.distance === 'number'
    && Number.isFinite(value.distance);
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

function isValidLocationInfo(value: unknown): value is LocationInfo | null | undefined {
  if (value === undefined || value === null) {
    return true;
  }

  return isRecord(value)
    && isOptionalString(value.name)
    && (value.latitude === undefined || (typeof value.latitude === 'number' && Number.isFinite(value.latitude)))
    && (value.longitude === undefined || (typeof value.longitude === 'number' && Number.isFinite(value.longitude)))
    && isOptionalString(value.address)
    && (value.nearbyPOIs === undefined || (Array.isArray(value.nearbyPOIs) && value.nearbyPOIs.every(isValidPoi)))
    && (value.details === undefined || isValidLocationDetails(value.details));
}

function validateImportedEntry(entry: unknown, index: number): asserts entry is DiaryEntry {
  if (!isRecord(entry)) {
    throw new Error(`第 ${index + 1} 条导入数据不是有效对象`);
  }

  if (typeof entry.title !== 'string') {
    throw new Error(`第 ${index + 1} 条导入数据缺少有效标题`);
  }

  if (typeof entry.content !== 'string' || !entry.content.trim()) {
    throw new Error(`第 ${index + 1} 条导入数据缺少有效内容`);
  }

  if (entry.content_type !== undefined && entry.content_type !== 'markdown' && entry.content_type !== 'plain') {
    throw new Error(`第 ${index + 1} 条导入数据的内容类型无效`);
  }

  if (!isOptionalString(entry.mood)) {
    throw new Error(`第 ${index + 1} 条导入数据的心情字段无效`);
  }

  if (!isOptionalString(entry.weather)) {
    throw new Error(`第 ${index + 1} 条导入数据的天气字段无效`);
  }

  if (!isOptionalStringArray(entry.images)) {
    throw new Error(`第 ${index + 1} 条导入数据的图片列表无效`);
  }

  if (!isOptionalStringArray(entry.tags)) {
    throw new Error(`第 ${index + 1} 条导入数据的标签列表无效`);
  }

  if (!isValidLocationInfo(entry.location)) {
    throw new Error(`第 ${index + 1} 条导入数据的位置信息无效`);
  }

  if (!isOptionalBoolean(entry.hidden)) {
    throw new Error(`第 ${index + 1} 条导入数据的隐藏状态无效`);
  }

  if (entry.created_at !== undefined && (typeof entry.created_at !== 'string' || Number.isNaN(Date.parse(entry.created_at)))) {
    throw new Error(`第 ${index + 1} 条导入数据的创建时间无效`);
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

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('文件内容为空或格式不支持'));
    };

    reader.onerror = () => {
      reject(new Error('文件读取失败，请重试'));
    };

    reader.readAsText(file);
  });
}

export async function parseEntriesBackup(file: File): Promise<DiaryEntry[]> {
  const fileText = await readFileAsText(file);
  const data = JSON.parse(fileText) as unknown;
  return parseEntriesBackupData(data);
}
