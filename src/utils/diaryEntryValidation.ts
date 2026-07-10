import type { DiaryEntry } from '../types/index.ts';
import {
  MAX_ENTRY_CONTENT_LENGTH,
  MAX_ENTRY_MOOD_LENGTH,
  MAX_ENTRY_TITLE_LENGTH,
  MAX_ENTRY_WEATHER_LENGTH,
  isValidOptionalEntryTags,
  isWithinMaxLength,
} from './entryTextValidation.ts';
import { isValidImageSourceArray } from './imageSourceValidation.ts';
import { isPersistedDiaryEntryId } from './diaryEntryIdentity.ts';
import { isValidLocationInfo } from './importUtils.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isOptionalNullableString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string';
}

function isOptionalImageSourceArray(value: unknown): value is string[] | undefined {
  return value === undefined || isValidImageSourceArray(value);
}

function isOptionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === 'boolean';
}

export function isDiaryEntry(value: unknown): value is DiaryEntry {
  return isRecord(value) &&
    (value.id === undefined || isPersistedDiaryEntryId(value.id)) &&
    isOptionalString(value.entry_uuid) &&
    typeof value.title === 'string' &&
    isWithinMaxLength(value.title.trim() || '无标题', MAX_ENTRY_TITLE_LENGTH) &&
    typeof value.content === 'string' &&
    value.content.trim().length > 0 &&
    isWithinMaxLength(value.content, MAX_ENTRY_CONTENT_LENGTH) &&
    (value.content_type === undefined || value.content_type === 'markdown' || value.content_type === 'plain') &&
    isOptionalString(value.mood) &&
    (value.mood === undefined || isWithinMaxLength(value.mood, MAX_ENTRY_MOOD_LENGTH)) &&
    isOptionalString(value.weather) &&
    (value.weather === undefined || isWithinMaxLength(value.weather, MAX_ENTRY_WEATHER_LENGTH)) &&
    isOptionalImageSourceArray(value.images) &&
    isValidLocationInfo(value.location) &&
    isOptionalString(value.created_at) &&
    isOptionalString(value.updated_at) &&
    isOptionalNullableString(value.last_synced_at) &&
    isOptionalNullableString(value.deleted_at) &&
    (value.sync_state === undefined ||
      value.sync_state === 'synced' ||
      value.sync_state === 'pending_create' ||
      value.sync_state === 'pending_update' ||
      value.sync_state === 'pending_delete' ||
      value.sync_state === 'conflict') &&
    isValidOptionalEntryTags(value.tags) &&
    isOptionalBoolean(value.hidden);
}

export function isDiaryEntryArray(value: unknown): value is DiaryEntry[] {
  return Array.isArray(value) && value.every(isDiaryEntry);
}
