import type { LocationInfo } from '../../types/index.ts';
import { isValidCoordinatePair, isValidLatitude, isValidLongitude } from '../../utils/geoCoordinates.ts';
import { debugLog, debugWarn } from '../../utils/logger.ts';
import type { AMapAddressComponent, AMapPoi, AMapRegeocode, AMapSdk } from './amapTypes';

const REVERSE_GEOCODE_TIMEOUT_MS = 8_000;

function getLocationName(addressComponent: AMapAddressComponent, formattedAddress: string) {
  if (addressComponent.building?.name) return addressComponent.building.name;
  if (addressComponent.neighborhood?.name) return addressComponent.neighborhood.name;
  if (addressComponent.streetNumber?.street && addressComponent.streetNumber?.number) {
    return `${addressComponent.streetNumber.street}${addressComponent.streetNumber.number}号`;
  }
  if (addressComponent.streetNumber?.street) return addressComponent.streetNumber.street;
  if (addressComponent.township?.name) return addressComponent.township.name;
  if (addressComponent.district) return `${addressComponent.city || ''}${addressComponent.district}`;

  if (formattedAddress) {
    const parts = formattedAddress.split(/[省市区县]/);
    if (parts.length > 1) return parts[parts.length - 1].trim();
  }

  return '选中位置';
}

function buildFallbackLocationInfo(lat: number, lng: number): LocationInfo {
  return {
    name: `位置 ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    latitude: lat,
    longitude: lng,
    address: `经度: ${lng.toFixed(6)}, 纬度: ${lat.toFixed(6)}`,
    details: {
      city: '未知城市',
      country: '中国',
    },
  };
}

function buildUnknownLocationInfo(): LocationInfo {
  return {
    name: '选中位置',
    address: '未知地址',
    details: {
      city: '未知城市',
      country: '中国',
    },
  };
}

function buildGeocodedLocationInfo(lat: number, lng: number, regeocode: AMapRegeocode): LocationInfo {
  const addressComponent = regeocode.addressComponent ?? {};
  const formattedAddress = regeocode.formattedAddress ?? '';

  return {
    name: getLocationName(addressComponent, formattedAddress),
    latitude: lat,
    longitude: lng,
    address: formattedAddress,
    details: {
      building: addressComponent.building?.name,
      neighbourhood: addressComponent.neighborhood?.name,
      road: addressComponent.streetNumber?.street,
      house_number: addressComponent.streetNumber?.number,
      suburb: addressComponent.district,
      city: addressComponent.city,
      state: addressComponent.province,
      country: '中国',
    },
  };
}

export function buildPoiLocationInfo(poi: AMapPoi): LocationInfo {
  const coordinates = getPoiCoordinates(poi);

  return {
    name: poi.name || '选中位置',
    latitude: coordinates?.[1],
    longitude: coordinates?.[0],
    address: poi.address || poi.name || '未知地址',
    details: {
      building: poi.name,
      city: poi.cityname,
      suburb: poi.adname,
      country: '中国',
    },
  };
}

export function getPoiCoordinates(poi: AMapPoi): [number, number] | null {
  if (!poi?.location) {
    return null;
  }

  const lng = poi.location.lng;
  const lat = poi.location.lat;

  if (!isValidLatitude(lat) || !isValidLongitude(lng)) {
    return null;
  }

  return [lng, lat];
}

export async function reverseGeocodeLocation(
  AMap: AMapSdk,
  lng: number,
  lat: number,
  timeoutMs = REVERSE_GEOCODE_TIMEOUT_MS
): Promise<LocationInfo> {
  if (!isValidCoordinatePair(lat, lng)) {
    debugWarn('🗺️ 逆地理编码坐标无效:', { lat, lng });
    return buildUnknownLocationInfo();
  }

  return new Promise((resolve) => {
    let settled = false;

    const settle = (location: LocationInfo) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutId);
      resolve(location);
    };

    const timeoutId = setTimeout(() => {
      debugWarn('🗺️ 逆地理编码超时，使用坐标创建位置');
      settle(buildFallbackLocationInfo(lat, lng));
    }, timeoutMs);

    try {
      const geocoder = new AMap.Geocoder({
        radius: 1000,
        extensions: 'all',
      });

      geocoder.getAddress([lng, lat], (status, result) => {
        debugLog('🗺️ 地理编码结果:', { status, result });

        if (status === 'complete' && result?.regeocode) {
          settle(buildGeocodedLocationInfo(lat, lng, result.regeocode));
          return;
        }

        debugWarn('🗺️ 地理编码失败，使用坐标创建位置:', { status, result });
        settle(buildFallbackLocationInfo(lat, lng));
      });
    } catch (error) {
      debugWarn('逆地理编码失败:', error);
      settle(buildFallbackLocationInfo(lat, lng));
    }
  });
}
