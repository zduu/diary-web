import { describe, expect, it } from 'vitest';
import { getDiaryEntryDomId, getDiaryEntryKey, hasPersistedDiaryEntryId, isPersistedDiaryEntryId } from './diaryEntryIdentity';

describe('diaryEntryIdentity', () => {
  it('prefers database ids for stable entry keys', () => {
    expect(getDiaryEntryKey({ id: 12, title: '已保存', content: 'content' }, 0)).toBe('id-12');
  });

  it('ignores invalid database ids when building entry keys', () => {
    expect(getDiaryEntryKey({ id: 0, entry_uuid: 'local-1', title: '本地', content: 'content' }, 0)).toBe('uuid-local-1');
    expect(getDiaryEntryKey({ id: Number.NaN, title: '旧数据', content: 'content' }, 3)).toBe('index-3');
  });

  it('uses entry uuid when an entry does not have a database id', () => {
    expect(getDiaryEntryKey({ entry_uuid: 'local-1', title: '本地', content: 'content' }, 0)).toBe('uuid-local-1');
    expect(getDiaryEntryKey({ entry_uuid: '  local-1  ', title: '本地', content: 'content' }, 0)).toBe('uuid-local-1');
  });

  it('falls back to the caller-provided index for legacy entries without ids', () => {
    expect(getDiaryEntryKey({ title: '旧数据', content: 'content' }, 3)).toBe('index-3');
    expect(getDiaryEntryKey({ entry_uuid: '   ', title: '旧数据', content: 'content' }, 3)).toBe('index-3');
  });

  it('builds DOM ids only for positive integer database ids', () => {
    expect(getDiaryEntryDomId({ id: 12, title: '已保存', content: 'content' })).toBe('entry-12');
    expect(getDiaryEntryDomId({ id: 0, title: '无效', content: 'content' })).toBeUndefined();
    expect(getDiaryEntryDomId({ id: Number.NaN, title: '无效', content: 'content' })).toBeUndefined();
    expect(getDiaryEntryDomId({ entry_uuid: 'local-1', title: '本地', content: 'content' })).toBeUndefined();
  });

  it('accepts only positive integer database ids as persisted entry ids', () => {
    expect(isPersistedDiaryEntryId(1)).toBe(true);
    expect(isPersistedDiaryEntryId(0)).toBe(false);
    expect(isPersistedDiaryEntryId(Number.NaN)).toBe(false);
    expect(isPersistedDiaryEntryId(Infinity)).toBe(false);
    expect(isPersistedDiaryEntryId('1')).toBe(false);
    expect(hasPersistedDiaryEntryId({ id: 1, title: '已保存', content: 'content' })).toBe(true);
    expect(hasPersistedDiaryEntryId({ id: 0, title: '无效', content: 'content' })).toBe(false);
    expect(hasPersistedDiaryEntryId({ id: -1, title: '无效', content: 'content' })).toBe(false);
    expect(hasPersistedDiaryEntryId({ id: 1.5, title: '无效', content: 'content' })).toBe(false);
    expect(hasPersistedDiaryEntryId({ entry_uuid: 'legacy', title: '旧数据', content: 'content' })).toBe(false);
  });
});
