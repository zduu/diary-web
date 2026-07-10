import { describe, expect, it } from 'vitest';
import { isValidCoordinatePair, isValidLatitude, isValidLongitude } from './geoCoordinates';

describe('geoCoordinates', () => {
  it('accepts valid latitude and longitude boundaries', () => {
    expect(isValidLatitude(-90)).toBe(true);
    expect(isValidLatitude(90)).toBe(true);
    expect(isValidLongitude(-180)).toBe(true);
    expect(isValidLongitude(180)).toBe(true);
    expect(isValidCoordinatePair(31.2, 121.4)).toBe(true);
  });

  it('rejects non-finite or out-of-range coordinates', () => {
    expect(isValidLatitude(-90.1)).toBe(false);
    expect(isValidLatitude(90.1)).toBe(false);
    expect(isValidLatitude(Number.NaN)).toBe(false);
    expect(isValidLongitude(-180.1)).toBe(false);
    expect(isValidLongitude(180.1)).toBe(false);
    expect(isValidLongitude(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidCoordinatePair(31.2, 181)).toBe(false);
  });
});
