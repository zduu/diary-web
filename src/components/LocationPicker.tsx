import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { MapPin, Loader, X, Navigation, Map, Target } from 'lucide-react';
import type { LocationInfo } from '../types/index.ts';
import { useThemeContext } from './ThemeProvider';
import { LOCATION_CONFIG, isAmapConfigured } from '../config/location';
import { getDetailedLocationInfo } from './map/locationPickerGeocoding';
import { createSmartOfflineLocation } from './map/locationPickerOffline';
import { debugError, debugLog } from '../utils/logger.ts';
import { formatMeters, formatPositiveIntegerCount } from '../utils/numberFormat.ts';
import { isValidCoordinatePair, isValidLatitude, isValidLongitude } from '../utils/geoCoordinates.ts';

const MapLocationPicker = lazy(() =>
  import('./MapLocationPicker').then((module) => ({ default: module.MapLocationPicker }))
);

const QUICK_LOCATION_TIMEOUT_MS = 12_000;

interface LocationPickerProps {
  location: LocationInfo | null;
  onLocationChange: (location: LocationInfo | null) => void;
  disabled?: boolean;
}

function getFiniteLocationCoordinates(location: LocationInfo | null) {
  const latitude = location?.latitude;
  const longitude = location?.longitude;

  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    return null;
  }

  return {
    latitude,
    longitude,
  };
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

function isGeolocationError(error: unknown): error is GeolocationPositionError {
  return typeof error === 'object'
    && error !== null
    && typeof (error as { code?: unknown }).code === 'number';
}

function createAbortError() {
  return new DOMException('定位已取消', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function getCurrentPositionWithTimeout(
  geolocation: Geolocation,
  options: PositionOptions,
  timeoutMs: number,
  signal?: AbortSignal
) {
  throwIfAborted(signal);

  return new Promise<GeolocationPosition>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', handleAbort);
    };

    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      callback();
    };

    const handleAbort = () => {
      settle(() => reject(createAbortError()));
    };

    const timeoutId = setTimeout(() => {
      settle(() => reject(new Error('获取位置超时')));
    }, timeoutMs);

    signal?.addEventListener('abort', handleAbort, { once: true });

    try {
      geolocation.getCurrentPosition(
        (position) => settle(() => resolve(position)),
        (error) => settle(() => reject(error)),
        options
      );
    } catch (error) {
      settle(() => reject(error));
    }
  });
}

export function LocationPicker({ location, onLocationChange, disabled }: LocationPickerProps) {
  const { theme } = useThemeContext();
  const hasAmapMapSupport = isAmapConfigured() && LOCATION_CONFIG.ENABLE_AMAP;
  const highAccuracyMeta = location?.highAccuracy;
  const finiteCoordinates = getFiniteLocationCoordinates(location);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [manualLocation, setManualLocation] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [mapPickerRequested, setMapPickerRequested] = useState(false);
  const errorResetTimeoutRef = useRef<number | null>(null);
  const quickLocationAbortControllerRef = useRef<AbortController | null>(null);
  const highAccuracyAbortControllerRef = useRef<AbortController | null>(null);

  const scheduleLocationErrorReset = (delayMs: number) => {
    if (errorResetTimeoutRef.current !== null) {
      window.clearTimeout(errorResetTimeoutRef.current);
    }

    errorResetTimeoutRef.current = window.setTimeout(() => {
      setLocationError(null);
      errorResetTimeoutRef.current = null;
    }, delayMs);
  };

  useEffect(() => {
    return () => {
      if (errorResetTimeoutRef.current !== null) {
        window.clearTimeout(errorResetTimeoutRef.current);
      }
      quickLocationAbortControllerRef.current?.abort();
      highAccuracyAbortControllerRef.current?.abort();
    };
  }, []);

  // 获取当前位置
  const getCurrentLocation = async () => {
    if (isGettingLocation) return;

    if (!navigator.geolocation) {
      setLocationError('浏览器不支持地理定位');
      return;
    }

    setIsGettingLocation(true);
    setLocationError(null);
    quickLocationAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    quickLocationAbortControllerRef.current = abortController;

    try {
      const position = await getCurrentPositionWithTimeout(
        navigator.geolocation,
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000 // 5分钟缓存
        },
        QUICK_LOCATION_TIMEOUT_MS,
        abortController.signal
      );

      if (abortController.signal.aborted) {
        return;
      }

      const { latitude, longitude, accuracy } = position.coords;
      if (!isValidCoordinatePair(latitude, longitude)) {
        setLocationError('定位返回的坐标无效，请重试');
        return;
      }

      // 🔧 坐标系转换：GPS(WGS84) -> 高德地图(GCJ02)
      const { wgs84ToGcj02 } = await import('../utils/coordinateUtils');
      const gcj02Result = wgs84ToGcj02(latitude, longitude);
      const convertedLat = gcj02Result.latitude;
      const convertedLng = gcj02Result.longitude;

      // 输出调试信息
      debugLog('📍 GPS定位成功 (LocationPicker):');
      debugLog('  原始GPS坐标 (WGS84):', { latitude, longitude });
      debugLog('  转换后坐标 (GCJ02):', { latitude: convertedLat, longitude: convertedLng });
      debugLog('  坐标偏移距离:', formatMeters(gcj02Result.offset?.distance));
      debugLog('  GPS精度:', formatMeters(accuracy));

      // 获取详细的位置信息 (使用转换后的坐标)
      try {
        const locationInfo = await getDetailedLocationInfo(convertedLat, convertedLng);
        if (abortController.signal.aborted) {
          return;
        }

        onLocationChange({
          ...locationInfo,
          originalGPS: { latitude, longitude },
          coordinateOffset: gcj02Result.offset,
        });
      } catch (geocodeError) {
        debugError('地理编码失败，使用坐标作为位置名称:', geocodeError);

        // 提供离线模式的基本位置信息 (使用转换后的坐标)
        const offlineLocationInfo = createSmartOfflineLocation(convertedLat, convertedLng);
        if (abortController.signal.aborted) {
          return;
        }

        onLocationChange({
          ...offlineLocationInfo,
          originalGPS: { latitude, longitude },
          coordinateOffset: gcj02Result.offset,
        });

        // 显示友好的成功信息，根据失败原因提供不同提示
        let message = '✅ 已智能识别位置信息！';
        const errorMessage = geocodeError instanceof Error ? geocodeError.message : String(geocodeError);
        if (errorMessage.includes('USERKEY_PLAT_NOMATCH')) {
          message += ' 高德地图API配置需要调整，当前使用离线模式。';
        } else {
          message += ' 由于网络限制，使用了离线模式。';
        }
        setLocationError(message);
        scheduleLocationErrorReset(6000);
      }
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      let errorMessage = '获取位置失败';
      if (isGeolocationError(error)) {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = '位置访问被拒绝，请在浏览器设置中允许位置访问';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = '位置信息不可用';
            break;
          case error.TIMEOUT:
            errorMessage = '获取位置超时';
            break;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      setLocationError(errorMessage);
    } finally {
      if (quickLocationAbortControllerRef.current === abortController) {
        quickLocationAbortControllerRef.current = null;
      }

      if (!abortController.signal.aborted) {
        setIsGettingLocation(false);
      }
    }
  };

  // 高精度定位功能
  const getHighAccuracyLocationInfo = async () => {
    if (isGettingLocation) return;

    setIsGettingLocation(true);
    setLocationError(null);
    highAccuracyAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    highAccuracyAbortControllerRef.current = abortController;

    try {
      debugLog('🎯 开始高精度定位...');

      // 使用高精度定位策略
      const { getHighAccuracyLocation } = await import('../utils/coordinateUtils');
      const highAccuracyResult = await getHighAccuracyLocation({
        maxAttempts: 3,
        timeout: 12000,
        acceptableAccuracy: 30, // 目标精度30米
        targetSystem: 'GCJ02',
        signal: abortController.signal,
      });

      if (abortController.signal.aborted) {
        return;
      }

      debugLog('🎯 高精度定位完成:', highAccuracyResult);
      if (!isValidCoordinatePair(highAccuracyResult.latitude, highAccuracyResult.longitude)) {
        setLocationError('高精度定位返回的坐标无效，请重试');
        return;
      }

      // 获取详细的位置信息
      try {
        const locationInfo = await getDetailedLocationInfo(
          highAccuracyResult.latitude,
          highAccuracyResult.longitude
        );

        if (abortController.signal.aborted) {
          return;
        }

        onLocationChange({
          ...locationInfo,
          highAccuracy: {
            accuracy: highAccuracyResult.accuracy,
            confidence: highAccuracyResult.confidence,
            attempts: highAccuracyResult.attempts,
            coordinateOffset: highAccuracyResult.offset
          }
        });

        // 显示成功信息
        const successMessage = `✅ 高精度定位成功！精度: ${formatMeters(highAccuracyResult.accuracy)}，置信度: ${highAccuracyResult.confidence}`;
        setLocationError(successMessage);
        scheduleLocationErrorReset(8000);

      } catch (geocodeError) {
        debugError('地理编码失败，使用坐标作为位置名称:', geocodeError);

        // 提供离线模式的基本位置信息
        const offlineLocationInfo = createSmartOfflineLocation(
          highAccuracyResult.latitude,
          highAccuracyResult.longitude
        );

        if (abortController.signal.aborted) {
          return;
        }

        onLocationChange({
          ...offlineLocationInfo,
          highAccuracy: {
            accuracy: highAccuracyResult.accuracy,
            confidence: highAccuracyResult.confidence,
            attempts: highAccuracyResult.attempts,
            coordinateOffset: highAccuracyResult.offset
          }
        });

        const message = `✅ 高精度定位完成！精度: ${formatMeters(highAccuracyResult.accuracy)}，使用离线模式识别位置。`;
        setLocationError(message);
        scheduleLocationErrorReset(8000);
      }

    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      debugError('高精度定位失败:', error);
      let errorMessage = '高精度定位失败';
      if (isGeolocationError(error)) {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = '位置访问被拒绝，请在浏览器设置中允许位置访问';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = '位置信息不可用，请确保GPS信号良好';
            break;
          case error.TIMEOUT:
            errorMessage = '高精度定位超时，请在信号更好的地方重试';
            break;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      setLocationError(errorMessage);
    } finally {
      if (highAccuracyAbortControllerRef.current === abortController) {
        highAccuracyAbortControllerRef.current = null;
      }

      if (!abortController.signal.aborted) {
        setIsGettingLocation(false);
      }
    }
  };

  // 手动添加位置
  const handleManualLocation = () => {
    const locationName = manualLocation.trim();
    if (locationName) {
      onLocationChange({
        name: locationName,
        address: locationName
      });
      setManualLocation('');
      setShowManualInput(false);
    }
  };

  // 清除位置
  const clearLocation = () => {
    onLocationChange(null);
    setLocationError(null);
  };

  return (
    <div className="space-y-3">


      <label
        className="block text-sm font-medium"
        style={{ color: theme.colors.text }}
      >
        📍 位置 <span className="text-xs opacity-60">(可选)</span>
      </label>

      <div
        className="rounded-lg border px-3 py-2 text-xs"
        style={{
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          color: theme.colors.textSecondary,
        }}
      >
        {hasAmapMapSupport
          ? '当前使用完整地图模式：支持快速定位、高精度定位、手动输入和地图选点。'
          : '当前使用免配置模式：支持浏览器定位、高精度定位和手动输入，不依赖高德地图密钥。'}
      </div>

      {/* 当前位置显示 */}
      {location && (
        <div className="space-y-3">
          <div
            className="flex items-center justify-between p-3 rounded-lg border"
            style={{
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border
            }}
          >
            <div className="flex items-center gap-2 flex-1">
              <MapPin className="w-4 h-4 flex-shrink-0" style={{ color: theme.colors.primary }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: theme.colors.text }}>
                  {location.name || '未知位置'}
                </div>
                {location.address && location.address !== location.name && (
                  <div className="text-xs opacity-70 truncate" style={{ color: theme.colors.textSecondary }}>
                    {location.address}
                  </div>
                )}
                {finiteCoordinates && (
                  <div className="text-xs opacity-50" style={{ color: theme.colors.textSecondary }}>
                    {finiteCoordinates.latitude.toFixed(6)}, {finiteCoordinates.longitude.toFixed(6)}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={getCurrentLocation}
                className="p-1 rounded-full hover:bg-blue-100 transition-colors flex-shrink-0"
                title="刷新位置"
                disabled={disabled || isGettingLocation}
              >
                <Navigation className={`w-4 h-4 text-blue-500 ${isGettingLocation ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={clearLocation}
                className="p-1 rounded-full hover:bg-red-100 transition-colors flex-shrink-0"
                title="清除位置"
                disabled={disabled}
              >
                <X className="w-4 h-4 text-red-500" />
              </button>
            </div>
          </div>



          {/* 高精度定位信息 */}
          {highAccuracyMeta && (
            <div
              className="p-3 rounded-lg border"
              style={{
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.primary,
                borderStyle: 'dashed'
              }}
            >
              <div className="text-xs font-medium mb-2" style={{ color: theme.colors.primary }}>
                🎯 高精度定位信息
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="opacity-60" style={{ color: theme.colors.textSecondary }}>精度: </span>
                  <span style={{ color: theme.colors.text }}>
                    {formatMeters(highAccuracyMeta.accuracy)}
                  </span>
                </div>
                <div>
                  <span className="opacity-60" style={{ color: theme.colors.textSecondary }}>置信度: </span>
                  <span style={{
                    color: highAccuracyMeta.confidence === 'high' ? '#28a745' :
                           highAccuracyMeta.confidence === 'medium' ? '#ffc107' : '#dc3545'
                  }}>
                    {highAccuracyMeta.confidence === 'high' ? '高' :
                     highAccuracyMeta.confidence === 'medium' ? '中' : '低'}
                  </span>
                </div>
                <div>
                  <span className="opacity-60" style={{ color: theme.colors.textSecondary }}>定位次数: </span>
                  <span style={{ color: theme.colors.text }}>
                    {formatPositiveIntegerCount(highAccuracyMeta.attempts, '次')}
                  </span>
                </div>
                <div>
                  <span className="opacity-60" style={{ color: theme.colors.textSecondary }}>坐标偏移: </span>
                  <span style={{ color: theme.colors.text }}>
                    {formatMeters(highAccuracyMeta.coordinateOffset?.distance)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 详细地址信息 */}
          {location.details && (
            <div
              className="p-3 rounded-lg border"
              style={{
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border
              }}
            >
              <div className="text-xs font-medium mb-2" style={{ color: theme.colors.text }}>
                🏢 详细信息
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {location.details.building && (
                  <div>
                    <span className="opacity-60" style={{ color: theme.colors.textSecondary }}>建筑: </span>
                    <span style={{ color: theme.colors.text }}>{location.details.building}</span>
                  </div>
                )}
                {location.details.road && (
                  <div>
                    <span className="opacity-60" style={{ color: theme.colors.textSecondary }}>道路: </span>
                    <span style={{ color: theme.colors.text }}>{location.details.road}</span>
                  </div>
                )}
                {location.details.neighbourhood && (
                  <div>
                    <span className="opacity-60" style={{ color: theme.colors.textSecondary }}>社区: </span>
                    <span style={{ color: theme.colors.text }}>{location.details.neighbourhood}</span>
                  </div>
                )}
                {location.details.city && (
                  <div>
                    <span className="opacity-60" style={{ color: theme.colors.textSecondary }}>城市: </span>
                    <span style={{ color: theme.colors.text }}>{location.details.city}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 位置状态显示 */}
      {locationError && (
        <div
          className={`p-3 rounded-lg border text-sm flex items-center gap-2 ${
            locationError.includes('✅')
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-orange-200 bg-orange-50 text-orange-700'
          }`}
        >
          <span className="flex-shrink-0">
            {locationError.includes('✅') ? '✅' : '⚠️'}
          </span>
          <span className="flex-1">
            {locationError.replace('✅ ', '')}
          </span>
        </div>
      )}

      {/* 操作按钮 */}
      {!location && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={getCurrentLocation}
            disabled={isGettingLocation || disabled}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 hover:opacity-80 disabled:opacity-50"
            style={{
              backgroundColor: theme.colors.primary,
              color: 'white'
            }}
          >
            {isGettingLocation ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <Navigation className="w-4 h-4" />
            )}
            {isGettingLocation ? '获取中...' : '快速定位'}
          </button>

          <button
            type="button"
            onClick={getHighAccuracyLocationInfo}
            disabled={isGettingLocation || disabled}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border transition-all duration-200 hover:opacity-80 disabled:opacity-50"
            style={{
              borderColor: theme.colors.primary,
              color: theme.colors.primary,
              backgroundColor: theme.colors.surface
            }}
            title="多次定位取平均值，提高精度"
          >
            {isGettingLocation ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <Target className="w-4 h-4" />
            )}
            {isGettingLocation ? '高精度定位中...' : '高精度定位'}
          </button>

          <button
            type="button"
            onClick={() => setShowManualInput(!showManualInput)}
            disabled={disabled}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border transition-all duration-200 hover:opacity-80"
            style={{
              borderColor: theme.colors.border,
              color: theme.colors.text,
              backgroundColor: theme.colors.surface
            }}
          >
            <MapPin className="w-4 h-4" />
            手动输入
          </button>

          {hasAmapMapSupport && (
            <button
              type="button"
              onClick={() => {
                setMapPickerRequested(true);
                setShowMapPicker(true);
              }}
              disabled={disabled}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border transition-all duration-200 hover:opacity-80"
              style={{
                borderColor: theme.colors.primary,
                color: theme.colors.primary,
                backgroundColor: theme.colors.surface,
                position: 'relative',
                zIndex: 10
              }}
            >
              <Map className="w-4 h-4" />
              地图选择
            </button>
          )}


        </div>
      )}

      {/* 手动输入框 */}
      {showManualInput && (
        <div className="flex gap-2">
          <input
            type="text"
            value={manualLocation}
            onChange={(e) => setManualLocation(e.target.value)}
            placeholder="输入位置名称，如：咖啡厅、家里、公司..."
            className="flex-1 px-3 py-2 rounded-md border focus:outline-none focus:ring-2 transition-all duration-200"
            style={{
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              color: theme.colors.text,
              '--tw-ring-color': theme.colors.primary,
            } as React.CSSProperties}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleManualLocation();
              }
            }}
            disabled={disabled}
          />
          <button
            type="button"
            onClick={handleManualLocation}
            disabled={!manualLocation.trim() || disabled}
            className="px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 hover:opacity-80 disabled:opacity-50"
            style={{
              backgroundColor: theme.colors.primary,
              color: 'white'
            }}
          >
            添加
          </button>
        </div>
      )}

      {/* 地图位置选择器 - 只在需要时渲染 */}
      {mapPickerRequested && showMapPicker && (
        <Suspense
          fallback={
            <div
              className="rounded-lg border px-3 py-2 text-sm"
              style={{
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                color: theme.colors.textSecondary,
              }}
            >
              正在加载地图选择器...
            </div>
          }
        >
          <MapLocationPicker
            isOpen={showMapPicker}
            onClose={() => setShowMapPicker(false)}
            onLocationSelect={(selectedLocation) => {
              onLocationChange(selectedLocation);
              setShowMapPicker(false);
            }}
            initialLocation={finiteCoordinates ? { lat: finiteCoordinates.latitude, lng: finiteCoordinates.longitude } : null}
          />
        </Suspense>
      )}


    </div>
  );
}
