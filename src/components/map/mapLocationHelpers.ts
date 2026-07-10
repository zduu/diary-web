import { wgs84ToGcj02 } from '../../utils/coordinateUtils.ts';
import { isValidCoordinatePair } from '../../utils/geoCoordinates.ts';
import { debugError, debugLog } from '../../utils/logger.ts';
import { formatMeters } from '../../utils/numberFormat.ts';

export function blurActiveInput(setHasInputFocus?: (focused: boolean) => void) {
  const activeElement = document.activeElement as HTMLElement | null;

  if (!activeElement || (activeElement.tagName !== 'INPUT' && activeElement.tagName !== 'TEXTAREA')) {
    return false;
  }

  try {
    activeElement.blur();
    setHasInputFocus?.(false);
    return true;
  } catch (error) {
    debugError('输入框失焦失败:', error);
    return false;
  }
}

export function getLocationErrorMessage(error: GeolocationPositionError, variant: 'short' | 'detailed' = 'short') {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return variant === 'detailed'
        ? '定位权限被拒绝，请在浏览器设置中允许位置访问'
        : '位置权限被拒绝';
    case error.POSITION_UNAVAILABLE:
      return variant === 'detailed'
        ? '位置信息不可用，可能是网络问题或GPS信号弱'
        : '位置信息不可用';
    case error.TIMEOUT:
      return variant === 'detailed'
        ? '定位请求超时，请检查网络连接或移动到信号更好的地方'
        : '定位超时';
    default:
      return '定位失败';
  }
}

export function convertGeolocationPosition(position: GeolocationPosition) {
  const { latitude, longitude, accuracy } = position.coords;
  if (!isValidCoordinatePair(latitude, longitude)) {
    throw new Error('定位返回的坐标无效');
  }

  const gcj02Result = wgs84ToGcj02(latitude, longitude);
  const location: [number, number] = [gcj02Result.longitude, gcj02Result.latitude];

  return {
    accuracy,
    original: { latitude, longitude },
    converted: {
      latitude: gcj02Result.latitude,
      longitude: gcj02Result.longitude,
    },
    location,
    gcj02Result,
  };
}

export function logConvertedLocation(prefix: string, position: ReturnType<typeof convertGeolocationPosition>) {
  if (!import.meta.env.DEV) {
    return;
  }

  debugLog(`${prefix} (坐标已转换):`);
  debugLog('  原始GPS坐标 (WGS84):', position.original);
  debugLog('  转换后坐标 (GCJ02):', position.converted);
  debugLog('  坐标偏移距离:', formatMeters(position.gcj02Result.offset?.distance));
  debugLog('  GPS精度:', formatMeters(position.accuracy));
}
