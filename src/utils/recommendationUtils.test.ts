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

  it('sanitizes malformed legacy tags before building theme recommendations', () => {
    const recommendations = getEntryRecommendations([
      {
        id: 1,
        title: '最近的一篇',
        content: '最近内容。',
        tags: [],
        images: [],
        hidden: false,
        created_at: '2026-04-12T10:00:00.000Z',
        updated_at: '2026-04-12T10:00:00.000Z',
      },
      {
        id: 2,
        title: '第一条主题',
        content: '短内容。',
        tags: ['  工作  ', 123, '', '工作'] as unknown as string[],
        images: [],
        hidden: false,
        created_at: '2026-04-11T10:00:00.000Z',
        updated_at: '2026-04-11T10:00:00.000Z',
      },
      {
        id: 3,
        title: '第二条主题',
        content: '短内容。',
        tags: ['工作'],
        images: [],
        hidden: false,
        created_at: '2026-04-10T10:00:00.000Z',
        updated_at: '2026-04-10T10:00:00.000Z',
      },
    ], new Date('2026-04-15T08:00:00.000Z'));

    const tagRecommendation = recommendations.find((item) => item.label === '主题线索');

    expect(tagRecommendation?.description).toContain('标签“工作”出现了 2 次');
    expect(tagRecommendation?.entry.id).toBe(2);
  });

  it('ignores unsafe image sources when choosing scene recommendations', () => {
    const recommendations = getEntryRecommendations([
      {
        id: 1,
        title: '最近的一篇',
        content: '最近内容。',
        tags: [],
        images: [],
        hidden: false,
        created_at: '2026-04-12T10:00:00.000Z',
        updated_at: '2026-04-12T10:00:00.000Z',
      },
      {
        id: 2,
        title: '只有异常图片',
        content: '短内容。',
        tags: [],
        images: ['javascript:alert(1)'],
        hidden: false,
        created_at: '2026-04-11T10:00:00.000Z',
        updated_at: '2026-04-11T10:00:00.000Z',
      },
      {
        id: 3,
        title: '真正的场景内容',
        content: 'x'.repeat(240),
        tags: [],
        images: [],
        hidden: false,
        created_at: '2026-04-10T10:00:00.000Z',
        updated_at: '2026-04-10T10:00:00.000Z',
      },
    ], new Date('2026-04-15T08:00:00.000Z'));

    const sceneRecommendation = recommendations.find((item) => item.label === '场景回放');

    expect(sceneRecommendation?.entry.id).toBe(3);
    expect(sceneRecommendation?.description).toContain('更完整的正文');
  });

  it('ignores invalid legacy locations when choosing scene recommendations', () => {
    const recommendations = getEntryRecommendations([
      {
        id: 1,
        title: '最近的一篇',
        content: '最近内容。',
        tags: [],
        images: [],
        hidden: false,
        created_at: '2026-04-12T10:00:00.000Z',
        updated_at: '2026-04-12T10:00:00.000Z',
      },
      {
        id: 2,
        title: '只有异常位置',
        content: '短内容。',
        tags: [],
        images: [],
        location: {
          name: '异常位置',
          latitude: 91,
          longitude: 121.4,
        },
        hidden: false,
        created_at: '2026-04-11T10:00:00.000Z',
        updated_at: '2026-04-11T10:00:00.000Z',
      },
      {
        id: 3,
        title: '真正的场景内容',
        content: 'x'.repeat(240),
        tags: [],
        images: [],
        hidden: false,
        created_at: '2026-04-10T10:00:00.000Z',
        updated_at: '2026-04-10T10:00:00.000Z',
      },
    ], new Date('2026-04-15T08:00:00.000Z'));

    const sceneRecommendation = recommendations.find((item) => item.label === '场景回放');

    expect(sceneRecommendation?.entry.id).toBe(3);
    expect(sceneRecommendation?.description).toContain('更完整的正文');
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
        content: 123,
        hidden: false,
        created_at: '2026-02-12T10:00:00.000Z',
        updated_at: '2026-02-12T10:00:00.000Z',
      } as unknown as DiaryEntry,
    ]);

    expect(recommendations).toHaveLength(2);
    expect(recommendations[0].label).toBe('继续读');
    expect(recommendations[1].label).toBe('翻旧页');
  });

  it('builds recommendations for legacy entries without database ids', () => {
    const recommendations = getEntryRecommendations([
      {
        entry_uuid: 'local-new',
        title: '本地新记录',
        content: '这篇还没有数据库 id。',
        hidden: false,
        created_at: '2026-04-12T10:00:00.000Z',
      },
      {
        title: '无 id 旧记录',
        content: '旧数据也应该可以进入轻量推荐。',
        hidden: false,
        created_at: '2026-02-12T10:00:00.000Z',
      },
    ]);

    expect(recommendations.map((item) => item.label)).toEqual(['继续读', '翻旧页']);
    expect(recommendations.map((item) => item.id)).toEqual(['recent-uuid-local-new', 'archive-index-1']);
  });

  it('ignores entries with invalid created times', () => {
    const recommendations = getEntryRecommendations([
      {
        id: 7,
        title: '坏日期',
        content: '历史导入里可能存在坏日期。',
        hidden: false,
        created_at: 'not-a-date',
        updated_at: '2026-04-30T10:00:00.000Z',
        tags: ['工作'],
        images: ['https://example.com/invalid.jpg'],
      },
      {
        id: 6,
        title: '新的有效日期',
        content: '这篇应该成为最近推荐。',
        hidden: false,
        created_at: '2026-04-12T10:00:00.000Z',
        updated_at: '2026-04-12T10:00:00.000Z',
      },
      {
        id: 5,
        title: '旧的有效日期',
        content: '这篇作为旧页兜底。',
        hidden: false,
        created_at: '2026-03-12T10:00:00.000Z',
        updated_at: '2026-03-12T10:00:00.000Z',
      },
    ]);

    expect(recommendations.map((item) => item.entry.id)).toEqual([6, 5]);
  });
});
