import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncSystemBarsWithTheme } from './systemBars.ts';
import { isNativeAppRuntime } from './nativePlatform.ts';

const setStyleMock = vi.fn<(options: { style: string }) => Promise<void>>();
const isPluginAvailableMock = vi.fn((_name: string) => true);

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isPluginAvailable: (name: string) => isPluginAvailableMock(name),
  },
  // systemBars.ts 在模块顶层调用 registerPlugin，此时测试文件的 const 尚未初始化，
  // 因此这里返回按调用时解引用的包装函数，避免 TDZ
  registerPlugin: () => ({
    setStyle: (options: { style: string }) => setStyleMock(options),
  }),
}));

vi.mock('./nativePlatform.ts', () => ({
  isNativeAppRuntime: vi.fn(() => false),
}));

const isNativeAppRuntimeMock = vi.mocked(isNativeAppRuntime);

describe('syncSystemBarsWithTheme', () => {
  beforeEach(() => {
    setStyleMock.mockReset();
    setStyleMock.mockResolvedValue(undefined);
    isPluginAvailableMock.mockClear();
    isPluginAvailableMock.mockReturnValue(true);
    isNativeAppRuntimeMock.mockReturnValue(false);
  });

  it('does nothing outside the native runtime', () => {
    syncSystemBarsWithTheme(true);

    expect(setStyleMock).not.toHaveBeenCalled();
  });

  it('does nothing when the SystemBars plugin is unavailable', () => {
    isNativeAppRuntimeMock.mockReturnValue(true);
    isPluginAvailableMock.mockReturnValue(false);

    syncSystemBarsWithTheme(true);

    expect(setStyleMock).not.toHaveBeenCalled();
  });

  it('maps dark theme to DARK bar style in the native runtime', () => {
    isNativeAppRuntimeMock.mockReturnValue(true);

    syncSystemBarsWithTheme(true);

    expect(setStyleMock).toHaveBeenCalledWith({ style: 'DARK' });
  });

  it('maps light themes to LIGHT bar style and survives plugin rejections', async () => {
    isNativeAppRuntimeMock.mockReturnValue(true);
    setStyleMock.mockRejectedValue(new Error('bridge unavailable'));

    syncSystemBarsWithTheme(false);

    expect(setStyleMock).toHaveBeenCalledWith({ style: 'LIGHT' });
    await Promise.resolve();
  });
});
