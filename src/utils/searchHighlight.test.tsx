import { describe, expect, it } from 'vitest';
import { buildHighlightedExcerpt, highlightText } from './searchHighlight';

describe('searchHighlight', () => {
  it('handles malformed legacy text without throwing', () => {
    expect(highlightText(null, 'test')).toBe('');
    expect(buildHighlightedExcerpt(123, 'test')).toBeNull();
  });

  it('builds excerpts from valid content', () => {
    expect(buildHighlightedExcerpt('前文 搜索词 后文', '搜索词')).toBe('前文 搜索词 后文');
  });
});
