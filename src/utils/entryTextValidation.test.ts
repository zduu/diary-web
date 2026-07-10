import { describe, expect, it } from 'vitest';
import {
  sanitizeEntryContentType,
  sanitizeEntryHidden,
  sanitizeEntryMood,
  sanitizeEntryWeather,
} from './entryTextValidation';

describe('entryTextValidation', () => {
  it('sanitizes content type values', () => {
    expect(sanitizeEntryContentType('plain')).toBe('plain');
    expect(sanitizeEntryContentType('markdown')).toBe('markdown');
    expect(sanitizeEntryContentType('html')).toBe('markdown');
  });

  it('treats only boolean true as hidden', () => {
    expect(sanitizeEntryHidden(true)).toBe(true);
    expect(sanitizeEntryHidden(false)).toBe(false);
    expect(sanitizeEntryHidden('true')).toBe(false);
    expect(sanitizeEntryHidden(1)).toBe(false);
  });

  it('falls back malformed mood and weather values', () => {
    expect(sanitizeEntryMood(null)).toBe('neutral');
    expect(sanitizeEntryWeather(undefined)).toBe('unknown');
  });
});
