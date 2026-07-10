import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOCATION_CONFIG } from '../../config/location';
import { getDetailedLocationInfo, tryAmapGeocoding, tryJSONPGeocoding } from './locationPickerGeocoding';

type GeocodeCallbackName = `geocodeCallback_${string}`;
const originalAmapWebKey = LOCATION_CONFIG.AMAP_WEB_KEY;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  LOCATION_CONFIG.AMAP_WEB_KEY = originalAmapWebKey;
  document.querySelectorAll('script[id^="geocodeCallback_"]').forEach((script) => script.remove());
});

describe('locationPickerGeocoding', () => {
  it('rejects invalid AMap coordinates before fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(tryAmapGeocoding(Number.NaN, 121.43)).resolves.toBeNull();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clears the AMap timeout when fetch rejects', async () => {
    LOCATION_CONFIG.AMAP_WEB_KEY = 'test-amap-web-key';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network failed')));
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    await expect(tryAmapGeocoding(31.2, 121.43)).resolves.toBeNull();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it('resolves JSONP geocoding results and cleans up callback resources', async () => {
    const resultPromise = tryJSONPGeocoding(31.2, 121.43);
    const script = document.querySelector('script[id^="geocodeCallback_"]') as HTMLScriptElement | null;
    expect(script).not.toBeNull();

    const callbackName = script!.id as GeocodeCallbackName;
    window[callbackName]?.({
      display_name: '上海交通大学, 华山路, 徐汇区, 上海市, 中国',
      lat: '31.2',
      lon: '121.43',
      address: {
        house_number: '1954',
        road: '华山路',
        suburb: '徐汇区',
        city: '上海市',
        state: '上海市',
        country: '中国',
      },
    });

    await expect(resultPromise).resolves.toMatchObject({
      name: '上海交通大学',
      address: '上海交通大学, 华山路, 徐汇区, 上海市, 中国',
      latitude: 31.2,
      longitude: 121.43,
      nearbyPOIs: [],
      details: {
        house_number: '1954',
        road: '华山路',
        suburb: '徐汇区',
        city: '上海市',
        state: '上海市',
        country: '中国',
      },
    });

    expect(document.getElementById(callbackName)).toBeNull();
    expect(window[callbackName]).toBeUndefined();
  });

  it('resolves null and cleans up callback resources when JSONP script loading fails', async () => {
    const resultPromise = tryJSONPGeocoding(31.2, 121.43);
    const script = document.querySelector('script[id^="geocodeCallback_"]') as HTMLScriptElement | null;
    expect(script).not.toBeNull();

    const callbackName = script!.id as GeocodeCallbackName;
    script!.dispatchEvent(new Event('error'));

    await expect(resultPromise).resolves.toBeNull();
    expect(document.getElementById(callbackName)).toBeNull();
    expect(window[callbackName]).toBeUndefined();
  });

  it('rejects invalid JSONP coordinates before creating a script', async () => {
    await expect(tryJSONPGeocoding(31.2, 181)).resolves.toBeNull();

    expect(document.querySelector('script[id^="geocodeCallback_"]')).toBeNull();
  });

  it('resolves null and cleans up callback resources when JSONP geocoding times out', async () => {
    vi.useFakeTimers();

    const resultPromise = tryJSONPGeocoding(31.2, 121.43);
    const script = document.querySelector('script[id^="geocodeCallback_"]') as HTMLScriptElement | null;
    expect(script).not.toBeNull();

    const callbackName = script!.id as GeocodeCallbackName;
    await vi.advanceTimersByTimeAsync(10000);

    await expect(resultPromise).resolves.toBeNull();
    expect(document.getElementById(callbackName)).toBeNull();
    expect(window[callbackName]).toBeUndefined();
  });

  it('returns an unknown location for invalid detailed location coordinates', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(getDetailedLocationInfo(Number.NaN, 121.43)).resolves.toEqual({
      name: '未知位置',
      address: '未知地址',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.querySelector('script[id^="geocodeCallback_"]')).toBeNull();
  });
});
