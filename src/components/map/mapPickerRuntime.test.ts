import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadAmapScript } from './mapPickerRuntime';

describe('mapPickerRuntime', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.head.querySelectorAll('script[src^="https://webapi.amap.com/maps"]').forEach((script) => script.remove());
    delete (window as Window & { _AMapSecurityConfig?: unknown })._AMapSecurityConfig;
    vi.restoreAllMocks();
  });

  it('loads the AMap script and clears its timeout after load', () => {
    vi.useFakeTimers();
    const onLoad = vi.fn();
    const onError = vi.fn();

    const script = loadAmapScript({
      jsKey: 'test-key',
      securityCode: 'test-security',
      onLoad,
      onError,
      timeoutMs: 1000,
    });

    expect(script.src).toContain('key=test-key');
    expect(script.async).toBe(true);
    expect((window as Window & { _AMapSecurityConfig?: { securityJsCode?: string } })._AMapSecurityConfig?.securityJsCode).toBe('test-security');
    expect(vi.getTimerCount()).toBe(1);

    script.dispatchEvent(new Event('load'));

    expect(onLoad).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);

    vi.advanceTimersByTime(1000);
    expect(onLoad).toHaveBeenCalledOnce();
  });

  it('reports script load errors once and clears its timeout', () => {
    vi.useFakeTimers();
    const onLoad = vi.fn();
    const onError = vi.fn();

    const script = loadAmapScript({
      jsKey: 'test-key',
      onLoad,
      onError,
      timeoutMs: 1000,
    });

    script.dispatchEvent(new Event('error'));

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[1]).toBe(script);
    expect(onLoad).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);

    script.dispatchEvent(new Event('load'));
    vi.advanceTimersByTime(1000);
    expect(onError).toHaveBeenCalledOnce();
    expect(onLoad).not.toHaveBeenCalled();
  });

  it('reports script load timeouts once', () => {
    vi.useFakeTimers();
    const onLoad = vi.fn();
    const onError = vi.fn();

    const script = loadAmapScript({
      jsKey: 'test-key',
      onLoad,
      onError,
      timeoutMs: 1000,
    });

    vi.advanceTimersByTime(1000);

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect((onError.mock.calls[0]?.[0] as Error).message).toBe('地图脚本加载超时');
    expect(onError.mock.calls[0]?.[1]).toBe(script);
    expect(onLoad).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);

    script.dispatchEvent(new Event('load'));
    expect(onError).toHaveBeenCalledOnce();
    expect(onLoad).not.toHaveBeenCalled();
  });
});
