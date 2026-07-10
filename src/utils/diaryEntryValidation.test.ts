import { describe, expect, it } from 'vitest';
import {
  MAX_ENTRY_CONTENT_LENGTH,
  MAX_ENTRY_MOOD_LENGTH,
  MAX_ENTRY_TAG_LENGTH,
  MAX_ENTRY_TAGS_COUNT,
  MAX_ENTRY_TITLE_LENGTH,
  MAX_ENTRY_WEATHER_LENGTH,
} from './entryTextValidation';
import { isDiaryEntry } from './diaryEntryValidation';

const validEntry = {
  title: '有效标题',
  content: '有效内容',
  mood: 'neutral',
  weather: 'sunny',
  tags: ['日常'],
};

describe('diaryEntryValidation', () => {
  it('accepts entries within text and tag limits', () => {
    expect(isDiaryEntry(validEntry)).toBe(true);
    expect(isDiaryEntry({
      ...validEntry,
      title: '',
      content: ' 有效内容 ',
      tags: Array.from({ length: MAX_ENTRY_TAGS_COUNT }, (_, index) => `tag-${index}`),
    })).toBe(true);
  });

  it('rejects entries that exceed text field limits', () => {
    expect(isDiaryEntry({
      ...validEntry,
      title: 'x'.repeat(MAX_ENTRY_TITLE_LENGTH + 1),
    })).toBe(false);

    expect(isDiaryEntry({
      ...validEntry,
      content: 'x'.repeat(MAX_ENTRY_CONTENT_LENGTH + 1),
    })).toBe(false);

    expect(isDiaryEntry({
      ...validEntry,
      content: '   ',
    })).toBe(false);

    expect(isDiaryEntry({
      ...validEntry,
      content: `${' '.repeat(MAX_ENTRY_CONTENT_LENGTH)}正文`,
    })).toBe(false);

    expect(isDiaryEntry({
      ...validEntry,
      mood: 'x'.repeat(MAX_ENTRY_MOOD_LENGTH + 1),
    })).toBe(false);

    expect(isDiaryEntry({
      ...validEntry,
      weather: 'x'.repeat(MAX_ENTRY_WEATHER_LENGTH + 1),
    })).toBe(false);
  });

  it('rejects entries that exceed tag limits', () => {
    expect(isDiaryEntry({
      ...validEntry,
      tags: Array.from({ length: MAX_ENTRY_TAGS_COUNT + 1 }, (_, index) => `tag-${index}`),
    })).toBe(false);

    expect(isDiaryEntry({
      ...validEntry,
      tags: ['x'.repeat(MAX_ENTRY_TAG_LENGTH + 1)],
    })).toBe(false);
  });
});
