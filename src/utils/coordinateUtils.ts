import { debugLog, debugWarn } from './logger.ts';
import { formatMeters } from './numberFormat.ts';
import { isValidCoordinatePair } from './geoCoordinates.ts';

/**
 * 坐标系转换工具
 * 解决GPS定位偏差问题
 */

// 坐标系类型
type CoordinateSystem = 'WGS84' | 'GCJ02' | 'BD09';

// 坐标点接口
interface Coordinate {
  latitude: number;
  longitude: number;
  system?: CoordinateSystem;
}

// 转换结果接口
interface ConversionResult extends Coordinate {
  originalSystem: CoordinateSystem;
  targetSystem: CoordinateSystem;
  offset?: {
    latitude: number;
    longitude: number;
    distance: number;
  };
}

/**
 * 判断坐标是否在中国境内
 * 在中国境内需要进行坐标系转换
 */
function isInChina(lat: number, lng: number): boolean {
  return lat >= 18 && lat <= 54 && lng >= 73 && lng <= 135;
}

/**
 * WGS84转GCJ02 (GPS坐标转火星坐标)
 * 用于将GPS原始坐标转换为高德地图坐标系
 */
export function wgs84ToGcj02(lat: number, lng: number): ConversionResult {
  if (!isInChina(lat, lng)) {
    // 海外地区不需要转换
    return {
      latitude: lat,
      longitude: lng,
      originalSystem: 'WGS84',
      targetSystem: 'GCJ02',
      offset: { latitude: 0, longitude: 0, distance: 0 }
    };
  }

  const a = 6378245.0;
  const ee = 6.693421622965943e-3;
  
  const dLat = transformLat(lng - 105.0, lat - 35.0);
  const dLng = transformLng(lng - 105.0, lat - 35.0);
  
  const radLat = lat / 180.0 * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - ee * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  
  const adjustedLat = lat + (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI);
  const adjustedLng = lng + (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * Math.PI);
  
  const offsetLat = adjustedLat - lat;
  const offsetLng = adjustedLng - lng;
  const offsetDistance = calculateDistance(lat, lng, adjustedLat, adjustedLng);

  return {
    latitude: adjustedLat,
    longitude: adjustedLng,
    originalSystem: 'WGS84',
    targetSystem: 'GCJ02',
    system: 'GCJ02',
    offset: {
      latitude: offsetLat,
      longitude: offsetLng,
      distance: offsetDistance
    }
  };
}

/**
 * GCJ02转WGS84 (火星坐标转GPS坐标)
 * 用于将高德地图坐标转换为GPS坐标
 */
function gcj02ToWgs84(lat: number, lng: number): ConversionResult {
  if (!isInChina(lat, lng)) {
    return {
      latitude: lat,
      longitude: lng,
      originalSystem: 'GCJ02',
      targetSystem: 'WGS84',
      offset: { latitude: 0, longitude: 0, distance: 0 }
    };
  }

  const a = 6378245.0;
  const ee = 6.693421622965943e-3;
  
  const dLat = transformLat(lng - 105.0, lat - 35.0);
  const dLng = transformLng(lng - 105.0, lat - 35.0);
  
  const radLat = lat / 180.0 * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - ee * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  
  const adjustedLat = lat - (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI);
  const adjustedLng = lng - (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * Math.PI);
  
  const offsetLat = adjustedLat - lat;
  const offsetLng = adjustedLng - lng;
  const offsetDistance = calculateDistance(lat, lng, adjustedLat, adjustedLng);

  return {
    latitude: adjustedLat,
    longitude: adjustedLng,
    originalSystem: 'GCJ02',
    targetSystem: 'WGS84',
    system: 'WGS84',
    offset: {
      latitude: offsetLat,
      longitude: offsetLng,
      distance: offsetDistance
    }
  };
}

/**
 * GCJ02转BD09 (火星坐标转百度坐标)
 */
function gcj02ToBd09(lat: number, lng: number): ConversionResult {
  const z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin(lat * Math.PI * 3000.0 / 180.0);
  const theta = Math.atan2(lat, lng) + 0.000003 * Math.cos(lng * Math.PI * 3000.0 / 180.0);
  
  const bdLat = z * Math.sin(theta) + 0.006;
  const bdLng = z * Math.cos(theta) + 0.0065;
  
  const offsetDistance = calculateDistance(lat, lng, bdLat, bdLng);

  return {
    latitude: bdLat,
    longitude: bdLng,
    originalSystem: 'GCJ02',
    targetSystem: 'BD09',
    system: 'BD09',
    offset: {
      latitude: bdLat - lat,
      longitude: bdLng - lng,
      distance: offsetDistance
    }
  };
}

/**
 * BD09转GCJ02 (百度坐标转火星坐标)
 */
function bd09ToGcj02(lat: number, lng: number): ConversionResult {
  const x = lng - 0.0065;
  const y = lat - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * Math.PI * 3000.0 / 180.0);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * Math.PI * 3000.0 / 180.0);
  
  const gcjLat = z * Math.sin(theta);
  const gcjLng = z * Math.cos(theta);
  
  const offsetDistance = calculateDistance(lat, lng, gcjLat, gcjLng);

  return {
    latitude: gcjLat,
    longitude: gcjLng,
    originalSystem: 'BD09',
    targetSystem: 'GCJ02',
    system: 'GCJ02',
    offset: {
      latitude: gcjLat - lat,
      longitude: gcjLng - lng,
      distance: offsetDistance
    }
  };
}

/**
 * 自动转换坐标系
 * 根据目标系统自动选择转换方法
 */
function convertCoordinate(
  lat: number, 
  lng: number, 
  from: CoordinateSystem, 
  to: CoordinateSystem
): ConversionResult {
  if (from === to) {
    return {
      latitude: lat,
      longitude: lng,
      originalSystem: from,
      targetSystem: to,
      system: to,
      offset: { latitude: 0, longitude: 0, distance: 0 }
    };
  }

  switch (`${from}->${to}`) {
    case 'WGS84->GCJ02':
      return wgs84ToGcj02(lat, lng);
    case 'GCJ02->WGS84':
      return gcj02ToWgs84(lat, lng);
    case 'GCJ02->BD09':
      return gcj02ToBd09(lat, lng);
    case 'BD09->GCJ02':
      return bd09ToGcj02(lat, lng);
    case 'WGS84->BD09': {
      const gcj02Result = wgs84ToGcj02(lat, lng);
      return gcj02ToBd09(gcj02Result.latitude, gcj02Result.longitude);
    }
    case 'BD09->WGS84': {
      const gcj02Result2 = bd09ToGcj02(lat, lng);
      return gcj02ToWgs84(gcj02Result2.latitude, gcj02Result2.longitude);
    }
    default:
      throw new Error(`不支持的坐标系转换: ${from} -> ${to}`);
  }
}

/**
 * 纬度转换辅助函数
 */
function transformLat(lng: number, lat: number): number {
  let ret = -100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng));
  ret += (20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(lat * Math.PI) + 40.0 * Math.sin(lat / 3.0 * Math.PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(lat / 12.0 * Math.PI) + 320 * Math.sin(lat * Math.PI / 30.0)) * 2.0 / 3.0;
  return ret;
}

/**
 * 经度转换辅助函数
 */
function transformLng(lng: number, lat: number): number {
  let ret = 300.0 + lng + 2.0 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng));
  ret += (20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(lng * Math.PI) + 40.0 * Math.sin(lng / 3.0 * Math.PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(lng / 12.0 * Math.PI) + 300.0 * Math.sin(lng / 30.0 * Math.PI)) * 2.0 / 3.0;
  return ret;
}

/**
 * 计算两点间距离（米）
 * 使用Haversine公式
 */
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // 地球半径（米）
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * 高精度定位接口
 */
interface HighAccuracyLocationResult extends ConversionResult {
  accuracy?: number;
  timestamp: number;
  attempts: number;
  method: 'gps' | 'network' | 'hybrid';
  confidence: 'high' | 'medium' | 'low';
}

function createAbortError() {
  return new DOMException('定位已取消', 'AbortError');
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function waitForRetry(delayMs: number, signal?: AbortSignal) {
  throwIfAborted(signal);

  return new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    }, delayMs);

    const handleAbort = () => {
      clearTimeout(timeoutId);
      reject(createAbortError());
    };

    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

function normalizeGeolocationAccuracy(value: number | null) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 999;
}

function getCurrentPositionWithSignal(
  options: PositionOptions,
  signal?: AbortSignal
) {
  throwIfAborted(signal);

  return new Promise<GeolocationPosition>((resolve, reject) => {
    const handleAbort = () => {
      reject(createAbortError());
    };

    signal?.addEventListener('abort', handleAbort, { once: true });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        signal?.removeEventListener('abort', handleAbort);
        if (signal?.aborted) {
          reject(createAbortError());
          return;
        }

        resolve(position);
      },
      (error) => {
        signal?.removeEventListener('abort', handleAbort);
        reject(error);
      },
      options
    );
  });
}

/**
 * 多重定位策略 - 提高定位精度
 * 通过多次定位、多种方式组合来提高精度
 */
export async function getHighAccuracyLocation(
  options: {
    maxAttempts?: number;
    timeout?: number;
    acceptableAccuracy?: number;
    targetSystem?: CoordinateSystem;
    signal?: AbortSignal;
  } = {}
): Promise<HighAccuracyLocationResult> {
  const {
    maxAttempts = 3,
    timeout = 10000,
    acceptableAccuracy = 50,
    targetSystem = 'GCJ02',
    signal
  } = options;

  throwIfAborted(signal);
  debugLog('🎯 开始高精度定位，目标精度:', acceptableAccuracy, '米');

  const attempts: Array<{
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: number;
  }> = [];

  // 多次尝试GPS定位
  for (let i = 0; i < maxAttempts; i++) {
    try {
      debugLog(`📡 第${i + 1}/${maxAttempts}次GPS定位尝试...`);

      const position = await getCurrentPositionWithSignal(
        {
          enableHighAccuracy: true,
          timeout: timeout,
          maximumAge: 0
        },
        signal
      );

      const { latitude, longitude, accuracy } = position.coords;
      if (!isValidCoordinatePair(latitude, longitude)) {
        debugWarn(`❌ 第${i + 1}次定位坐标无效:`, { latitude, longitude });

        if (i < maxAttempts - 1) {
          await waitForRetry(2000, signal);
        }

        continue;
      }

      const normalizedAccuracy = normalizeGeolocationAccuracy(accuracy);
      const attempt = {
        latitude,
        longitude,
        accuracy: normalizedAccuracy,
        timestamp: position.timestamp
      };

      attempts.push(attempt);

      debugLog(`📍 第${i + 1}次定位结果:`, {
        coordinates: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
        accuracy: formatMeters(normalizedAccuracy)
      });

      // 如果精度已经足够好，可以提前结束
      if (normalizedAccuracy <= acceptableAccuracy) {
        debugLog('✅ 达到目标精度，提前结束定位');
        break;
      }

      // 等待一段时间再进行下次定位
      if (i < maxAttempts - 1) {
        await waitForRetry(2000, signal);
      }

    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

      debugWarn(`❌ 第${i + 1}次定位失败:`, error);
    }
  }

  if (attempts.length === 0) {
    throw new Error('所有定位尝试都失败了');
  }

  // 选择最佳定位结果
  const bestAttempt = selectBestLocation(attempts);
  debugLog('🏆 选择最佳定位结果:', bestAttempt);

  // 转换坐标系
  const converted = convertCoordinate(
    bestAttempt.latitude,
    bestAttempt.longitude,
    'WGS84',
    targetSystem
  );

  // 评估置信度
  const confidence = evaluateLocationConfidence(bestAttempt.accuracy, attempts.length);

  const result: HighAccuracyLocationResult = {
    ...converted,
    accuracy: bestAttempt.accuracy,
    timestamp: bestAttempt.timestamp,
    attempts: attempts.length,
    method: 'gps',
    confidence
  };

  debugLog('🎯 高精度定位完成:', {
    finalCoordinates: `${result.latitude.toFixed(6)}, ${result.longitude.toFixed(6)}`,
    accuracy: formatMeters(result.accuracy),
    confidence: result.confidence,
    attempts: result.attempts
  });

  return result;
}

/**
 * 选择最佳定位结果
 * 优先选择精度最高的结果，如果精度相近则选择最新的
 */
function selectBestLocation(attempts: Array<{
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}>): typeof attempts[0] {
  if (attempts.length === 1) {
    return attempts[0];
  }

  // 按精度排序，精度越小越好
  const sortedByAccuracy = [...attempts].sort((a, b) => a.accuracy - b.accuracy);

  // 如果最佳精度和次佳精度相差不大（<20米），选择更新的
  const best = sortedByAccuracy[0];
  const second = sortedByAccuracy[1];

  if (second && Math.abs(best.accuracy - second.accuracy) < 20) {
    // 选择时间戳更新的
    return best.timestamp > second.timestamp ? best : second;
  }

  return best;
}

/**
 * 评估定位置信度
 */
function evaluateLocationConfidence(accuracy: number, attempts: number): 'high' | 'medium' | 'low' {
  if (accuracy <= 20 && attempts >= 2) {
    return 'high';
  } else if (accuracy <= 50 && attempts >= 1) {
    return 'medium';
  } else {
    return 'low';
  }
}
