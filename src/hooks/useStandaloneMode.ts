import { useEffect, useState } from 'react';
import { addMediaQueryChangeListener } from '../utils/mediaQueryListeners.ts';
import { isNativeAppRuntime } from '../utils/nativePlatform.ts';

function readNavigatorStandalone() {
  return typeof navigator !== 'undefined' && 'standalone' in navigator
    ? Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
    : false;
}

function detectStandaloneMode() {
  if (typeof window === 'undefined') {
    return false;
  }

  return (
    isNativeAppRuntime() ||
    readDisplayModeMatches('(display-mode: standalone)') ||
    readDisplayModeMatches('(display-mode: fullscreen)') ||
    readNavigatorStandalone()
  );
}

function readDisplayModeMatches(query: string) {
  return typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}

export function useStandaloneMode() {
  const [isStandalone, setIsStandalone] = useState(() => detectStandaloneMode());

  useEffect(() => {
    const mediaQueries =
      typeof window.matchMedia === 'function'
        ? ['(display-mode: standalone)', '(display-mode: fullscreen)'].map((query) => window.matchMedia(query))
        : [];

    const updateStandaloneState = () => {
      setIsStandalone(
        isNativeAppRuntime() ||
        mediaQueries.some((query) => query.matches) ||
        readNavigatorStandalone()
      );
    };

    updateStandaloneState();

    const cleanupMediaQueryListeners = mediaQueries.map((query) =>
      addMediaQueryChangeListener(query, updateStandaloneState)
    );

    window.addEventListener('pageshow', updateStandaloneState);

    return () => {
      cleanupMediaQueryListeners.forEach((cleanup) => cleanup());
      window.removeEventListener('pageshow', updateStandaloneState);
    };
  }, []);

  return isStandalone;
}
