import { describe, expect, it } from 'vitest';
import {
  isValidImageSource,
  isValidImageSourceArray,
  MAX_ENTRY_IMAGES_COUNT,
  MAX_ENTRY_IMAGE_DATA_URL_LENGTH,
  MAX_ENTRY_IMAGE_URL_LENGTH,
} from './imageSourceValidation';

describe('imageSourceValidation', () => {
  it('accepts http, https, relative and embedded image sources', () => {
    expect(isValidImageSource('https://example.com/a.jpg')).toBe(true);
    expect(isValidImageSource('http://example.com/a.jpg')).toBe(true);
    expect(isValidImageSource('/api/images/diary%2Fa.png')).toBe(true);
    expect(isValidImageSource('local.jpg')).toBe(true);
    expect(isValidImageSource('data:image/png;base64,aGVsbG8=')).toBe(true);
    expect(isValidImageSource('data:IMAGE/PNG;base64,aGVsbG8=')).toBe(true);
  });

  it('rejects unsafe image sources and oversized lists', () => {
    expect(isValidImageSource('javascript:alert(1)')).toBe(false);
    expect(isValidImageSource('data:text/html;base64,PGgxPkJvb208L2gxPg==')).toBe(false);
    expect(isValidImageSource('data:image/png,not-base64')).toBe(false);
    expect(isValidImageSource('data:image/svg+xml,<svg onload=alert(1)>')).toBe(false);
    expect(isValidImageSource('data:image/png;base64,abc=def')).toBe(false);
    expect(isValidImageSource('data:image/png;base64,A')).toBe(false);
    expect(isValidImageSource(`https://example.com/${'a'.repeat(MAX_ENTRY_IMAGE_URL_LENGTH)}`)).toBe(false);
    expect(isValidImageSource('https://example.com/a.png\nhttps://evil.example.com/b.png')).toBe(false);
    expect(isValidImageSourceArray(Array.from({ length: MAX_ENTRY_IMAGES_COUNT + 1 }, () => '/a.png'))).toBe(false);
  });

  it("rejects control characters in both data urls and plain urls", () => {
    expect(isValidImageSource("data:image/png;base64,aGVs\tbG8=")).toBe(false);
    expect(isValidImageSource("data:image/png;base64,aGVsbG8=\n")).toBe(true); // trailing whitespace trimmed
    expect(isValidImageSource("https://example.com/a\tb.png")).toBe(false);
    expect(isValidImageSource("https://example.com/a\u0001.png")).toBe(false);
  });

  it('enforces the data url size cap without scanning oversized payloads', () => {
    const oversizedPayload = 'A'.repeat(MAX_ENTRY_IMAGE_DATA_URL_LENGTH);
    expect(isValidImageSource(`data:image/png;base64,${oversizedPayload}`)).toBe(false);
  });
});
