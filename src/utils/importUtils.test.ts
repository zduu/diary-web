import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_ENTRY_CONTENT_LENGTH,
  MAX_ENTRY_MOOD_LENGTH,
  MAX_ENTRY_TAG_LENGTH,
  MAX_ENTRY_TAGS_COUNT,
  MAX_ENTRY_TITLE_LENGTH,
  MAX_ENTRY_WEATHER_LENGTH,
} from './entryTextValidation';
import { parseEntriesBackup, parseEntriesBackupData } from './importUtils';

describe('importUtils', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

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
            originalGPS: {
              latitude: 31.225,
              longitude: 121.465,
            },
            coordinateOffset: {
              latitude: 0.005,
              longitude: 0.005,
              distance: 120,
            },
            highAccuracy: {
              accuracy: 18.5,
              confidence: 'high',
              attempts: 2,
              coordinateOffset: {
                latitude: 0.005,
                longitude: 0.005,
                distance: 120,
              },
            },
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
          title: '危险图片地址',
          content: '有效内容',
          images: ['javascript:alert(1)'],
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

    expect(() => parseEntriesBackupData({
      entries: [
        {
          title: '坐标范围异常',
          content: '有效内容',
          location: {
            latitude: 91,
            longitude: 121.47,
          },
        },
      ],
    })).toThrow('第 1 条导入数据的位置信息无效');

    expect(() => parseEntriesBackupData({
      entries: [
        {
          title: '定位元数据异常',
          content: '有效内容',
          location: {
            name: '上海',
            highAccuracy: {
              accuracy: 20,
              confidence: 'certain',
              attempts: 1,
            },
          },
        },
      ],
    })).toThrow('第 1 条导入数据的位置信息无效');

    expect(() => parseEntriesBackupData({
      entries: [
        {
          title: '坐标偏移异常',
          content: '有效内容',
          location: {
            name: '上海',
            coordinateOffset: {
              latitude: 0.005,
              longitude: 0.005,
              distance: Number.NaN,
            },
          },
        },
      ],
    })).toThrow('第 1 条导入数据的位置信息无效');

    expect(() => parseEntriesBackupData({
      entries: [
        {
          title: '负距离异常',
          content: '有效内容',
          location: {
            name: '上海',
            nearbyPOIs: [
              { name: '公园', type: 'park', distance: -1 },
            ],
          },
        },
      ],
    })).toThrow('第 1 条导入数据的位置信息无效');

    expect(() => parseEntriesBackupData({
      entries: [
        {
          title: '负精度异常',
          content: '有效内容',
          location: {
            name: '上海',
            highAccuracy: {
              accuracy: -1,
              confidence: 'medium',
              attempts: 1,
            },
          },
        },
      ],
    })).toThrow('第 1 条导入数据的位置信息无效');

    expect(() => parseEntriesBackupData({
      entries: [
        {
          title: '高精度偏移坐标越界',
          content: '有效内容',
          location: {
            name: '上海',
            highAccuracy: {
              accuracy: 18,
              confidence: 'medium',
              attempts: 1,
              coordinateOffset: {
                latitude: 91,
                longitude: 0.005,
                distance: 120,
              },
            },
          },
        },
      ],
    })).toThrow('第 1 条导入数据的位置信息无效');

    expect(() => parseEntriesBackupData({
      entries: [
        {
          title: '更新时间异常',
          content: '有效内容',
          updated_at: 'not-a-date',
        },
      ],
    })).toThrow('第 1 条导入数据的更新时间无效');
  });

  it('rejects imported text fields and tags that exceed shared limits', () => {
    expect(() => parseEntriesBackupData({
      entries: [
        {
          title: 'x'.repeat(MAX_ENTRY_TITLE_LENGTH + 1),
          content: '有效内容',
        },
      ],
    })).toThrow(`第 1 条导入数据的标题长度不能超过 ${MAX_ENTRY_TITLE_LENGTH} 字符`);

    expect(() => parseEntriesBackupData({
      entries: [
        {
          title: '内容过长',
          content: 'x'.repeat(MAX_ENTRY_CONTENT_LENGTH + 1),
        },
      ],
    })).toThrow(`第 1 条导入数据的内容长度不能超过 ${MAX_ENTRY_CONTENT_LENGTH} 字符`);

    expect(() => parseEntriesBackupData({
      entries: [
        {
          title: '空白也计入长度',
          content: `${' '.repeat(MAX_ENTRY_CONTENT_LENGTH)}正文`,
        },
      ],
    })).toThrow(`第 1 条导入数据的内容长度不能超过 ${MAX_ENTRY_CONTENT_LENGTH} 字符`);

    expect(() => parseEntriesBackupData({
      entries: [
        {
          title: '心情过长',
          content: '有效内容',
          mood: 'x'.repeat(MAX_ENTRY_MOOD_LENGTH + 1),
        },
      ],
    })).toThrow(`第 1 条导入数据的心情长度不能超过 ${MAX_ENTRY_MOOD_LENGTH} 字符`);

    expect(() => parseEntriesBackupData({
      entries: [
        {
          title: '天气过长',
          content: '有效内容',
          weather: 'x'.repeat(MAX_ENTRY_WEATHER_LENGTH + 1),
        },
      ],
    })).toThrow(`第 1 条导入数据的天气长度不能超过 ${MAX_ENTRY_WEATHER_LENGTH} 字符`);

    expect(() => parseEntriesBackupData({
      entries: [
        {
          title: '标签过多',
          content: '有效内容',
          tags: Array.from({ length: MAX_ENTRY_TAGS_COUNT + 1 }, (_, index) => `tag-${index}`),
        },
      ],
    })).toThrow(`第 1 条导入数据的标签数量不能超过 ${MAX_ENTRY_TAGS_COUNT} 个`);

    expect(() => parseEntriesBackupData({
      entries: [
        {
          title: '标签过长',
          content: '有效内容',
          tags: ['x'.repeat(MAX_ENTRY_TAG_LENGTH + 1)],
        },
      ],
    })).toThrow(`第 1 条导入数据的单个标签长度不能超过 ${MAX_ENTRY_TAG_LENGTH} 字符`);
  });

  it('reads valid JSON backup files', async () => {
    const file = new File([
      JSON.stringify({
        entries: [
          {
            title: '文件导入',
            content: '从文件读取的内容',
          },
        ],
      }),
    ], 'backup.json', { type: 'application/json' });

    await expect(parseEntriesBackup(file)).resolves.toHaveLength(1);
  });

  it('rejects empty backup files with a friendly message', async () => {
    const file = new File(['   '], 'empty.json', { type: 'application/json' });

    await expect(parseEntriesBackup(file)).rejects.toThrow('备份文件为空，请选择有效的 JSON 备份文件');
  });

  it('rejects invalid JSON backup files with a friendly message', async () => {
    const file = new File(['{bad json'], 'broken.json', { type: 'application/json' });

    await expect(parseEntriesBackup(file)).rejects.toThrow('备份文件不是有效的 JSON 格式');
  });

  it('rejects aborted file reads with a friendly message', async () => {
    class AbortingFileReader {
      result: string | ArrayBuffer | null = null;
      onload: ((this: FileReader, event: ProgressEvent<FileReader>) => unknown) | null = null;
      onerror: ((this: FileReader, event: ProgressEvent<FileReader>) => unknown) | null = null;
      onabort: ((this: FileReader, event: ProgressEvent<FileReader>) => unknown) | null = null;

      readAsText() {
        this.onabort?.call(
          this as unknown as FileReader,
          new ProgressEvent('abort') as ProgressEvent<FileReader>
        );
      }
    }

    vi.stubGlobal('FileReader', AbortingFileReader);

    const file = new File(['{"entries":[]}'], 'backup.json', { type: 'application/json' });

    await expect(parseEntriesBackup(file)).rejects.toThrow('文件读取已取消，请重新选择备份文件');
  });

  it('rejects stalled file reads with a friendly timeout message', async () => {
    vi.useFakeTimers();

    class HangingFileReader {
      result: string | ArrayBuffer | null = null;
      onload: ((this: FileReader, event: ProgressEvent<FileReader>) => unknown) | null = null;
      onerror: ((this: FileReader, event: ProgressEvent<FileReader>) => unknown) | null = null;
      onabort: ((this: FileReader, event: ProgressEvent<FileReader>) => unknown) | null = null;

      readAsText() {
        // Simulate a browser file read that never resolves.
      }
    }

    vi.stubGlobal('FileReader', HangingFileReader);

    const file = new File(['{"entries":[]}'], 'backup.json', { type: 'application/json' });
    const parsedBackup = parseEntriesBackup(file);
    const timeoutExpectation = expect(parsedBackup).rejects.toThrow('文件读取超时，请重新选择备份文件');

    await vi.advanceTimersByTimeAsync(15_000);

    await timeoutExpectation;
  });
});
