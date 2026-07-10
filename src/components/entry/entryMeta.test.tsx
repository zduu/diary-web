import { describe, expect, it } from 'vitest';
import {
  getEntryMoodEmoji,
  getEntryMoodLabel,
  getEntryWeatherIcon,
  getEntryWeatherLabel,
} from './entryMeta';
import { MAX_ENTRY_MOOD_LENGTH, MAX_ENTRY_WEATHER_LENGTH } from '../../utils/entryTextValidation';

describe('entryMeta', () => {
  it('falls back for malformed mood and weather values', () => {
    expect(getEntryMoodEmoji(123)).toBe('😐');
    expect(getEntryMoodLabel(123)).toBe('平静');
    expect(getEntryWeatherLabel(null)).toBe('未知');
    expect(getEntryWeatherIcon(undefined).props.className).toContain('text-slate-400');
  });

  it('keeps bounded custom mood and weather labels', () => {
    expect(getEntryMoodLabel(` ${'m'.repeat(MAX_ENTRY_MOOD_LENGTH + 5)} `)).toBe('m'.repeat(MAX_ENTRY_MOOD_LENGTH));
    expect(getEntryWeatherLabel(` ${'w'.repeat(MAX_ENTRY_WEATHER_LENGTH + 5)} `)).toBe('w'.repeat(MAX_ENTRY_WEATHER_LENGTH));
  });
});
