import { Capacitor } from '@capacitor/core';

export function isNativeAppRuntime(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return Capacitor.isNativePlatform() || window.location.protocol === 'capacitor:';
}
