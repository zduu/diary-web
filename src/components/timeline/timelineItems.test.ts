import { describe, expect, it, vi } from 'vitest';
import type { DiaryEntry } from '../../types';
import { createTimelineItems, groupEntriesByDate } from './timelineItems';

const entries: DiaryEntry[] = [
  {
    id: 1,
    title: '有效日期',
    content: '公开记录',
    created_at: '2026-04-14T09:00:00.000Z',
  },
  {
    id: 2,
    title: '无效日期',
    content: '旧数据',
    created_at: 'not-a-date',
  },
  {
    id: 3,
    title: '缺失日期',
    content: '旧数据',
  },
];

describe('timelineItems', () => {
  it('groups missing or invalid timestamps under an unknown date group', () => {
    expect(groupEntriesByDate(entries)['日期未知']).toEqual([entries[2], entries[1]]);
  });

  it('orders date groups by newest entry even when input entries are unsorted', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-17T09:00:00.000Z'));

    try {
      const unsortedEntries: DiaryEntry[] = [
        {
          id: 1,
          title: '较早',
          content: '旧记录',
          created_at: '2025-01-01T09:00:00.000Z',
        },
        {
          id: 2,
          title: '未知',
          content: '无效日期',
          created_at: 'not-a-date',
        },
        {
          id: 3,
          title: '较新',
          content: '新记录',
          created_at: '2026-04-14T09:00:00.000Z',
        },
      ];

      expect(Object.keys(groupEntriesByDate(unsortedEntries))).toEqual([
        '04月14日',
        '2025年01月01日',
        '日期未知',
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('orders entries within a date group with the shared diary time fallback', () => {
    const sameCreatedAtEntries: DiaryEntry[] = [
      {
        id: 1,
        title: '较早更新',
        content: '旧记录',
        created_at: '2026-04-14T09:00:00.000Z',
        updated_at: '2026-04-14T09:10:00.000Z',
      },
      {
        id: 2,
        title: '较晚更新',
        content: '新记录',
        created_at: '2026-04-14T09:00:00.000Z',
        updated_at: '2026-04-14T09:30:00.000Z',
      },
    ];

    expect(groupEntriesByDate(sameCreatedAtEntries)['04月14日']).toEqual([
      sameCreatedAtEntries[1],
      sameCreatedAtEntries[0],
    ]);
  });

  it('creates timeline items without throwing for missing or invalid timestamps', () => {
    const items = createTimelineItems(entries);
    const unknownDateItem = items.find((item) => item.type === 'date' && item.data.dateGroup === '日期未知');

    expect(unknownDateItem).toBeDefined();
    expect(items.filter((item) => item.type === 'entry').map((item) => item.data)).toEqual(expect.arrayContaining(entries));
  });

  it('creates unique item keys for entries without ids', () => {
    const items = createTimelineItems([
      {
        title: '第一条无 id',
        content: '本地旧数据',
        created_at: '2026-04-14T09:00:00.000Z',
      },
      {
        title: '第二条无 id',
        content: '本地旧数据',
        created_at: '2026-04-14T08:00:00.000Z',
      },
    ]);
    const keys = items.map((item) => item.key);

    expect(new Set(keys).size).toBe(keys.length);
  });
});
