import { describe, expect, it } from 'vitest';
import { parseStoredScrollY } from './scrollRestoration';

describe('scrollRestoration', () => {
  it('parses stored scroll positions', () => {
    expect(parseStoredScrollY('0')).toBe(0);
    expect(parseStoredScrollY(' 128.5 ')).toBe(128.5);
  });

  it('rejects empty, negative, and invalid scroll positions', () => {
    expect(parseStoredScrollY(null)).toBeNull();
    expect(parseStoredScrollY('')).toBeNull();
    expect(parseStoredScrollY('   ')).toBeNull();
    expect(parseStoredScrollY('-1')).toBeNull();
    expect(parseStoredScrollY('NaN')).toBeNull();
    expect(parseStoredScrollY('Infinity')).toBeNull();
  });
});
