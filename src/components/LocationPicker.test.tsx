import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocationPicker } from './LocationPicker';
import { renderWithTheme } from '../test/renderWithTheme';
import { getHighAccuracyLocation } from '../utils/coordinateUtils';

vi.mock('../utils/coordinateUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/coordinateUtils')>();

  return {
    ...actual,
    getHighAccuracyLocation: vi.fn(actual.getHighAccuracyLocation),
  };
});

function mockGeolocation(getCurrentPosition: Geolocation['getCurrentPosition']) {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition,
    },
  });
}

describe('LocationPicker', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    Reflect.deleteProperty(navigator, 'geolocation');
    vi.restoreAllMocks();
  });

  it('adds a manual location and clears it afterwards', async () => {
    const user = userEvent.setup();
    const onLocationChange = vi.fn();

    renderWithTheme(
      <LocationPicker location={null} onLocationChange={onLocationChange} />
    );

    await user.click(screen.getByRole('button', { name: /手动输入/ }));
    await user.type(screen.getByPlaceholderText('输入位置名称，如：咖啡厅、家里、公司...'), '静安寺咖啡馆');
    await user.click(screen.getByRole('button', { name: '添加' }));

    expect(onLocationChange).toHaveBeenCalledWith({
      name: '静安寺咖啡馆',
      address: '静安寺咖啡馆',
    });

    cleanup();
    renderWithTheme(
      <LocationPicker
        location={{ name: '静安寺咖啡馆', address: '静安寺咖啡馆' }}
        onLocationChange={onLocationChange}
      />
    );

    await user.click(screen.getByTitle('清除位置'));
    expect(onLocationChange).toHaveBeenLastCalledWith(null);
  });

  it('shows zero-valued coordinates when they are valid', () => {
    renderWithTheme(
      <LocationPicker
        location={{
          name: '赤道本初子午线',
          latitude: 0,
          longitude: 0,
        }}
        onLocationChange={vi.fn()}
      />
    );

    expect(screen.getByText('0.000000, 0.000000')).toBeInTheDocument();
  });

  it('does not render invalid coordinates', () => {
    renderWithTheme(
      <LocationPicker
        location={{
          name: '坐标损坏',
          latitude: Number.NaN,
          longitude: Number.POSITIVE_INFINITY,
        }}
        onLocationChange={vi.fn()}
      />
    );

    expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument();
  });

  it('does not render out-of-range coordinates', () => {
    renderWithTheme(
      <LocationPicker
        location={{
          name: '坐标越界',
          latitude: 91,
          longitude: 121.4,
        }}
        onLocationChange={vi.fn()}
      />
    );

    expect(screen.queryByText('91.000000, 121.400000')).not.toBeInTheDocument();
  });

  it('does not render invalid high accuracy metadata numbers', () => {
    const { container } = renderWithTheme(
      <LocationPicker
        location={{
          name: '旧定位数据',
          highAccuracy: {
            accuracy: Number.NaN,
            confidence: 'low',
            attempts: -1,
            coordinateOffset: {
              latitude: 31.2,
              longitude: 121.4,
              distance: Number.POSITIVE_INFINITY,
            },
          },
        }}
        onLocationChange={vi.fn()}
      />
    );

    expect(container.textContent).toContain('高精度定位信息');
    expect(container.textContent).toContain('精度: 未知');
    expect(container.textContent).toContain('定位次数: 未知');
    expect(container.textContent).toContain('坐标偏移: 未知');
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
  });

  it('times out quick location when browser geolocation never settles', async () => {
    vi.useFakeTimers();

    const onLocationChange = vi.fn();
    const getCurrentPosition = vi.fn<Geolocation['getCurrentPosition']>();
    mockGeolocation(getCurrentPosition);

    renderWithTheme(
      <LocationPicker location={null} onLocationChange={onLocationChange} />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '快速定位' }));
    });

    expect(screen.getByRole('button', { name: '获取中...' })).toBeDisabled();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000);
    });

    expect(screen.getByText('获取位置超时')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '快速定位' })).not.toBeDisabled();
    expect(onLocationChange).not.toHaveBeenCalled();
  });

  it('shows specific browser geolocation errors even without a global error constructor', async () => {
    const getCurrentPosition = vi.fn<Geolocation['getCurrentPosition']>((_success, error) => {
      error?.({
        code: 1,
        message: 'permission denied',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      });
    });
    mockGeolocation(getCurrentPosition);

    renderWithTheme(
      <LocationPicker location={null} onLocationChange={vi.fn()} />
    );

    fireEvent.click(screen.getByRole('button', { name: '快速定位' }));

    expect(await screen.findByText('位置访问被拒绝，请在浏览器设置中允许位置访问')).toBeInTheDocument();
  });

  it('aborts high accuracy location when unmounted', async () => {
    const user = userEvent.setup();
    let observedSignal: AbortSignal | undefined;

    vi.mocked(getHighAccuracyLocation).mockImplementation((options) => {
      observedSignal = options?.signal;

      return new Promise((_resolve, reject) => {
        observedSignal?.addEventListener('abort', () => {
          reject(new DOMException('定位已取消', 'AbortError'));
        }, { once: true });
      });
    });

    const { unmount } = renderWithTheme(
      <LocationPicker location={null} onLocationChange={vi.fn()} />
    );

    await user.click(screen.getByRole('button', { name: /高精度定位/ }));

    expect(observedSignal).toBeInstanceOf(AbortSignal);
    expect(observedSignal?.aborted).toBe(false);

    unmount();

    expect(observedSignal?.aborted).toBe(true);
  });

  it('does not save high accuracy locations with out-of-range coordinates', async () => {
    const user = userEvent.setup();
    const onLocationChange = vi.fn();

    vi.mocked(getHighAccuracyLocation).mockResolvedValue({
      latitude: 91,
      longitude: 121.4,
      accuracy: 20,
      confidence: 'low',
      attempts: 1,
      timestamp: 1_700_000_000_000,
      method: 'gps',
      originalSystem: 'WGS84',
      targetSystem: 'GCJ02',
    });

    renderWithTheme(
      <LocationPicker location={null} onLocationChange={onLocationChange} />
    );

    await user.click(screen.getByRole('button', { name: /高精度定位/ }));

    expect(await screen.findByText('高精度定位返回的坐标无效，请重试')).toBeInTheDocument();
    expect(onLocationChange).not.toHaveBeenCalled();
  });
});
