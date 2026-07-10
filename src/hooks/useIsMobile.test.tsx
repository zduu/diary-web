import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIsMobile } from './useIsMobile';

function MobileProbe({ breakpoint }: { breakpoint?: number }) {
  const isMobile = useIsMobile(breakpoint);

  return <div data-testid="mobile-state">{isMobile ? 'mobile' : 'desktop'}</div>;
}

function mockMatchMedia(initialMatches = false) {
  let listener: ((event: MediaQueryListEvent) => void) | null = null;
  const addEventListener = vi.fn((_type: string, nextListener: EventListenerOrEventListenerObject) => {
    if (typeof nextListener === 'function') {
      listener = nextListener as (event: MediaQueryListEvent) => void;
    }
  });
  const removeEventListener = vi.fn((_type: string, nextListener: EventListenerOrEventListenerObject) => {
    if (nextListener === listener) {
      listener = null;
    }
  });
  const mediaQueryState = {
    matches: initialMatches,
    media: '(max-width: 767px)',
    onchange: null,
    addEventListener,
    removeEventListener,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: () => false,
  };
  const matchMedia = vi.fn(() => mediaQueryState as unknown as MediaQueryList);

  vi.stubGlobal('matchMedia', matchMedia);

  return {
    addEventListener,
    removeEventListener,
    emitChange(matches: boolean) {
      mediaQueryState.matches = matches;
      listener?.({ matches } as MediaQueryListEvent);
    },
  };
}

describe('useIsMobile', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('updates when the media query match changes', () => {
    const media = mockMatchMedia(false);

    render(<MobileProbe />);

    expect(screen.getByTestId('mobile-state')).toHaveTextContent('desktop');

    act(() => {
      media.emitChange(true);
    });

    expect(screen.getByTestId('mobile-state')).toHaveTextContent('mobile');
    expect(media.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('removes the media query listener on unmount', () => {
    const media = mockMatchMedia(false);

    const { unmount } = render(<MobileProbe />);
    unmount();

    expect(media.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
