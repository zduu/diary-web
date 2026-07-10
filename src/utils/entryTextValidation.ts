export const MAX_ENTRY_TITLE_LENGTH = 200;
export const MAX_ENTRY_CONTENT_LENGTH = 50000;
export const MAX_ENTRY_MOOD_LENGTH = 50;
export const MAX_ENTRY_WEATHER_LENGTH = 50;
export const MAX_ENTRY_TAGS_COUNT = 30;
export const MAX_ENTRY_TAG_LENGTH = 64;
export type SanitizedEntryContentType = 'markdown' | 'plain';

export function isWithinMaxLength(value: string, maxLength: number): boolean {
  return value.length <= maxLength;
}

export function isValidEntryTags(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length <= MAX_ENTRY_TAGS_COUNT
    && value.every((item) => typeof item === 'string' && item.length <= MAX_ENTRY_TAG_LENGTH);
}

export function isValidOptionalEntryTags(value: unknown): value is string[] | undefined {
  return value === undefined || isValidEntryTags(value);
}

export function sanitizeEntryTitle(value: unknown, fallbackValue = '无标题'): string {
  const title = typeof value === 'string' ? value.trim() : '';
  const normalizedTitle = title || fallbackValue;
  return normalizedTitle.length > MAX_ENTRY_TITLE_LENGTH
    ? normalizedTitle.slice(0, MAX_ENTRY_TITLE_LENGTH)
    : normalizedTitle;
}

export function sanitizeEntryContent(value: unknown, fallbackValue = ''): string {
  const content = typeof value === 'string' ? value : fallbackValue;
  return content.length > MAX_ENTRY_CONTENT_LENGTH
    ? content.slice(0, MAX_ENTRY_CONTENT_LENGTH)
    : content;
}

export function sanitizeEntryMood(value: unknown, fallbackValue = 'neutral'): string {
  const mood = typeof value === 'string' ? value.trim() : '';
  const normalizedMood = mood || fallbackValue;
  return normalizedMood.length > MAX_ENTRY_MOOD_LENGTH
    ? normalizedMood.slice(0, MAX_ENTRY_MOOD_LENGTH)
    : normalizedMood;
}

export function sanitizeEntryWeather(value: unknown, fallbackValue = 'unknown'): string {
  const weather = typeof value === 'string' ? value.trim() : '';
  const normalizedWeather = weather || fallbackValue;
  return normalizedWeather.length > MAX_ENTRY_WEATHER_LENGTH
    ? normalizedWeather.slice(0, MAX_ENTRY_WEATHER_LENGTH)
    : normalizedWeather;
}

export function sanitizeEntryContentType(value: unknown): SanitizedEntryContentType {
  return value === 'plain' || value === 'markdown' ? value : 'markdown';
}

export function sanitizeEntryHidden(value: unknown): boolean {
  return typeof value === 'boolean' ? value : false;
}

export function sanitizeEntryTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const tags: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      continue;
    }

    const tag = item.trim();
    if (!tag || tag.length > MAX_ENTRY_TAG_LENGTH || tags.includes(tag)) {
      continue;
    }

    tags.push(tag);
    if (tags.length >= MAX_ENTRY_TAGS_COUNT) {
      break;
    }
  }

  return tags;
}
