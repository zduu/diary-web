import { describe, expect, it, vi } from 'vitest';
import { addMediaQueryChangeListener } from './mediaQueryListeners';

function createModernMediaQueryList() {
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();
  const addListener = vi.fn();
  const removeListener = vi.fn();
  const mediaQuery = {
    matches: false,
    media: '(max-width: 767px)',
    onchange: null,
    addEventListener,
    removeEventListener,
    addListener,
    removeListener,
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;

  return { mediaQuery, addEventListener, removeEventListener, addListener, removeListener };
}

function createLegacyMediaQueryList() {
  const addListener = vi.fn();
  const removeListener = vi.fn();
  const mediaQuery = {
    matches: false,
    media: '(max-width: 767px)',
    onchange: null,
    addEventListener: undefined,
    removeEventListener: undefined,
    addListener,
    removeListener,
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;

  return { mediaQuery, addListener, removeListener };
}

describe('mediaQueryListeners', () => {
  it('uses modern media query change listeners when available', () => {
    const { mediaQuery, addEventListener, removeEventListener, addListener } = createModernMediaQueryList();
    const listener = vi.fn();

    const cleanup = addMediaQueryChangeListener(mediaQuery, listener);
    cleanup();

    expect(addEventListener).toHaveBeenCalledWith('change', listener);
    expect(removeEventListener).toHaveBeenCalledWith('change', listener);
    expect(addListener).not.toHaveBeenCalled();
  });

  it('falls back to legacy media query listeners', () => {
    const { mediaQuery, addListener, removeListener } = createLegacyMediaQueryList();
    const listener = vi.fn();

    const cleanup = addMediaQueryChangeListener(mediaQuery, listener);
    cleanup();

    expect(addListener).toHaveBeenCalledWith(listener);
    expect(removeListener).toHaveBeenCalledWith(listener);
  });
});
