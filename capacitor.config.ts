import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'de.edxx.diary',
  appName: '我的日记',
  webDir: 'dist',
  bundledWebRuntime: false,
  // 默认纸页主题背景，避免原生壳在首屏加载或过度滚动时闪白
  backgroundColor: '#f3eee2',
  android: {
    allowMixedContent: false,
    backgroundColor: '#f3eee2',
  },
  plugins: {
    // 首屏（React 挂载前）状态栏/手势条先按纸页浅色背景显示深色图标，
    // 之后由前端 syncSystemBarsWithTheme 跟随实际主题切换
    SystemBars: {
      style: 'LIGHT',
    },
  },
};

export default config;
