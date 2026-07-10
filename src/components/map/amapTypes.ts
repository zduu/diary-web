export interface AMapPoiLocation {
  lng: number;
  lat: number;
}

export type AMapCoordinate = [number, number];

export interface AMapOverlay {
  readonly __amapOverlayBrand?: unknown;
}

export interface AMapMapLike {
  add(overlay: AMapOverlay): void;
  remove(overlay: AMapOverlay): void;
}

export interface AMapMapCenter {
  lng: number;
  lat: number;
}

export interface AMapMapClickEvent {
  lnglat: AMapMapCenter;
}

export interface AMapGeolocationControl {
  readonly __amapGeolocationBrand?: unknown;
}

export type AMapMapEventName = 'complete' | 'error' | 'click';

export interface AMapMap extends AMapMapLike {
  addControl(control: AMapGeolocationControl): void;
  destroy(): void;
  getCenter(): AMapMapCenter;
  on(eventName: 'complete', callback: () => void): void;
  on(eventName: 'error', callback: (error: unknown) => void): void;
  on(eventName: 'click', callback: (event: AMapMapClickEvent) => void): void;
  setCenter(center: AMapCoordinate): void;
  setMapStyle(style: string): void;
  setZoom(zoom: number): void;
}

export interface AMapSize {
  readonly __amapSizeBrand?: unknown;
}

export interface AMapPixel {
  readonly __amapPixelBrand?: unknown;
}

export interface AMapIcon {
  readonly __amapIconBrand?: unknown;
}

export interface AMapMarkerOptions {
  position: AMapCoordinate;
  icon?: AMapIcon;
  title?: string;
  zIndex?: number;
  offset?: AMapPixel;
}

export interface AMapCircleOptions {
  center: AMapCoordinate;
  radius: number;
  strokeColor: string;
  strokeWeight: number;
  fillColor: string;
  fillOpacity: number;
  zIndex: number;
}

export interface AMapIconOptions {
  size: AMapSize;
  image: string;
  imageOffset: AMapPixel;
}

export interface AMapMarkerSdk {
  Marker: new (options: AMapMarkerOptions) => AMapOverlay;
  Circle: new (options: AMapCircleOptions) => AMapOverlay;
  Icon: new (options: AMapIconOptions) => AMapIcon;
  Size: new (width: number, height: number) => AMapSize;
  Pixel: new (x: number, y: number) => AMapPixel;
}

export interface AMapMapOptions {
  zoom: number;
  center: AMapCoordinate;
  mapStyle: string;
  resizeEnable: boolean;
  rotateEnable: boolean;
  pitchEnable: boolean;
  zoomEnable: boolean;
  dragEnable: boolean;
  touchZoom: boolean;
  doubleClickZoom: boolean;
  scrollWheel: boolean;
  keyboardEnable: boolean;
}

export interface AMapMapSdk {
  Map: new (container: HTMLDivElement, options: AMapMapOptions) => AMapMap;
}

export interface AMapGeolocationOptions {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
  convert: boolean;
  showButton: boolean;
  showMarker: boolean;
  showCircle: boolean;
  panToLocation: boolean;
  zoomToAccuracy: boolean;
}

export interface AMapGeolocationSdk {
  Geolocation: new (options: AMapGeolocationOptions) => AMapGeolocationControl;
}

export interface AMapPoi {
  name?: string;
  address?: string;
  cityname?: string;
  adname?: string;
  location?: Partial<AMapPoiLocation> | null;
}

export interface AMapPlaceSearchResult {
  poiList?: {
    pois?: AMapPoi[];
  };
}

export interface AMapPlaceSearch {
  search(
    query: string,
    callback: (status: string, result?: AMapPlaceSearchResult) => void
  ): void;
}

export interface AMapAddressComponent {
  building?: {
    name?: string;
  };
  neighborhood?: {
    name?: string;
  };
  streetNumber?: {
    street?: string;
    number?: string;
  };
  township?: {
    name?: string;
  };
  district?: string;
  city?: string;
  province?: string;
}

export interface AMapRegeocode {
  addressComponent?: AMapAddressComponent;
  formattedAddress?: string;
}

export interface AMapGeocodeResult {
  regeocode?: AMapRegeocode;
}

export interface AMapGeocoder {
  getAddress(
    location: [number, number],
    callback: (status: string, result?: AMapGeocodeResult) => void
  ): void;
}

export interface AMapSdk {
  Geocoder: new (options: { radius: number; extensions: string }) => AMapGeocoder;
}

export interface AMapRuntimeSdk extends AMapSdk, AMapGeolocationSdk, AMapMapSdk, AMapMarkerSdk, AMapPlaceSearchSdk {}

export interface AMapPlaceSearchSdk {
  PlaceSearch: new (options: {
    pageSize: number;
    pageIndex: number;
    city: string;
    map: unknown;
    panel: boolean;
  }) => AMapPlaceSearch;
}
