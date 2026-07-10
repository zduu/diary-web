import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AMapGeocodeResult, AMapGeocoder, AMapSdk } from './amapTypes';
import { buildPoiLocationInfo, getPoiCoordinates, reverseGeocodeLocation } from './mapLocationData';

function createAmapSdk(callbackResult?: AMapGeocodeResult, status = 'complete'): AMapSdk {
  return {
    Geocoder: class implements AMapGeocoder {
      getAddress(_location: [number, number], callback: (nextStatus: string, result?: AMapGeocodeResult) => void) {
        callback(status, callbackResult);
      }
    },
  };
}

describe('mapLocationData', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts finite zero-valued POI coordinates', () => {
    const poi = {
      name: '赤道地标',
      address: '零点坐标',
      location: {
        lng: 0,
        lat: 0,
      },
    };

    expect(getPoiCoordinates(poi)).toEqual([0, 0]);
    expect(buildPoiLocationInfo(poi)).toMatchObject({
      name: '赤道地标',
      latitude: 0,
      longitude: 0,
      address: '零点坐标',
    });
  });

  it('rejects missing or non-finite POI coordinates', () => {
    expect(getPoiCoordinates({ name: '无坐标' })).toBeNull();
    expect(getPoiCoordinates({ location: { lng: Number.NaN, lat: 31.2 } })).toBeNull();
    expect(getPoiCoordinates({ location: { lng: 121.4, lat: Number.POSITIVE_INFINITY } })).toBeNull();
  });

  it('rejects out-of-range POI coordinates', () => {
    expect(getPoiCoordinates({ location: { lng: 181, lat: 31.2 } })).toBeNull();
    expect(getPoiCoordinates({ location: { lng: 121.4, lat: -90.1 } })).toBeNull();
  });

  it('builds location info from AMap reverse geocode results', async () => {
    const location = await reverseGeocodeLocation(createAmapSdk({
      regeocode: {
        formattedAddress: '上海市徐汇区华山路1954号',
        addressComponent: {
          building: { name: '上海交通大学' },
          streetNumber: {
            street: '华山路',
            number: '1954',
          },
          district: '徐汇区',
          city: '上海市',
          province: '上海市',
        },
      },
    }), 121.43, 31.2);

    expect(location).toMatchObject({
      name: '上海交通大学',
      latitude: 31.2,
      longitude: 121.43,
      address: '上海市徐汇区华山路1954号',
      details: {
        building: '上海交通大学',
        road: '华山路',
        house_number: '1954',
        suburb: '徐汇区',
        city: '上海市',
        state: '上海市',
        country: '中国',
      },
    });
  });

  it('falls back to coordinate location when AMap reverse geocode returns no result', async () => {
    const location = await reverseGeocodeLocation(createAmapSdk(undefined), 121.43, 31.2);

    expect(location).toMatchObject({
      name: '位置 31.2000, 121.4300',
      latitude: 31.2,
      longitude: 121.43,
      address: '经度: 121.430000, 纬度: 31.200000',
      details: {
        city: '未知城市',
        country: '中国',
      },
    });
  });

  it('falls back to coordinate location when AMap reverse geocode never calls back', async () => {
    vi.useFakeTimers();

    const hangingSdk: AMapSdk = {
      Geocoder: class implements AMapGeocoder {
        getAddress() {
          // Simulate an SDK call that never resolves.
        }
      },
    };
    const locationResult = reverseGeocodeLocation(hangingSdk, 121.43, 31.2, 1000);

    await vi.advanceTimersByTimeAsync(1000);

    await expect(locationResult).resolves.toMatchObject({
      name: '位置 31.2000, 121.4300',
      latitude: 31.2,
      longitude: 121.43,
      address: '经度: 121.430000, 纬度: 31.200000',
    });
  });

  it('returns an unknown location without formatting invalid reverse geocode coordinates', async () => {
    const location = await reverseGeocodeLocation(createAmapSdk(undefined), 181, Number.NaN);

    expect(location).toEqual({
      name: '选中位置',
      address: '未知地址',
      details: {
        city: '未知城市',
        country: '中国',
      },
    });
    expect(JSON.stringify(location)).not.toMatch(/NaN|181\.0000/);
  });
});
