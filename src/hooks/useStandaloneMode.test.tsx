import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useStandaloneMode } from './useStandaloneMode';
import { isNativeAppRuntime } from '../utils/nativePlatform.ts';

vi.mock('../utils/nativePlatform.ts', () => ({
  isNativeAppRuntime: vi.fn(() => false),
}));

const isNativeAppRuntimeMock = vi.mocked(isNativeAppRuntime);

function StandaloneProbe() {
  const isStandalone = useStandaloneMode();

  return <div data-testid="standalone-state">{isStandalone ? 'yes' : 'no'}</div>;
}

function mockMatchMedia(matches = false) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

describe('useStandaloneMode', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window.navigator, 'standalone');
    isNativeAppRuntimeMock.mockReturnValue(false);
  });

  it('treats native capacitor runtime as standalone', () => {
    mockMatchMedia(false);
    isNativeAppRuntimeMock.mockReturnValue(true);

    render(<StandaloneProbe />);

    expect(screen.getByTestId('standalone-state')).toHaveTextContent('yes');
  });

  it('detects iOS standalone mode on initial render via navigator.standalone', () => {
    mockMatchMedia(false);
    Object.defineProperty(window.navigator, 'standalone', {
      configurable: true,
      value: true,
    });

    render(<StandaloneProbe />);

    expect(screen.getByTestId('standalone-state')).toHaveTextContent('yes');
  });

  it('falls back when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);

    render(<StandaloneProbe />);

    expect(screen.getByTestId('standalone-state')).toHaveTextContent('no');
  });
});
