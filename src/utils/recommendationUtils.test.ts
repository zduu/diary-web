import { describe, expect, it } from 'vitest';
import type { DiaryEntry } from '../types/index.ts';
import { getEntryRecommendations } from './recommendationUtils';

const sampleEntries: DiaryEntry[] = [
  {
    id: 1,
    title: '最近的一篇',
    content: '今天写了一段新的内容。',
    tags: ['工作', '复盘'],
    images: [],
    hidden: false,
    created_at: '2026-04-12T10:00:00.000Z',
    updated_at: '2026-04-12T10:00:00.000Z',
  },
  {
    id: 2,
    title: '去年的四月',
    content: '这是同月份的旧页。',
    tags: ['旅行'],
    images: [],
    hidden: false,
    created_at: '2025-04-01T09:00:00.000Z',
    updated_at: '2025-04-01T09:00:00.000Z',
  },
  {
    id: 3,
    title: '带图片的片段',
    content: '回看时更容易回到现场。',
    tags: ['工作'],
    images: ['https://example.com/a.jpg'],
    hidden: false,
    created_at: '2026-03-15T09:00:00.000Z',
    updated_at: '2026-03-15T09:00:00.000Z',
  },
];

describe('recommendationUtils', () => {
  it('hides recommendations when there is only one readable entry', () => {
    const recommendations = getEntryRecommendations([
      {
        id: 9,
        title: '只有一篇',
        content: '单条内容不需要再重复推荐。',
        hidden: false,
        created_at: '2026-04-12T10:00:00.000Z',
        updated_at: '2026-04-12T10:00:00.000Z',
      },
    ]);

    expect(recommendations).toEqual([]);
  });

  it('builds lightweight recommendations from recent, seasonal and scene signals', () => {
    const recommendations = getEntryRecommendations(sampleEntries, new Date('2026-04-15T08:00:00.000Z'));

    expect(recommendations).toHaveLength(3);
    expect(recommendations[0].label).toBe('继续读');
    expect(recommendations[0].entry.id).toBe(1);
    expect(recommendations.some((item) => item.label === '此月回看' && item.entry.id === 2)).toBe(true);
    expect(recommendations.some((item) => item.entry.id === 3)).toBe(true);
  });

  it('falls back to old pages when there are not enough strong signals', () => {
    const recommendations = getEntryRecommendations([
      {
        id: 9,
        title: '一',
        content: '第一篇',
        hidden: false,
        created_at: '2026-04-12T10:00:00.000Z',
        updated_at: '2026-04-12T10:00:00.000Z',
      },
      {
        id: 8,
        title: '二',
        content: '第二篇',
        hidden: false,
        created_at: '2026-02-12T10:00:00.000Z',
        updated_at: '2026-02-12T10:00:00.000Z',
      },
    ]);

    expect(recommendations).toHaveLength(2);
    expect(recommendations[0].label).toBe('继续读');
    expect(recommendations[1].label).toBe('翻旧页');
  });
});
