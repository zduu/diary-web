import { beforeEach, describe, expect, it } from 'vitest';
import { MockApiService } from './mockApiService';

describe('MockApiService entry mutations', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('serializes concurrent updates so neither completed write is lost', async () => {
    const service = new MockApiService();
    await service.login('admin', 'admin123');

    await Promise.all([
      service.updateEntry(1, { title: '并发更新一' }),
      service.updateEntry(2, { title: '并发更新二' }),
    ]);

    const entries = await service.getAllEntries();
    expect(entries.find((entry) => entry.id === 1)?.title).toBe('并发更新一');
    expect(entries.find((entry) => entry.id === 2)?.title).toBe('并发更新二');
  });

  it('assigns unique ids to concurrent creates', async () => {
    const service = new MockApiService();
    await service.login('admin', 'admin123');

    const createdEntries = await Promise.all([
      service.createEntry({ title: '并发新建一', content: '内容一' }),
      service.createEntry({ title: '并发新建二', content: '内容二' }),
    ]);

    expect(new Set(createdEntries.map((entry) => entry.id)).size).toBe(2);

    const entries = await service.getAllEntries();
    expect(entries.some((entry) => entry.title === '并发新建一')).toBe(true);
    expect(entries.some((entry) => entry.title === '并发新建二')).toBe(true);
  });
});
