import { describe, expect, it } from 'vitest';
import { getArchiveEntryIndicators, getArchiveEntryTimestamp } from './archiveEntryMeta';

describe('archiveEntryMeta', () => {
  it('uses fallback labels for missing or invalid timestamps', () => {
    expect(getArchiveEntryTimestamp()).toEqual({
      dateLabel: '日期未知',
      timeLabel: '--:--',
    });
    expect(getArchiveEntryTimestamp('not-a-date')).toEqual({
      dateLabel: '日期未知',
      timeLabel: '--:--',
    });
  });

  it('sanitizes malformed mood and weather indicators', () => {
    expect(getArchiveEntryIndicators(123, null)).toEqual({
      moodDisplay: null,
      weatherDisplay: null,
    });
    expect(getArchiveEntryIndicators('happy', 'sunny')).toEqual({
      moodDisplay: '😊',
      weatherDisplay: '☀️',
    });
  });
});
