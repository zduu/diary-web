import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getHighAccuracyLocation } from './coordinateUtils';

function createPosition(
  accuracy: number,
  coordinates: { latitude?: number; longitude?: number } = {}
): GeolocationPosition {
  return {
    coords: {
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      latitude: coordinates.latitude ?? 31.2,
      longitude: coordinates.longitude ?? 121.4,
      speed: null,
      toJSON: () => ({}),
    },
    timestamp: Date.now(),
    toJSON: () => ({}),
  };
}

function mockGeolocation(getCurrentPosition: Geolocation['getCurrentPosition']) {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition,
    },
  });
}

describe('coordinateUtils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'geolocation');
  });

  it('aborts while waiting between high accuracy location attempts', async () => {
    const abortController = new AbortController();
    const getCurrentPosition = vi.fn<Geolocation['getCurrentPosition']>((success) => {
      success(createPosition(500));
    });
    mockGeolocation(getCurrentPosition);

    const locationPromise = getHighAccuracyLocation({
      maxAttempts: 2,
      acceptableAccuracy: 10,
      signal: abortController.signal,
    });

    await vi.waitFor(() => {
      expect(vi.getTimerCount()).toBe(1);
    });

    abortController.abort();

    await expect(locationPromise).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects high accuracy location attempts with invalid coordinates', async () => {
    const getCurrentPosition = vi.fn<Geolocation['getCurrentPosition']>((success) => {
      success(createPosition(20, { latitude: Number.NaN, longitude: 121.4 }));
    });
    mockGeolocation(getCurrentPosition);

    await expect(getHighAccuracyLocation({
      maxAttempts: 1,
      acceptableAccuracy: 30,
    })).rejects.toThrow('所有定位尝试都失败了');

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('normalizes invalid geolocation accuracy to a conservative fallback', async () => {
    const getCurrentPosition = vi.fn<Geolocation['getCurrentPosition']>((success) => {
      success(createPosition(Number.POSITIVE_INFINITY));
    });
    mockGeolocation(getCurrentPosition);

    const result = await getHighAccuracyLocation({
      maxAttempts: 1,
      acceptableAccuracy: 30,
    });

    expect(result.accuracy).toBe(999);
  });
});
