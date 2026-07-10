import { Capacitor, registerPlugin } from '@capacitor/core';
import { debugWarn } from './logger.ts';
import { isNativeAppRuntime } from './nativePlatform.ts';

interface SystemBarsPlugin {
  setStyle(options: { style: 'LIGHT' | 'DARK' | 'DEFAULT' }): Promise<void>;
}

// registerPlugin 只创建方法代理，不触发原生桥调用，Web 端顶层注册同样安全
const SystemBars = registerPlugin<SystemBarsPlugin>('SystemBars');

/**
 * 原生壳内让状态栏/手势条图标跟随应用主题：
 * style 描述的是系统栏所处的背景（DARK 背景 → 浅色图标）。
 */
export function syncSystemBarsWithTheme(isDarkBackground: boolean): void {
  if (!isNativeAppRuntime() || !Capacitor.isPluginAvailable('SystemBars')) {
    return;
  }

  SystemBars.setStyle({ style: isDarkBackground ? 'DARK' : 'LIGHT' }).catch((error) =>
    debugWarn('同步系统栏样式失败:', error)
  );
}
