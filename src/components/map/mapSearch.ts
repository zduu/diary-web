import type { AMapPlaceSearch, AMapPlaceSearchResult, AMapPoi } from './amapTypes';

const PLACE_SEARCH_TIMEOUT_MS = 8_000;

export function searchPlaces(
  placeSearch: AMapPlaceSearch,
  query: string,
  limit = 5,
  timeoutMs = PLACE_SEARCH_TIMEOUT_MS
): Promise<AMapPoi[]> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timeoutId = setTimeout(() => {
      settle(() => resolve([]));
    }, timeoutMs);

    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutId);
      callback();
    };

    placeSearch.search(query, (status: string, result?: AMapPlaceSearchResult) => {
      if (status === 'complete' && result?.poiList?.pois) {
        const pois = result.poiList.pois;
        settle(() => resolve(pois.slice(0, limit)));
        return;
      }

      if (status === 'error') {
        settle(() => reject(new Error('搜索失败，请重试')));
        return;
      }

      settle(() => resolve([]));
    });
  });
}
