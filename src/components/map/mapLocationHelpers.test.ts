import { describe, expect, it } from 'vitest';
import { convertGeolocationPosition } from './mapLocationHelpers';

function createPosition(latitude: number, longitude: number): GeolocationPosition {
  return {
    coords: {
      latitude,
      longitude,
      accuracy: 12,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON: () => ({}),
    },
    timestamp: 1_700_000_000_000,
    toJSON: () => ({}),
  };
}

describe('mapLocationHelpers', () => {
  it('converts valid zero-valued geolocation coordinates', () => {
    const converted = convertGeolocationPosition(createPosition(0, 0));

    expect(converted.original).toEqual({ latitude: 0, longitude: 0 });
    expect(converted.location).toEqual([0, 0]);
  });

  it('rejects out-of-range geolocation coordinates', () => {
    expect(() => convertGeolocationPosition(createPosition(91, 121.4))).toThrow('定位返回的坐标无效');
    expect(() => convertGeolocationPosition(createPosition(31.2, 181))).toThrow('定位返回的坐标无效');
  });
});
