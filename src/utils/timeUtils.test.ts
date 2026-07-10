import { describe, expect, it } from 'vitest';
import {
  formatFullDateTime,
  formatTimelineDate,
  getSmartTimeDisplay,
  normalizeTimeString,
  parseTimeString,
} from './timeUtils';

describe('timeUtils', () => {
  it('normalizes SQLite and date-only timestamps as UTC', () => {
    expect(normalizeTimeString('2026-04-14 09:00:00')).toBe('2026-04-14T09:00:00Z');
    expect(normalizeTimeString('2026-04-14')).toBe('2026-04-14T00:00:00Z');
  });

  it('preserves explicit timezone offsets', () => {
    expect(normalizeTimeString('2026-04-14T09:00:00+08:00')).toBe('2026-04-14T09:00:00+08:00');
    expect(normalizeTimeString('2026-04-14T09:00:00-05:00')).toBe('2026-04-14T09:00:00-05:00');
  });

  it('returns null for missing or invalid timestamps', () => {
    expect(parseTimeString()).toBeNull();
    expect(parseTimeString('')).toBeNull();
    expect(parseTimeString('not-a-date')).toBeNull();
  });

  it('uses stable fallback labels for missing or invalid timestamps', () => {
    expect(getSmartTimeDisplay('not-a-date')).toEqual({
      relative: '时间未知',
      absolute: '--:--',
      tooltip: '未知时间',
    });
    expect(formatFullDateTime()).toBe('未知时间');
    expect(formatTimelineDate('not-a-date')).toBe('日期未知');
  });
});
