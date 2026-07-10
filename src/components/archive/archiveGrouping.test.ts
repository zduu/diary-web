import { describe, expect, it } from 'vitest';
import type { DiaryEntry } from '../../types';
import { createArchiveGroups } from './archiveGrouping';

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

describe('archiveGrouping', () => {
  it('keeps entries with invalid timestamps in an unknown date group', () => {
    const groups = createArchiveGroups(entries, false);
    const unknownGroup = groups[groups.length - 1];

    expect(unknownGroup).toMatchObject({
      key: 'unknown-date',
      title: '日期未知',
      count: 2,
    });
    expect(unknownGroup.entries).toEqual([entries[1], entries[2]]);
  });

  it('creates an unknown date group when no entries have valid timestamps', () => {
    expect(createArchiveGroups(entries.slice(1), false)).toEqual([
      {
        key: 'unknown-date',
        title: '日期未知',
        entries: entries.slice(1),
        count: 2,
      },
    ]);
  });
});
