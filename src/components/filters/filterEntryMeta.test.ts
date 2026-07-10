import { describe, expect, it } from 'vitest';
import type { DiaryEntry } from '../../types';
import { buildFilterMeta, formatMonthLabel, sanitizeFilterMetaControls } from './filterEntryMeta';

const entries: DiaryEntry[] = [
  {
    id: 1,
    title: '有效日期',
    content: '公开记录',
    tags: ['公开'],
    hidden: false,
    created_at: '2026-04-14T09:00:00.000Z',
  },
  {
    id: 2,
    title: '无效日期',
    content: '旧数据',
    tags: ['旧数据'],
    hidden: false,
    created_at: 'not-a-date',
  },
  {
    id: 3,
    title: '缺失日期',
    content: '旧数据',
    tags: [],
    hidden: false,
  },
];

describe('filterEntryMeta', () => {
  it('excludes missing or invalid timestamps from available date metadata', () => {
    expect(buildFilterMeta(entries)).toMatchObject({
      availableYears: ['2026'],
      availableMonths: ['04'],
      availableMonthsByYear: {
        '2026': ['04'],
      },
    });
  });

  it('does not keep control date options that only come from invalid timestamps', () => {
    expect(
      sanitizeFilterMetaControls(
        {
          availableTags: ['公开', '旧数据'],
          untaggedEntryCount: 1,
          availableYears: ['2026', 'NaN'],
          availableMonths: ['04', 'NaN'],
          availableMonthsByYear: {
            '2026': ['04'],
            NaN: ['NaN'],
          },
        },
        entries
      )
    ).toMatchObject({
      availableYears: ['2026'],
      availableMonths: ['04'],
      availableMonthsByYear: {
        '2026': ['04'],
      },
    });
  });

  it('sanitizes malformed legacy tags when building filter metadata', () => {
    const meta = buildFilterMeta([
      {
        title: '坏标签',
        content: '旧数据',
        tags: ['  公开  ', 123, '', '公开', 'x'.repeat(65)] as unknown as string[],
        hidden: false,
        created_at: '2026-04-14T09:00:00.000Z',
      },
      {
        title: '无有效标签',
        content: '旧数据',
        tags: [false, ''] as unknown as string[],
        hidden: false,
        created_at: '2026-04-15T09:00:00.000Z',
      },
    ]);

    expect(meta.availableTags).toEqual(['公开']);
    expect(meta.untaggedEntryCount).toBe(1);
  });

  it('does not treat malformed hidden flags as hidden entries', () => {
    const meta = buildFilterMeta([
      {
        title: '旧 hidden 字段',
        content: '字符串 false 不应该隐藏',
        tags: ['公开'],
        hidden: 'false' as unknown as boolean,
        created_at: '2026-04-14T09:00:00.000Z',
      },
      {
        title: '真正隐藏',
        content: '布尔 true 才隐藏',
        tags: ['隐藏'],
        hidden: true,
        created_at: '2026-04-15T09:00:00.000Z',
      },
    ]);

    expect(meta.visibleEntries.map((entry) => entry.title)).toEqual(['旧 hidden 字段']);
    expect(meta.availableTags).toEqual(['公开']);
  });

  it('sorts available years and months from newest to oldest', () => {
    expect(buildFilterMeta([
      {
        title: '旧年',
        content: '2024',
        created_at: '2024-12-01T09:00:00.000Z',
      },
      {
        title: '新年早月',
        content: '2026-01',
        created_at: '2026-01-01T09:00:00.000Z',
      },
      {
        title: '新年晚月',
        content: '2026-11',
        created_at: '2026-11-01T09:00:00.000Z',
      },
      {
        title: '中间年份',
        content: '2025',
        created_at: '2025-04-01T09:00:00.000Z',
      },
    ])).toMatchObject({
      availableYears: ['2026', '2025', '2024'],
      availableMonths: ['12', '11', '04', '01'],
      availableMonthsByYear: {
        '2026': ['11', '01'],
        '2025': ['04'],
        '2024': ['12'],
      },
    });
  });

  it('formats month labels without leaking NaN for invalid values', () => {
    expect(formatMonthLabel('04')).toBe('4月');
    expect(formatMonthLabel('12')).toBe('12月');
    expect(formatMonthLabel('NaN')).toBe('NaN');
    expect(formatMonthLabel('')).toBe('未知月份');
  });
});
