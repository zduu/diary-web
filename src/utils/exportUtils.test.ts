import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiaryEntry } from '../types/index.ts';
import {
  MAX_ENTRY_CONTENT_LENGTH,
  MAX_ENTRY_TAGS_COUNT,
  MAX_ENTRY_TITLE_LENGTH,
  MAX_ENTRY_WEATHER_LENGTH,
} from './entryTextValidation';
import {
  buildDiaryBackupFileName,
  buildDiaryExportFileName,
  createDiaryExportPayload,
  createDiaryTextExport,
  downloadBlobFile,
  packageDiaryEntryImagesForExport,
} from './exportUtils';
import { MAX_ENTRY_IMAGES_COUNT } from './imageSourceValidation';
import { parseEntriesBackupData } from './importUtils';

const sampleEntries: DiaryEntry[] = [
  {
    id: 1,
    title: '春日记录',
    content: '今天阳光很好。',
    content_type: 'markdown',
    mood: 'happy',
    weather: 'sunny',
    tags: ['生活', '散步'],
    images: [],
    hidden: false,
    created_at: '2026-04-12T10:00:00.000Z',
    updated_at: '2026-04-12T10:00:00.000Z',
    location: {
      name: '上海徐汇',
      latitude: 31.188,
      longitude: 121.437,
    },
  },
];

describe('exportUtils', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('builds stable export file names', () => {
    const date = new Date('2026-04-12T08:00:00.000Z');

    expect(buildDiaryExportFileName('全部日记', date)).toBe('diary-all-2026-04-12');
    expect(buildDiaryExportFileName('搜索结果', date)).toBe('diary-search-2026-04-12');
    expect(buildDiaryExportFileName('自定义结果', date)).toBe('diary-custom-2026-04-12');
    expect(buildDiaryBackupFileName(date)).toBe('diary-backup-2026-04-12');
  });

  it('creates export payload with shared metadata', () => {
    const exportedAt = new Date('2026-04-12T08:00:00.000Z');
    expect(createDiaryExportPayload({
      entries: sampleEntries,
      exportType: '全部日记',
      includeHidden: true,
      exportedAt,
    })).toEqual({
      entries: sampleEntries,
      exportDate: '2026-04-12T08:00:00.000Z',
      exportType: '全部日记',
      totalCount: 1,
      includeHidden: true,
      version: '1.0',
    });
  });

  it('filters unsafe image sources from JSON export payloads', () => {
    const payload = createDiaryExportPayload({
      entries: [{
        ...sampleEntries[0],
        images: [
          'javascript:alert(1)',
          'https://example.com/safe.jpg',
          'data:text/html;base64,PGgxPkJvb208L2gxPg==',
          '/api/images/diary%2Fsafe.png',
        ],
      }],
      exportType: '全部日记',
      includeHidden: true,
      exportedAt: new Date('2026-04-12T08:00:00.000Z'),
    });

    expect(payload.entries[0]?.images).toEqual([
      'https://example.com/safe.jpg',
      '/api/images/diary%2Fsafe.png',
    ]);
  });

  it('filters invalid legacy locations from JSON export payloads', () => {
    const payload = createDiaryExportPayload({
      entries: [{
        ...sampleEntries[0],
        location: {
          name: '异常位置',
          latitude: 91,
          longitude: 121.4,
        },
      }],
      exportType: '全部日记',
      includeHidden: true,
      exportedAt: new Date('2026-04-12T08:00:00.000Z'),
    });

    expect(payload.entries[0]?.location).toBeNull();
  });

  it('sanitizes legacy fields so JSON export payloads can be imported again', () => {
    const payload = createDiaryExportPayload({
      entries: [{
        id: -1,
        entry_uuid: '   ',
        title: 't'.repeat(MAX_ENTRY_TITLE_LENGTH + 1),
        content: '',
        content_type: 'html',
        mood: 123,
        weather: 'w'.repeat(MAX_ENTRY_WEATHER_LENGTH + 1),
        images: [
          'javascript:alert(1)',
          ...Array.from({ length: MAX_ENTRY_IMAGES_COUNT + 1 }, (_, index) => `/api/images/${index}.png`),
        ],
        tags: [
          ' ok ',
          'ok',
          '',
          ...Array.from({ length: MAX_ENTRY_TAGS_COUNT + 1 }, (_, index) => `tag-${index}`),
        ],
        location: {
          name: '异常位置',
          latitude: Number.POSITIVE_INFINITY,
          longitude: 121.4,
        },
        hidden: 'yes',
        sync_state: 'bad-state',
        created_at: 'not-a-date',
        updated_at: 'also-bad',
        last_synced_at: 'invalid-sync-time',
        deleted_at: 'invalid-delete-time',
      } as unknown as DiaryEntry],
      exportType: '全部日记',
      includeHidden: true,
      exportedAt: new Date('2026-04-12T08:00:00.000Z'),
    });

    const [entry] = parseEntriesBackupData(payload);

    expect(entry?.id).toBeUndefined();
    expect(entry?.entry_uuid).toBeUndefined();
    expect(entry?.title).toHaveLength(MAX_ENTRY_TITLE_LENGTH);
    expect(entry?.content).toBe('（空内容）');
    expect(entry?.content.length).toBeLessThanOrEqual(MAX_ENTRY_CONTENT_LENGTH);
    expect(entry?.content_type).toBe('markdown');
    expect(entry?.mood).toBeUndefined();
    expect(entry?.weather).toHaveLength(MAX_ENTRY_WEATHER_LENGTH);
    expect(entry?.images).toHaveLength(MAX_ENTRY_IMAGES_COUNT);
    expect(entry?.images).not.toContain('javascript:alert(1)');
    expect(entry?.tags).toHaveLength(MAX_ENTRY_TAGS_COUNT);
    expect(entry?.tags?.[0]).toBe('ok');
    expect(entry?.location).toBeNull();
    expect(entry?.hidden).toBe(false);
    expect(entry?.sync_state).toBeUndefined();
    expect(entry?.created_at).toBeUndefined();
    expect(entry?.updated_at).toBeUndefined();
    expect(entry?.last_synced_at).toBeUndefined();
    expect(entry?.deleted_at).toBeUndefined();
  });

  it('renders text exports with metadata and entry details', () => {
    const text = createDiaryTextExport({
      entries: sampleEntries,
      exportType: '搜索结果',
      includeHidden: false,
      exportedAt: new Date('2026-04-12T08:00:00.000Z'),
    });

    expect(text).toContain('# 搜索结果');
    expect(text).toContain('日记数量: 1 条');
    expect(text).toContain('包含隐藏日记: 否');
    expect(text).toContain('## 1. 春日记录');
    expect(text).toContain('😊 心情: 开心');
    expect(text).toContain('🌤️ 天气: 晴天');
    expect(text).toContain('🏷️ 标签: #生活 #散步');
    expect(text).toContain('📍 位置: 上海徐汇');
    expect(text).toContain('今天阳光很好。');
  });

  it('uses a fallback timestamp for legacy entries without valid creation time', () => {
    const text = createDiaryTextExport({
      entries: [
        {
          title: '旧数据',
          content: '没有有效创建时间',
          created_at: 'not-a-date',
        },
        {
          title: '更旧的数据',
          content: '没有创建时间字段',
        },
      ],
      exportType: '全部日记',
      includeHidden: false,
      exportedAt: new Date('2026-04-12T08:00:00.000Z'),
    });

    expect(text.match(/📅 创建时间: 未知时间/g)).toHaveLength(2);
    expect(text).toContain('没有有效创建时间');
    expect(text).toContain('没有创建时间字段');
  });

  it('treats SQLite timestamps as UTC in text exports', () => {
    vi.spyOn(Date.prototype, 'toLocaleString').mockImplementation(function (this: Date) {
      return this.toISOString();
    });

    const text = createDiaryTextExport({
      entries: [{
        title: 'SQLite 时间',
        content: '数据库时间不应按本地时区重新解释',
        created_at: '2026-04-12 10:00:00',
      }],
      exportType: '全部日记',
      includeHidden: false,
      exportedAt: new Date('2026-04-12T08:00:00.000Z'),
    });

    expect(text).toContain('📅 创建时间: 2026-04-12T10:00:00.000Z');
  });

  it('sanitizes malformed titles and empty content in text exports', () => {
    const text = createDiaryTextExport({
      entries: [
        {
          title: 't'.repeat(MAX_ENTRY_TITLE_LENGTH + 10),
          content: '',
        },
        {
          title: 123,
          content: 'c'.repeat(MAX_ENTRY_CONTENT_LENGTH + 10),
        },
      ] as unknown as DiaryEntry[],
      exportType: '全部日记',
      includeHidden: false,
      exportedAt: new Date('2026-04-12T08:00:00.000Z'),
    });

    expect(text).toContain(`## 1. ${'t'.repeat(MAX_ENTRY_TITLE_LENGTH)}`);
    expect(text).not.toContain('t'.repeat(MAX_ENTRY_TITLE_LENGTH + 1));
    expect(text).toContain('## 2. 无标题');
    expect(text).toContain('（空内容）');
    expect(text).toContain('c'.repeat(MAX_ENTRY_CONTENT_LENGTH));
    expect(text).not.toContain('c'.repeat(MAX_ENTRY_CONTENT_LENGTH + 1));
  });

  it('skips invalid legacy locations in text exports', () => {
    const text = createDiaryTextExport({
      entries: [{
        ...sampleEntries[0],
        location: {
          name: '异常位置',
          latitude: Number.NaN,
          longitude: 121.4,
        },
      }],
      exportType: '全部日记',
      includeHidden: false,
      exportedAt: new Date('2026-04-12T08:00:00.000Z'),
    });

    expect(text).not.toContain('📍 位置: 异常位置');
  });

  it('sanitizes malformed mood and weather in text exports', () => {
    const text = createDiaryTextExport({
      entries: [{
        ...sampleEntries[0],
        mood: 123 as unknown as string,
        weather: ` ${'w'.repeat(MAX_ENTRY_WEATHER_LENGTH + 5)} `,
      }],
      exportType: '全部日记',
      includeHidden: false,
      exportedAt: new Date('2026-04-12T08:00:00.000Z'),
    });

    expect(text).not.toContain('心情:');
    expect(text).toContain(`🌤️ 天气: ${'w'.repeat(MAX_ENTRY_WEATHER_LENGTH)}`);
    expect(text).not.toContain('w'.repeat(MAX_ENTRY_WEATHER_LENGTH + 1));
  });

  it('packages image urls into embedded data urls for portable exports', async () => {
    const result = await packageDiaryEntryImagesForExport({
      entries: [{
        ...sampleEntries[0],
        images: ['/api/images/diary%2Fsample.png'],
      }],
      baseUrl: 'https://example.com',
      fetchImpl: async (input) => {
        const url = input instanceof Request ? input.url : String(input);
        expect(url).toBe('https://example.com/api/images/diary%2Fsample.png');

        return new Response(new Uint8Array([104, 101, 108, 108, 111]), {
          status: 200,
          headers: {
            'Content-Type': 'IMAGE/PNG; charset=binary',
          },
        });
      },
    });

    expect(result.packagedImageCount).toBe(1);
    expect(result.failedImageCount).toBe(0);
    expect(result.entries[0]?.images?.[0]).toBe('data:image/png;base64,aGVsbG8=');
  });

  it('keeps original image urls when packaging fails', async () => {
    const result = await packageDiaryEntryImagesForExport({
      entries: [{
        ...sampleEntries[0],
        images: ['https://cdn.example.com/sample.png'],
      }],
      fetchImpl: async () => new Response('missing', { status: 404 }),
    });

    expect(result.packagedImageCount).toBe(0);
    expect(result.failedImageCount).toBe(1);
    expect(result.entries[0]?.images).toEqual(['https://cdn.example.com/sample.png']);
  });

  it('keeps original image urls when packaging fetch returns an empty image body', async () => {
    const result = await packageDiaryEntryImagesForExport({
      entries: [{
        ...sampleEntries[0],
        images: ['https://cdn.example.com/empty.png'],
      }],
      fetchImpl: async () => new Response(new Uint8Array(), {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
        },
      }),
    });

    expect(result.packagedImageCount).toBe(0);
    expect(result.failedImageCount).toBe(1);
    expect(result.entries[0]?.images).toEqual(['https://cdn.example.com/empty.png']);
  });

  it('skips unsafe image sources while packaging portable exports', async () => {
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array([104, 101, 108, 108, 111]), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
      },
    }));

    const result = await packageDiaryEntryImagesForExport({
      entries: [{
        ...sampleEntries[0],
        images: [
          'javascript:alert(1)',
          '/api/images/diary%2Fsample.png',
          'data:text/html;base64,PGgxPkJvb208L2gxPg==',
        ],
      }],
      baseUrl: 'https://example.com',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledWith('https://example.com/api/images/diary%2Fsample.png', expect.objectContaining({
      credentials: 'same-origin',
    }));
    expect(result.packagedImageCount).toBe(1);
    expect(result.failedImageCount).toBe(0);
    expect(result.entries[0]?.images).toEqual(['data:image/png;base64,aGVsbG8=']);
  });

  it('keeps original image urls when packaging image fetch times out', async () => {
    vi.useFakeTimers();
    let wasAborted = false;
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      init?.signal?.addEventListener('abort', () => {
        wasAborted = true;
      });

      return new Promise<Response>(() => {});
    }) as unknown as typeof fetch;

    const packaging = packageDiaryEntryImagesForExport({
      entries: [{
        ...sampleEntries[0],
        images: ['https://cdn.example.com/slow.png'],
      }],
      fetchImpl,
    });

    await vi.advanceTimersByTimeAsync(15_000);

    await expect(packaging).resolves.toMatchObject({
      packagedImageCount: 0,
      failedImageCount: 1,
      entries: [expect.objectContaining({
        images: ['https://cdn.example.com/slow.png'],
      })],
    });
    expect(wasAborted).toBe(true);
  });

  it('downloads blobs and cleans up the temporary object url', () => {
    const createObjectUrl = vi.fn(() => 'blob:download-url');
    const revokeObjectUrl = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    Object.defineProperty(URL, 'createObjectURL', {
      value: createObjectUrl,
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: revokeObjectUrl,
      configurable: true,
    });

    downloadBlobFile(new Blob(['hello']), 'diary.txt');

    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:download-url');
    expect(document.body.querySelector('a')).toBeNull();
  });

  it('cleans up the temporary object url when the browser download click fails', () => {
    const revokeObjectUrl = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('download blocked');
    });
    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:blocked-download'),
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: revokeObjectUrl,
      configurable: true,
    });

    expect(() => downloadBlobFile(new Blob(['hello']), 'diary.txt')).toThrow('download blocked');
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:blocked-download');
    expect(document.body.querySelector('a')).toBeNull();
  });
});
