import { describe, expect, it } from 'vitest';
import { parseEntriesBackupData } from './importUtils';

describe('importUtils', () => {
  it('accepts valid backup entries', () => {
    expect(parseEntriesBackupData({
      entries: [
        {
          title: '导入测试',
          content: '这是一条有效内容',
          content_type: 'markdown',
          mood: 'happy',
          weather: 'sunny',
          images: ['https://example.com/a.jpg'],
          tags: ['测试'],
          hidden: false,
          created_at: '2026-04-12T10:00:00.000Z',
          location: {
            name: '上海',
            latitude: 31.23,
            longitude: 121.47,
            nearbyPOIs: [
              { name: '公园', type: 'park', distance: 120 },
            ],
          },
        },
      ],
    })).toHaveLength(1);
  });

  it('accepts plain entry arrays from older backups', () => {
    expect(parseEntriesBackupData([
      {
        title: '旧版备份',
        content: '直接数组格式也应该支持',
      },
    ])).toHaveLength(1);
  });

  it('rejects backups without entries arrays', () => {
    expect(() => parseEntriesBackupData({ foo: [] })).toThrow('无效的备份文件格式：缺少 entries 数组或日记数组');
  });

  it('rejects malformed entry fields with indexed messages', () => {
    expect(() => parseEntriesBackupData({
      entries: [
        {
          title: '第一条',
          content: '有效内容',
        },
        {
          title: '第二条',
          content: '   ',
          images: ['https://example.com/a.jpg'],
        },
      ],
    })).toThrow('第 2 条导入数据缺少有效内容');

    expect(() => parseEntriesBackupData({
      entries: [
        {
          title: '图片异常',
          content: '有效内容',
          images: [123],
        },
      ],
    })).toThrow('第 1 条导入数据的图片列表无效');

    expect(() => parseEntriesBackupData({
      entries: [
        {
          title: '位置异常',
          content: '有效内容',
          location: {
            latitude: '31.23',
          },
        },
      ],
    })).toThrow('第 1 条导入数据的位置信息无效');
  });
});
