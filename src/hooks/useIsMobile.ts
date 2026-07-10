import { useEffect, useState } from 'react';
import { addMediaQueryChangeListener } from '../utils/mediaQueryListeners.ts';

export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return window.matchMedia(`(max-width: ${breakpoint - 1}px)`).matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const checkMobile = (event?: MediaQueryListEvent) => {
      setIsMobile(event ? event.matches : mediaQuery.matches);
    };

    checkMobile();

    return addMediaQueryChangeListener(mediaQuery, checkMobile);
  }, [breakpoint]);

  return isMobile;
}
