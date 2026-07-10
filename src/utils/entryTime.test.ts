import { describe, expect, it } from 'vitest';
import type { DiaryEntry } from '../types';
import { getValidEntryDateRange, sortDiaryEntriesByTime } from './entryTime';

const entries: DiaryEntry[] = [
  {
    id: 1,
    title: 'invalid-created-newer-updated',
    content: 'invalid created time',
    created_at: 'not-a-date',
    updated_at: '2026-04-20T10:00:00.000Z',
  },
  {
    id: 2,
    title: 'newer-valid',
    content: 'valid',
    created_at: '2026-04-19T10:00:00.000Z',
    updated_at: '2026-04-19T10:00:00.000Z',
  },
  {
    id: 3,
    title: 'older-valid',
    content: 'valid',
    created_at: '2026-04-18T10:00:00.000Z',
    updated_at: '2026-04-18T10:00:00.000Z',
  },
];

describe('entryTime', () => {
  it('sorts entries by valid created time and keeps invalid created times last', () => {
    expect(sortDiaryEntriesByTime(entries).map((entry) => entry.id)).toEqual([2, 3, 1]);
  });

  it('returns latest and first dates from valid created timestamps only', () => {
    expect(getValidEntryDateRange(entries)).toEqual({
      latestEntryDate: '2026-04-19T10:00:00.000Z',
      firstEntryDate: '2026-04-18T10:00:00.000Z',
    });
  });

  it('uses updated time and id when both created timestamps are invalid', () => {
    const undatedEntries: DiaryEntry[] = [
      {
        id: Number.NaN,
        title: '较早更新',
        content: 'invalid created time',
        created_at: 'not-a-date',
        updated_at: '2026-04-20T09:00:00.000Z',
      },
      {
        id: 2,
        title: '较晚更新',
        content: 'missing created time',
        updated_at: '2026-04-20T10:00:00.000Z',
      },
      {
        id: 3,
        title: '同时间较大 ID',
        content: 'missing created time',
        updated_at: '2026-04-20T10:00:00.000Z',
      },
    ];

    expect(sortDiaryEntriesByTime(undatedEntries).map((entry) => entry.title)).toEqual([
      '同时间较大 ID',
      '较晚更新',
      '较早更新',
    ]);
  });
});
