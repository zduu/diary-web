import { describe, expect, it } from 'vitest';
import { createEntryPreview, getEntryPreview } from './entryContent';

describe('entryContent', () => {
  it('returns an empty preview for malformed legacy content', () => {
    expect(createEntryPreview(null)).toBe('');
    expect(getEntryPreview(123, 20)).toBe('');
  });

  it('strips markdown syntax from valid content previews', () => {
    expect(createEntryPreview('# 标题\n![图](bad.jpg)\n[链接](https://example.com)')).toBe('标题 链接');
  });
});
