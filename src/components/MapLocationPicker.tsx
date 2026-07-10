import { useEffect, useRef, useState, useCallback } from 'react';
import { Navigation, Loader } from 'lucide-react';
import type { LocationInfo } from '../types/index.ts';
import { ModalHeader } from './ModalHeader';
import { ModalShell } from './ModalShell';
import { useThemeContext } from './ThemeProvider';
import { LOCATION_CONFIG, isAmapConfigured, isAmapJSConfigured } from '../config/location';
import { MapPickerConfigNotice } from './map/MapPickerConfigNotice';
import { MapPickerLegend } from './map/MapPickerLegend';
import {
  buildPoiLocationInfo,
  getPoiCoordinates,
  reverseGeocodeLocation,
} from './map/mapLocationData';
import {
  blurActiveInput,
  convertGeolocationPosition,
  getLocationErrorMessage,
  logConvertedLocation,
} from './map/mapLocationHelpers';
import { replaceSelectionMarker, replaceUserLocationMarker } from './map/mapMarkers';
import {
  cleanupMapRuntime,
  createGeolocationControl,
  createMapInstance,
  createPlaceSearchService,
  loadAmapScript,
} from './map/mapPickerRuntime';
import { MapPickerSearchPanel } from './map/MapPickerSearchPanel';
import { MapPickerSelectedLocation } from './map/MapPickerSelectedLocation';
import { MapPickerStatusOverlay } from './map/MapPickerStatusOverlay';
import { searchPlaces } from './map/mapSearch';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useIsMobile } from '../hooks/useIsMobile';
import { debugError, debugLog, debugWarn } from '../utils/logger.ts';
import type {
  AMapMap,
  AMapMapClickEvent,
  AMapOverlay,
  AMapPlaceSearch,
  AMapPoi,
  AMapRuntimeSdk,
} from './map/amapTypes';

interface MapLocationPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onLocationSelect: (location: LocationInfo) => void;
  initialLocation?: { lat: number; lng: number } | null;
}

declare global {
  interface Window {
    AMap?: AMapRuntimeSdk;
    _AMapSecurityConfig?: {
      securityJsCode?: string;
    };
  }
}

const MAP_AUTO_LOCATION_TIMEOUT_MS = 10_000;

function createAbortError() {
  return new DOMException('定位已取消', 'AbortError');
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

function isGeolocationErrorLike(error: unknown): error is GeolocationPositionError {
  return typeof error === 'object'
    && error !== null
    && typeof (error as { code?: unknown }).code === 'number';
}

function getMapLocationErrorMessage(error: unknown, variant: 'short' | 'detailed' = 'short') {
  if (isGeolocationErrorLike(error)) {
    return getLocationErrorMessage(error, variant);
  }

  return error instanceof Error ? error.message : '定位失败';
}

function getGeolocationPosition(
  geolocation: Geolocation,
  options: PositionOptions,
  timeoutMs: number,
  signal?: AbortSignal
) {
  if (signal?.aborted) {
    throw createAbortError();
  }

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
      settle(() => reject(new Error('定位超时')));
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

export function MapLocationPicker({
  isOpen,
  onClose,
  onLocationSelect,
  initialLocation
}: MapLocationPickerProps) {
  const MAX_RETRIES = 3;
  const { theme } = useThemeContext();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<AMapMap | null>(null);
  const markerRef = useRef<AMapOverlay | null>(null);
  const userMarkerRef = useRef<AMapOverlay | null>(null);
  const placeSearchRef = useRef<AMapPlaceSearch | null>(null);
  const scheduledTimeoutsRef = useRef<Set<number>>(new Set());
  const geolocationAbortControllerRef = useRef<AbortController | null>(null);
  const retryCountRef = useRef(0);
  const reverseGeocodeRequestIdRef = useRef(0);
  const searchRequestIdRef = useRef(0);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [isLoadingMap, setIsLoadingMap] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<LocationInfo | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([121.4554, 31.0384]); // 默认交大位置
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<AMapPoi[]>([]);
  const [isLocating, setIsLocating] = useState(false);
  const isMobile = useIsMobile();
  const [mapError, setMapError] = useState<string | null>(null);
  const [lastLocationTime, setLastLocationTime] = useState<number>(0);
  const [, setHasInputFocus] = useState(false);
  const [, setRetryCount] = useState(0);
  useBodyScrollLock(isOpen);

  const scheduleMapTimeout = useCallback((callback: () => void, delay: number) => {
    const timeoutId = window.setTimeout(() => {
      scheduledTimeoutsRef.current.delete(timeoutId);
      callback();
    }, delay);

    scheduledTimeoutsRef.current.add(timeoutId);
    return timeoutId;
  }, []);

  const clearScheduledMapTimeouts = useCallback(() => {
    for (const timeoutId of scheduledTimeoutsRef.current) {
      window.clearTimeout(timeoutId);
    }

    scheduledTimeoutsRef.current.clear();
  }, []);

  const abortActiveGeolocation = useCallback(() => {
    geolocationAbortControllerRef.current?.abort();
    geolocationAbortControllerRef.current = null;
  }, []);

  const applyUserLocation = useCallback((location: [number, number], options?: { center?: boolean; zoom?: number }) => {
    setUserLocation(location);

    if (mapRef.current && isMapLoaded) {
      if (options?.center) {
        mapRef.current.setCenter(location);
      }
      if (options?.zoom) {
        mapRef.current.setZoom(options.zoom);
      }
      addUserLocationMarker(location[0], location[1]);
    }
  }, [isMapLoaded]);

  // 全局错误处理
  const handleError = (error: unknown, context: string) => {
    debugError(`🗺️ ${context} 错误:`, error);
    setIsLocating(false);
    setIsLoadingMap(false);
    setMapError(`${context}失败: ${error instanceof Error ? error.message : '未知错误'}`);
  };

  const loadAMapAPI = () => {
    const jsKey = LOCATION_CONFIG.AMAP_JS_KEY;
    const securityCode = LOCATION_CONFIG.AMAP_SECURITY_CODE;

    debugLog('加载高德地图API:', { jsKey, securityCode, retryCount: retryCountRef.current });

    loadAmapScript({
      jsKey,
      securityCode,
      onLoad: () => {
        debugLog('🗺️ 高德地图API加载成功');
        retryCountRef.current = 0;
        setRetryCount(0);
        initMap();
      },
      onError: (error, script) => {
        debugError('🗺️ 高德地图API加载失败:', error);
        setIsLoadingMap(false);

        if (retryCountRef.current < MAX_RETRIES) {
          const nextRetryCount = retryCountRef.current + 1;
          retryCountRef.current = nextRetryCount;
          debugLog(`🗺️ 准备重试加载API，第${nextRetryCount}次重试`);
          setRetryCount(nextRetryCount);
          setMapError(`地图加载失败，正在重试... (${nextRetryCount}/${MAX_RETRIES})`);

          scheduleMapTimeout(() => {
            if (script.parentNode) {
              script.parentNode.removeChild(script);
            }
            loadAMapAPI();
          }, 2000 * nextRetryCount);
          return;
        }

        setMapError('地图加载失败，请检查网络连接后刷新页面');
      },
    });
  };

  const initMap = () => {
    if (!mapContainerRef.current || !window.AMap) {
      debugError('🗺️ 地图容器或AMap API未准备好');
      setMapError('地图初始化失败：容器未准备好');
      setIsLoadingMap(false);
      return;
    }

    try {
      debugLog('🗺️ 开始初始化地图...');
      setMapError(null);

      const map = createMapInstance({
        AMap: window.AMap,
        container: mapContainerRef.current,
        center: mapCenter,
        isMobile,
        themeMode: theme.mode,
      });

      mapRef.current = map;

      // 等待地图完全加载
      map.on('complete', () => {
        debugLog('🗺️ 地图加载完成');
        retryCountRef.current = 0;
        setRetryCount(0);
        setIsMapLoaded(true);
        setIsLoadingMap(false);
        setMapError(null);

        // 如果有初始位置，添加选择标记
        if (initialLocation) {
          try {
            addMarker(initialLocation.lng, initialLocation.lat);
          } catch (error) {
            debugError('🗺️ 添加初始位置标记失败:', error);
          }
        }

        // 如果有用户位置，添加用户位置标记
        if (userLocation) {
          try {
            addUserLocationMarker(userLocation[0], userLocation[1]);
          } catch (error) {
            debugError('🗺️ 添加用户位置标记失败:', error);
          }
        }
      });

      // 地图加载错误处理
      map.on('error', (error) => {
        debugError('🗺️ 地图加载错误:', error);
        setIsLoadingMap(false);

        if (retryCountRef.current < MAX_RETRIES) {
          const nextRetryCount = retryCountRef.current + 1;
          retryCountRef.current = nextRetryCount;
          debugLog(`🗺️ 地图错误，准备重试初始化，第${nextRetryCount}次重试`);
          setRetryCount(nextRetryCount);
          setMapError(`地图初始化失败，正在重试... (${nextRetryCount}/${MAX_RETRIES})`);

          // 延迟重试
          scheduleMapTimeout(() => {
            if (mapRef.current) {
              try {
                mapRef.current.destroy();
                mapRef.current = null;
              } catch (e) {
                debugWarn('🗺️ 清理地图实例失败:', e);
              }
            }
            initMap();
          }, 1000 * nextRetryCount);
        } else {
          setMapError('地图初始化失败，请刷新页面重试');
        }
      });

      // 添加点击事件
      map.on('click', handleMapClick);

      try {
        placeSearchRef.current = createPlaceSearchService(window.AMap, map);
      } catch (error) {
        debugError('🗺️ 搜索服务初始化失败:', error);
      }

      try {
        const geolocation = createGeolocationControl(window.AMap);
        map.addControl(geolocation);
      } catch (error) {
        debugLog('🗺️ 定位控件初始化失败:', error);
      }

    } catch (error) {
      debugError('🗺️ 地图初始化失败:', error);
      setMapError('地图初始化失败');
      setIsLoadingMap(false);
    }
  };

  // 统一的定位函数（移动端和桌面端通用）
  const unifiedLocation = async () => {
    if (!navigator.geolocation) {
      setMapError('浏览器不支持地理定位');
      return;
    }

    // 检查地图是否已加载
    if (!mapRef.current || !isMapLoaded) {
      debugWarn('🗺️ 地图未完全加载，无法定位');
      setMapError('地图未加载完成，请稍后重试');
      return;
    }

    setIsLocating(true);
    setMapError(null);

    debugLog('🗺️ 开始统一定位流程');

    // 创建一个中止控制器，用于处理组件卸载或地图销毁的情况
    const abortController = new AbortController();
    abortActiveGeolocation();
    geolocationAbortControllerRef.current = abortController;

    try {
      const position = await getGeolocationPosition(
        navigator.geolocation,
        {
          timeout: isMobile ? 8000 : 10000,
          enableHighAccuracy: true,
          maximumAge: 30000
        },
        isMobile ? 9000 : 11000,
        abortController.signal
      );

      // 检查是否已被中止
      if (abortController.signal.aborted) {
        debugLog('🗺️ 定位操作已被中止');
        return;
      }

      const { latitude, longitude, accuracy } = position.coords;
      debugLog('🗺️ 定位成功:', { latitude, longitude, accuracy });
      const convertedPosition = convertGeolocationPosition(position);
      const newLocation = convertedPosition.location;

      // 移动端特殊处理：延迟更新地图以避免渲染冲突
      const updateMap = () => {
        // 再次检查地图实例是否存在且有效
        if (mapRef.current && isMapLoaded && !abortController.signal.aborted) {
          try {
            // 验证地图实例是否仍然有效
            if (typeof mapRef.current.setCenter === 'function') {
              applyUserLocation(newLocation, { center: true, zoom: isMobile ? 16 : 17 });
              debugLog('🗺️ 地图更新成功');
            } else {
              debugError('🗺️ 地图实例方法无效');
              setMapError('地图状态异常，请重新打开');
            }
          } catch (mapError) {
            debugError('🗺️ 地图更新失败:', mapError);
            setMapError('地图更新失败，请重试');
          }
        } else {
          debugError('🗺️ 地图实例丢失或已中止');
          if (!abortController.signal.aborted) {
            setMapError('地图实例丢失，请重新打开');
          }
        }

        setIsLocating(false);
        if (geolocationAbortControllerRef.current === abortController) {
          geolocationAbortControllerRef.current = null;
        }
      };

      // 移动端延迟更新，桌面端立即更新
      if (isMobile) {
        scheduleMapTimeout(updateMap, 100);
      } else {
        updateMap();
      }
    } catch (error) {
      if (isAbortError(error)) {
        debugLog('🗺️ 定位操作已被中止');
        return;
      }

      if (isGeolocationErrorLike(error)) {
        debugError('🗺️ 定位失败:', error);
      } else {
        debugError('🗺️ 定位处理失败:', error);
      }
      setIsLocating(false);
      setMapError(getMapLocationErrorMessage(error));
      if (geolocationAbortControllerRef.current === abortController) {
        geolocationAbortControllerRef.current = null;
      }
    }
  };

  useEffect(() => {
    if (isMapLoaded && userLocation && mapRef.current) {
      debugLog('🗺️ 添加用户位置标记:', userLocation);
      addUserLocationMarker(userLocation[0], userLocation[1]);
    }
  }, [isMapLoaded, userLocation]);

  useEffect(() => {
    if (!isOpen) return;

    // 如果有初始位置，使用初始位置
    if (initialLocation) {
      setMapCenter([initialLocation.lng, initialLocation.lat]);
      return;
    }

    // 尝试获取用户当前位置
    if (navigator.geolocation && !isLoadingMap) {
      setIsLoadingMap(true);
      setMapError(null);
      const abortController = new AbortController();
      abortActiveGeolocation();
      geolocationAbortControllerRef.current = abortController;

      void (async () => {
        try {
          const position = await getGeolocationPosition(
            navigator.geolocation,
            {
              timeout: 8000,
              enableHighAccuracy: true,
              maximumAge: 30000
            },
            MAP_AUTO_LOCATION_TIMEOUT_MS,
            abortController.signal
          );

          if (abortController.signal.aborted) {
            return;
          }

          const convertedPosition = convertGeolocationPosition(position);
          const newLocation = convertedPosition.location;
          setMapCenter(newLocation);
          applyUserLocation(newLocation);

          logConvertedLocation('🗺️ GPS定位成功', convertedPosition);

          setIsLoadingMap(false);
        } catch (error) {
          if (isAbortError(error)) {
            return;
          }

          debugLog('🗺️ 无法获取用户位置，使用默认位置:', error instanceof Error ? error.message : error);
          setIsLoadingMap(false);
          setMapError(getMapLocationErrorMessage(error));
          // 保持默认位置
        } finally {
          if (geolocationAbortControllerRef.current === abortController) {
            geolocationAbortControllerRef.current = null;
          }
        }
      })();

      return () => {
        abortController.abort();
      };
    }
  }, [isOpen, initialLocation]);

  useEffect(() => {
    if (!isOpen || isMapLoaded) return;

    retryCountRef.current = 0;
    setRetryCount(0);

    // 检查API配置
    if (!isAmapConfigured() || !isAmapJSConfigured()) {
      debugError('高德地图API密钥未配置或不完整');
      return;
    }

    if (window.AMap) {
      initMap();
    } else {
      setIsLoadingMap(true);
      loadAMapAPI();
    }

    return () => {
      debugLog('🗺️ 清理地图资源');
      reverseGeocodeRequestIdRef.current += 1;
      searchRequestIdRef.current += 1;
      clearScheduledMapTimeouts();
      abortActiveGeolocation();
      cleanupMapRuntime({
        map: mapRef.current,
        marker: markerRef.current,
        userMarker: userMarkerRef.current,
      });
      mapRef.current = null;
      markerRef.current = null;
      userMarkerRef.current = null;
      if (placeSearchRef.current) {
        placeSearchRef.current = null;
      }
    };
  }, [isOpen]);

  const debouncedUpdateMapCenter = useCallback((center: [number, number]) => {
    if (isMapLoaded && mapRef.current) {
      try {
        mapRef.current.setCenter(center);
      } catch (error) {
        debugError('🗺️ 更新地图中心失败:', error);
      }
    }
  }, [isMapLoaded]);

  useEffect(() => {
    if (mapCenter) {
      const timeoutId = setTimeout(() => {
        debouncedUpdateMapCenter(mapCenter);
      }, 100); // 100ms防抖

      return () => clearTimeout(timeoutId);
    }
  }, [mapCenter, debouncedUpdateMapCenter]);

  useEffect(() => {
    if (isMapLoaded && mapRef.current) {
      try {
        const mapStyle = theme.mode === 'dark' ? 'amap://styles/dark' : 'amap://styles/normal';
        mapRef.current.setMapStyle(mapStyle);
      } catch (error) {
        debugError('🗺️ 更新地图主题失败:', error);
      }
    }
  }, [isMapLoaded, theme.mode]);

  const handleMapClick = async (e: AMapMapClickEvent) => {
    const { lng, lat } = e.lnglat;
    const requestId = ++reverseGeocodeRequestIdRef.current;
    debugLog('🗺️ 地图被点击，坐标:', { lng, lat });

    addMarker(lng, lat);

    if (!window.AMap) {
      setMapError('地图服务未准备好');
      return;
    }

    try {
      const locationInfo = await reverseGeocodeLocation(window.AMap, lng, lat);
      if (requestId !== reverseGeocodeRequestIdRef.current) {
        return;
      }

      debugLog('🗺️ 设置选中位置:', locationInfo);
      setSelectedLocation(locationInfo);
    } catch (error) {
      if (requestId !== reverseGeocodeRequestIdRef.current) {
        return;
      }

      debugError('逆地理编码失败:', error);
    }
  };

  const addUserLocationMarker = (lng: number, lat: number) => {
    if (!mapRef.current || !isMapLoaded) {
      debugWarn('🗺️ 地图未加载，无法添加用户位置标记');
      return;
    }

    if (!window.AMap) {
      debugWarn('🗺️ 高德地图API未加载，无法添加用户位置标记');
      return;
    }

    debugLog('🗺️ 正在添加用户位置标记:', { lng, lat });

    userMarkerRef.current = replaceUserLocationMarker({
      AMap: window.AMap,
      map: mapRef.current,
      existingMarker: userMarkerRef.current,
      lng,
      lat,
    });
  };

  const addMarker = (lng: number, lat: number) => {
    if (!mapRef.current || !window.AMap) return;

    debugLog('🗺️ 正在添加选择位置标记:', { lng, lat });

    markerRef.current = replaceSelectionMarker({
      AMap: window.AMap,
      map: mapRef.current,
      existingMarker: markerRef.current,
      lng,
      lat,
    });
  };

  const handleSearch = async () => {
    const normalizedQuery = searchQuery.trim();
    const requestId = ++searchRequestIdRef.current;

    try {
      debugLog('🔍 handleSearch 被调用');

      if (!normalizedQuery) {
        debugLog('🔍 搜索查询为空');
        return;
      }

      if (!placeSearchRef.current) {
        debugError('🔍 搜索服务未初始化');
        setMapError('搜索服务未准备好');
        return;
      }

      if (isMobile) {
        if (blurActiveInput(setHasInputFocus)) {
          debugLog('🔍 移动端搜索：先失焦输入框');
        }
      }

      setIsSearching(true);
      setSearchResults([]);
      setMapError(null);

      debugLog('🔍 开始搜索:', normalizedQuery);
      const pois = await searchPlaces(placeSearchRef.current, normalizedQuery);
      if (requestId !== searchRequestIdRef.current) {
        return;
      }

      setSearchResults(pois);
      debugLog('🔍 搜索成功，结果数量:', pois.length);
    } catch (error) {
      if (requestId !== searchRequestIdRef.current) {
        return;
      }

      debugError('🔍 handleSearch 函数异常:', error);
      setSearchResults([]);
      setMapError(error instanceof Error ? error.message : '搜索功能异常');
    } finally {
      if (requestId === searchRequestIdRef.current) {
        setIsSearching(false);
      }
    }
  };

  const handleSearchQueryChange = (value: string) => {
    searchRequestIdRef.current += 1;
    setIsSearching(false);
    setSearchResults([]);
    setSearchQuery(value);
  };

  const selectSearchResult = (poi: AMapPoi) => {
    try {
      reverseGeocodeRequestIdRef.current += 1;
      searchRequestIdRef.current += 1;
      debugLog('🔍 选择搜索结果:', poi);

      if (!poi || !poi.location) {
        debugError('🔍 无效的POI数据');
        setMapError('选择的位置数据无效');
        return;
      }

      const coordinates = getPoiCoordinates(poi);
      if (!coordinates) {
        debugError('🔍 无效的坐标数据');
        setMapError('位置坐标无效');
        return;
      }

      const [lng, lat] = coordinates;

      if (!mapRef.current) {
        debugError('🔍 地图未初始化');
        setMapError('地图未准备好');
        return;
      }

      try {
        mapRef.current.setCenter([lng, lat]);
        mapRef.current.setZoom(isMobile ? 16 : 17);
        debugLog('🔍 地图移动成功');
      } catch (mapError) {
        debugError('🔍 地图移动失败:', mapError);
        setMapError('地图移动失败');
        return;
      }

      try {
        addMarker(lng, lat);
        debugLog('🔍 标记添加成功');
      } catch (markerError) {
        debugError('🔍 标记添加失败:', markerError);
        // 标记失败不影响位置选择
      }

      const locationInfo = buildPoiLocationInfo(poi);

      setSelectedLocation(locationInfo);
      setSearchResults([]);
      setSearchQuery('');
      setMapError(null);

      debugLog('🔍 位置选择完成:', locationInfo);
    } catch (error) {
      debugError('🔍 selectSearchResult 函数异常:', error);
      setMapError('选择位置失败');
    }
  };

  const locateUser = () => {
    try {
      debugLog('🗺️ locateUser 被调用');

      const now = Date.now();
      if (now - lastLocationTime < 2000) {
        debugLog('🗺️ 定位请求过于频繁，请稍候');
        return;
      }
      setLastLocationTime(now);

      if (isMobile) {
        const activeElement = document.activeElement;
        const activeElementType = activeElement instanceof HTMLInputElement
          || activeElement instanceof HTMLTextAreaElement
          || activeElement instanceof HTMLButtonElement
          ? activeElement.type
          : undefined;
        debugLog('🗺️ 当前焦点元素:', activeElement?.tagName, activeElementType);

        if (blurActiveInput(setHasInputFocus)) {
          debugLog('🗺️ 检测到输入框焦点，先失焦再定位');

          scheduleMapTimeout(() => {
            try {
              debugLog('🗺️ 延迟执行统一定位');
              unifiedLocation();
            } catch (delayError) {
              debugError('🗺️ 延迟定位执行失败:', delayError);
              setIsLocating(false);
              setMapError('定位执行失败');
            }
          }, 500);
          return;
        }
      }

      debugLog('🗺️ 直接执行统一定位');
      unifiedLocation();
    } catch (error) {
      debugError('🗺️ locateUser 函数异常:', error);
      setIsLocating(false);
      setMapError('定位功能异常');
    }
  };

  const handleConfirm = () => {
    if (selectedLocation) {
      onLocationSelect(selectedLocation);
      onClose();
    }
  };

  const handleRetryMapLoad = () => {
    clearScheduledMapTimeouts();
    setMapError(null);
    setIsLoadingMap(true);
    retryCountRef.current = 0;
    setRetryCount(0);

    if (mapRef.current) {
      try {
        mapRef.current.destroy();
        mapRef.current = null;
      } catch (error) {
        debugWarn('🗺️ 清理地图实例失败:', error);
      }
    }

    if (window.AMap) {
      initMap();
    } else {
      loadAMapAPI();
    }
  };

  const handleRefreshPage = () => {
    window.location.reload();
  };

  const triggerLocateUser = (context: string) => {
    try {
      debugLog(`🗺️ ${context}`);
      locateUser();
    } catch (error) {
      handleError(error, context);
    }
  };

  const triggerSearch = (context: string) => {
    try {
      debugLog(`🔍 ${context}`);
      handleSearch();
    } catch (error) {
      handleError(error, context);
    }
  };

  const handleSearchResultClick = (poi: AMapPoi) => {
    try {
      debugLog('🔍 搜索结果被点击:', poi.name);
      selectSearchResult(poi);
    } catch (error) {
      handleError(error, '搜索结果点击');
    }
  };

  const handleSearchFocus = () => {
    debugLog('🗺️ 搜索框获得焦点');
    setHasInputFocus(true);
  };

  const handleSearchBlur = () => {
    debugLog('🗺️ 搜索框失去焦点');
    scheduleMapTimeout(() => setHasInputFocus(false), 100);
  };

  const mapHeaderActions = (
    <button
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        triggerLocateUser('定位按钮被点击');
      }}
      disabled={isLocating || !isMapLoaded}
      className={`flex items-center gap-1 rounded-md font-medium transition-colors hover:opacity-80 disabled:opacity-50 ${
        isMobile ? 'px-2 py-1.5 text-xs' : 'px-3 py-1.5 text-sm'
      }`}
      style={{
        backgroundColor: userLocation ? theme.colors.primary : `${theme.colors.primary}20`,
        color: userLocation ? 'white' : theme.colors.primary,
        border: `1px solid ${theme.colors.primary}`,
      }}
      title={userLocation ? '定位到我的位置' : '获取我的位置'}
    >
      {isLocating ? <Loader className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
      <span className={isMobile ? 'hidden' : 'hidden sm:inline'}>
        {isLocating ? '定位中...' : userLocation ? '我的位置' : '获取位置'}
      </span>
    </button>
  );

  const debugActions = import.meta.env.DEV ? (
    <div className="flex gap-1">
      {userLocation && (
        <button
          onClick={() => addUserLocationMarker(userLocation[0], userLocation[1])}
          className="rounded-md px-2 py-2 text-xs font-medium transition-colors"
          style={{
            backgroundColor: '#e6f7ff',
            color: '#1890ff',
          }}
          title="重新添加用户位置标记（调试用）"
        >
          🔵
        </button>
      )}
      <button
        onClick={() => {
          const center = mapRef.current?.getCenter();
          if (center) {
            addMarker(center.lng, center.lat);
          }
        }}
        className="rounded-md px-2 py-2 text-xs font-medium transition-colors"
        style={{
          backgroundColor: '#fff2f0',
          color: '#ff4d4f',
        }}
        title="在地图中心添加选择标记（调试用）"
      >
        🔴
      </button>
      <button
        onClick={() => {
          if (mapRef.current && window.AMap) {
            const center = mapRef.current.getCenter();
            const testMarker = new window.AMap.Marker({
              position: [center.lng, center.lat],
              title: '测试标记 - 无偏移',
            });
            mapRef.current.add(testMarker);
          }
        }}
        className="rounded-md px-2 py-2 text-xs font-medium transition-colors"
        style={{
          backgroundColor: '#f6ffed',
          color: '#52c41a',
        }}
        title="添加默认标记测试（调试用）"
      >
        ✅
      </button>
    </div>
  ) : null;

  if (!isOpen) return null;

  // 检查API配置
  if (!isAmapConfigured() || !isAmapJSConfigured()) {
    return <MapPickerConfigNotice isOpen={isOpen} onClose={onClose} />;
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      zIndex={50}
      padding={isMobile ? '8px' : '16px'}
      backdropStyle={{
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        overflow: 'hidden',
      }}
      panelClassName={`w-full flex flex-col rounded-lg bg-white shadow-xl ${
        isMobile ? 'h-[98vh] max-w-full mx-0' : 'max-w-4xl h-[80vh]'
      }`}
      panelStyle={{ backgroundColor: theme.colors.background }}
    >
      <ModalHeader title="📍 选择位置" onClose={onClose} padded={isMobile ? 'sm' : 'md'} actions={mapHeaderActions} />

      <MapPickerSearchPanel
        isMobile={isMobile}
        searchQuery={searchQuery}
        isMapLoaded={isMapLoaded}
        isSearching={isSearching}
        searchResults={searchResults}
        onSearchQueryChange={handleSearchQueryChange}
        onSearch={() => triggerSearch('搜索按钮被点击')}
        onSearchFocus={handleSearchFocus}
        onSearchBlur={handleSearchBlur}
        onSelectSearchResult={handleSearchResultClick}
        debugActions={debugActions}
      />

      <div className="flex-1 relative">
        <div
          ref={mapContainerRef}
          className="w-full h-full"
          style={{
            minHeight: isMobile ? '60vh' : '400px',
            height: isMobile ? '100%' : 'auto',
          }}
        />

        <MapPickerStatusOverlay
          isLoadingMap={isLoadingMap}
          isMapLoaded={isMapLoaded}
          mapError={mapError}
          isMobile={isMobile}
          onRetry={handleRetryMapLoad}
          onRefresh={handleRefreshPage}
        />

        {isMapLoaded && (
          <button
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              triggerLocateUser('浮动定位按钮被点击');
            }}
            disabled={isLocating}
            className="absolute top-4 right-4 z-20 rounded-full p-3 shadow-lg transition-all duration-200 hover:scale-110 disabled:opacity-50"
            style={{
              backgroundColor: userLocation ? theme.colors.primary : 'white',
              color: userLocation ? 'white' : theme.colors.primary,
              border: `2px solid ${theme.colors.primary}`,
            }}
            title={userLocation ? '定位到我的位置' : '获取我的位置'}
          >
            {isLocating ? <Loader className="h-5 w-5 animate-spin" /> : <Navigation className="h-5 w-5" />}
          </button>
        )}

        <MapPickerLegend isVisible={isMapLoaded} hasUserLocation={Boolean(userLocation)} />
      </div>

      <MapPickerSelectedLocation
        location={selectedLocation}
        onCancel={() => {
          debugLog('🗺️ 点击取消按钮');
          onClose();
        }}
        onConfirm={() => {
          debugLog('🗺️ 点击确认选择按钮，位置:', selectedLocation);
          handleConfirm();
        }}
      />

      <div className="p-2 text-center text-xs opacity-60" style={{ color: theme.colors.textSecondary }}>
        点击地图选择位置
      </div>
    </ModalShell>
  );
}
