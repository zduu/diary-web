import type { ThemeMode } from '../../hooks/useTheme';
import type {
  AMapGeolocationControl,
  AMapMap,
  AMapOverlay,
  AMapPlaceSearch,
  AMapRuntimeSdk,
} from './amapTypes';

interface LoadAmapScriptOptions {
  jsKey: string;
  securityCode?: string;
  onLoad: () => void;
  onError: (error: unknown, script: HTMLScriptElement) => void;
  timeoutMs?: number;
}

interface CreateMapInstanceOptions {
  AMap: AMapRuntimeSdk;
  container: HTMLDivElement;
  center: [number, number];
  isMobile: boolean;
  themeMode: ThemeMode;
}

interface CleanupMapRuntimeOptions {
  map: AMapMap | null;
  marker: AMapOverlay | null;
  userMarker: AMapOverlay | null;
}

export function loadAmapScript({
  jsKey,
  securityCode,
  onLoad,
  onError,
  timeoutMs = 15_000,
}: LoadAmapScriptOptions): HTMLScriptElement {
  (window as Window & { _AMapSecurityConfig?: { securityJsCode?: string } })._AMapSecurityConfig = {
    securityJsCode: securityCode,
  };

  const script = document.createElement('script');
  let settled = false;

  const cleanup = () => {
    window.clearTimeout(timeoutId);
    script.onload = null;
    script.onerror = null;
  };

  const settle = (callback: () => void) => {
    if (settled) {
      return;
    }

    settled = true;
    cleanup();
    callback();
  };

  const timeoutId = window.setTimeout(() => {
    settle(() => onError(new Error('地图脚本加载超时'), script));
  }, timeoutMs);

  script.src = `https://webapi.amap.com/maps?v=2.0&key=${jsKey}&plugin=AMap.PlaceSearch,AMap.Geocoder,AMap.AutoComplete`;
  script.async = true;
  script.onload = () => settle(onLoad);
  script.onerror = (error) => settle(() => onError(error, script));
  document.head.appendChild(script);
  return script;
}

export function createMapInstance({
  AMap,
  container,
  center,
  isMobile,
  themeMode,
}: CreateMapInstanceOptions): AMapMap {
  return new AMap.Map(container, {
    zoom: isMobile ? 15 : 16,
    center,
    mapStyle: themeMode === 'dark' ? 'amap://styles/dark' : 'amap://styles/normal',
    resizeEnable: true,
    rotateEnable: false,
    pitchEnable: false,
    zoomEnable: true,
    dragEnable: true,
    touchZoom: isMobile,
    doubleClickZoom: !isMobile,
    scrollWheel: !isMobile,
    keyboardEnable: !isMobile,
  });
}

export function createPlaceSearchService(AMap: AMapRuntimeSdk, map: AMapMap): AMapPlaceSearch {
  return new AMap.PlaceSearch({
    pageSize: 10,
    pageIndex: 1,
    city: '全国',
    map,
    panel: false,
  });
}

export function createGeolocationControl(AMap: AMapRuntimeSdk): AMapGeolocationControl {
  return new AMap.Geolocation({
    enableHighAccuracy: true,
    timeout: 8000,
    maximumAge: 30000,
    convert: true,
    showButton: false,
    showMarker: false,
    showCircle: false,
    panToLocation: false,
    zoomToAccuracy: false,
  });
}

export function cleanupMapRuntime({
  map,
  marker,
  userMarker,
}: CleanupMapRuntimeOptions) {
  if (!map) {
    return;
  }

  if (marker) {
    map.remove(marker);
  }

  if (userMarker) {
    map.remove(userMarker);
  }

  map.destroy();
}
