type MediaQueryChangeListener = (event: MediaQueryListEvent) => void;

export function addMediaQueryChangeListener(
  mediaQuery: MediaQueryList,
  listener: MediaQueryChangeListener
) {
  if (
    typeof mediaQuery.addEventListener === 'function' &&
    typeof mediaQuery.removeEventListener === 'function'
  ) {
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }

  mediaQuery.addListener(listener);
  return () => mediaQuery.removeListener(listener);
}
