import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AMapPlaceSearch, AMapPlaceSearchResult } from './amapTypes';
import { searchPlaces } from './mapSearch';

function createPlaceSearch(status: string, result?: AMapPlaceSearchResult): AMapPlaceSearch {
  return {
    search(_query, callback) {
      callback(status, result);
    },
  };
}

describe('mapSearch', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns limited POI results from successful searches', async () => {
    await expect(searchPlaces(createPlaceSearch('complete', {
      poiList: {
        pois: [
          { name: '地点 1', location: { lng: 121.1, lat: 31.1 } },
          { name: '地点 2', location: { lng: 121.2, lat: 31.2 } },
          { name: '地点 3', location: { lng: 121.3, lat: 31.3 } },
        ],
      },
    }), '地点', 2)).resolves.toEqual([
      { name: '地点 1', location: { lng: 121.1, lat: 31.1 } },
      { name: '地点 2', location: { lng: 121.2, lat: 31.2 } },
    ]);
  });

  it('rejects when AMap reports a search error', async () => {
    await expect(searchPlaces(createPlaceSearch('error'), '地点')).rejects.toThrow('搜索失败，请重试');
  });

  it('returns an empty list for incomplete or empty search responses', async () => {
    await expect(searchPlaces(createPlaceSearch('complete'), '地点')).resolves.toEqual([]);
    await expect(searchPlaces(createPlaceSearch('no_data'), '地点')).resolves.toEqual([]);
  });

  it('returns an empty list when AMap search never calls back', async () => {
    vi.useFakeTimers();

    const placeSearch: AMapPlaceSearch = {
      search() {
        // Simulate an SDK call that never resolves.
      },
    };
    const searchResult = searchPlaces(placeSearch, '地点', 5, 1000);

    await vi.advanceTimersByTimeAsync(1000);

    await expect(searchResult).resolves.toEqual([]);
  });
});
