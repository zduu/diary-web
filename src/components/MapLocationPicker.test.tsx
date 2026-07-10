import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from './ThemeProvider';
import { MapLocationPicker } from './MapLocationPicker';
import { createMapInstance, loadAmapScript } from './map/mapPickerRuntime';
import { reverseGeocodeLocation } from './map/mapLocationData';
import type { AMapMapClickEvent } from './map/amapTypes';

vi.mock('../config/location', () => ({
  LOCATION_CONFIG: {
    AMAP_JS_KEY: 'test-js-key',
    AMAP_SECURITY_CODE: 'test-security-code',
  },
  isAmapConfigured: () => true,
  isAmapJSConfigured: () => true,
}));

vi.mock('./ModalHeader', () => ({
  ModalHeader: ({ title }: { title: string }) => <header>{title}</header>,
}));

vi.mock('./ModalShell', () => ({
  ModalShell: ({ children, isOpen }: { children: ReactNode; isOpen: boolean }) => (
    isOpen ? <div role="dialog">{children}</div> : null
  ),
}));

vi.mock('./map/MapPickerSearchPanel', () => ({
  MapPickerSearchPanel: ({ onSearchBlur }: { onSearchBlur: () => void }) => (
    <button type="button" onClick={onSearchBlur}>blur search</button>
  ),
}));

vi.mock('./map/MapPickerLegend', () => ({
  MapPickerLegend: () => null,
}));

vi.mock('./map/MapPickerSelectedLocation', () => ({
  MapPickerSelectedLocation: ({ location }: { location?: { name?: string } | null }) => (
    <div data-testid="selected-location">{location?.name ?? ''}</div>
  ),
}));

vi.mock('./map/MapPickerStatusOverlay', () => ({
  MapPickerStatusOverlay: () => null,
}));

vi.mock('./map/mapPickerRuntime', () => ({
  cleanupMapRuntime: vi.fn(),
  createGeolocationControl: vi.fn(() => ({})),
  createMapInstance: vi.fn(() => ({
    add: vi.fn(),
    addControl: vi.fn(),
    destroy: vi.fn(),
    getCenter: vi.fn(() => ({ lng: 121.4554, lat: 31.0384 })),
    on: vi.fn((eventName: string, callback: () => void) => {
      if (eventName === 'complete') {
        queueMicrotask(callback);
      }
    }),
    setCenter: vi.fn(),
    setMapStyle: vi.fn(),
    setZoom: vi.fn(),
  })),
  createPlaceSearchService: vi.fn(() => ({})),
  loadAmapScript: vi.fn(),
}));

vi.mock('./map/mapLocationData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./map/mapLocationData')>();
  return {
    ...actual,
    reverseGeocodeLocation: vi.fn(actual.reverseGeocodeLocation),
  };
});

vi.mock('./map/mapMarkers', () => ({
  replaceSelectionMarker: vi.fn(),
  replaceUserLocationMarker: vi.fn(),
}));

function mockGeolocation(getCurrentPosition: Geolocation['getCurrentPosition']) {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition,
    },
  });
}

function renderPicker(props: Partial<Parameters<typeof MapLocationPicker>[0]> = {}) {
  return render(
    <ThemeProvider>
      <MapLocationPicker
        isOpen
        onClose={vi.fn()}
        onLocationSelect={vi.fn()}
        {...props}
      />
    </ThemeProvider>
  );
}

describe('MapLocationPicker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(loadAmapScript).mockReset();
    vi.mocked(reverseGeocodeLocation).mockReset();
    vi.stubGlobal('AMap', {});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'geolocation');
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('clears scheduled search blur timers when unmounted', () => {
    const { unmount } = renderPicker();
    const timerCountBeforeBlur = vi.getTimerCount();

    fireEvent.click(screen.getByRole('button', { name: 'blur search' }));

    expect(vi.getTimerCount()).toBeGreaterThan(timerCountBeforeBlur);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('times out initial geolocation when the browser never settles', async () => {
    const getCurrentPosition = vi.fn<Geolocation['getCurrentPosition']>();
    mockGeolocation(getCurrentPosition);
    Reflect.deleteProperty(window, 'AMap');

    renderPicker();

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(screen.queryByText('正在获取位置...')).not.toBeInTheDocument();
  });

  it('times out manual map geolocation when the browser never settles', async () => {
    const getCurrentPosition = vi.fn<Geolocation['getCurrentPosition']>();
    mockGeolocation(getCurrentPosition);

    renderPicker({
      initialLocation: {
        lat: 31.0384,
        lng: 121.4554,
      },
    });

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getAllByTitle('获取我的位置')[0]!);

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });

    expect(screen.getAllByTitle('获取我的位置')[0]).not.toBeDisabled();
  });

  it('stops retrying the map script after the configured retry limit', async () => {
    Reflect.deleteProperty(window, 'AMap');
    vi.mocked(loadAmapScript).mockImplementation(({ onError }) => {
      const script = document.createElement('script');
      document.head.appendChild(script);
      onError(new Error('load failed'), script);
      return script;
    });

    renderPicker({
      initialLocation: {
        lat: 31.0384,
        lng: 121.4554,
      },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(loadAmapScript).toHaveBeenCalledTimes(4);
  });

  it('keeps the newest map click when reverse geocoding resolves out of order', async () => {
    let mapClickHandler: ((event: AMapMapClickEvent) => void) | undefined;
    vi.mocked(createMapInstance).mockReturnValueOnce({
      add: vi.fn(),
      addControl: vi.fn(),
      destroy: vi.fn(),
      getCenter: vi.fn(() => ({ lng: 121.4554, lat: 31.0384 })),
      on: vi.fn((eventName: string, callback: ((event: AMapMapClickEvent) => void) | (() => void)) => {
        if (eventName === 'complete') {
          queueMicrotask(callback as () => void);
        }
        if (eventName === 'click') {
          mapClickHandler = callback as (event: AMapMapClickEvent) => void;
        }
      }),
      remove: vi.fn(),
      setCenter: vi.fn(),
      setMapStyle: vi.fn(),
      setZoom: vi.fn(),
    });

    let resolveFirst!: (value: Awaited<ReturnType<typeof reverseGeocodeLocation>>) => void;
    let resolveSecond!: (value: Awaited<ReturnType<typeof reverseGeocodeLocation>>) => void;
    vi.mocked(reverseGeocodeLocation)
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirst = resolve;
      }))
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveSecond = resolve;
      }));

    renderPicker({
      initialLocation: {
        lat: 31.0384,
        lng: 121.4554,
      },
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mapClickHandler).toBeDefined();
    act(() => {
      mapClickHandler?.({ lnglat: { lng: 121.4, lat: 31.1 } });
      mapClickHandler?.({ lnglat: { lng: 121.5, lat: 31.2 } });
    });

    await act(async () => {
      resolveSecond({ name: '第二次点击', latitude: 31.2, longitude: 121.5 });
      await Promise.resolve();
    });
    expect(screen.getByTestId('selected-location')).toHaveTextContent('第二次点击');

    await act(async () => {
      resolveFirst({ name: '第一次点击', latitude: 31.1, longitude: 121.4 });
      await Promise.resolve();
    });
    expect(screen.getByTestId('selected-location')).toHaveTextContent('第二次点击');
  });
});
