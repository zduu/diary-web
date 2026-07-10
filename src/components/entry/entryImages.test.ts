import { describe, expect, it } from 'vitest';
import { clampImageIndex, getRenderableEntryImages } from './entryImages';

describe('entryImages', () => {
  it('keeps only renderable image sources', () => {
    expect(getRenderableEntryImages([
      'javascript:alert(1)',
      'https://example.com/safe.jpg',
      'data:text/html;base64,PGgxPkJvb208L2gxPg==',
      '/api/images/diary%2Fa.png',
    ])).toEqual([
      'https://example.com/safe.jpg',
      '/api/images/diary%2Fa.png',
    ]);
  });

  it('clamps image indexes to the available images', () => {
    expect(clampImageIndex(-1, 3)).toBe(0);
    expect(clampImageIndex(1.5, 3)).toBe(0);
    expect(clampImageIndex(4, 3)).toBe(2);
    expect(clampImageIndex(1, 3)).toBe(1);
    expect(clampImageIndex(2, 0)).toBe(0);
  });
});
