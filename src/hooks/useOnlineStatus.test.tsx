import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useOnlineStatus } from './useOnlineStatus';

function OnlineStatusProbe() {
  const isOnline = useOnlineStatus();

  return <div data-testid="online-state">{isOnline ? 'online' : 'offline'}</div>;
}

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value,
  });
}

describe('useOnlineStatus', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Reflect.deleteProperty(window.navigator, 'onLine');
  });

  it('uses navigator.onLine for the initial status', () => {
    setNavigatorOnline(false);

    render(<OnlineStatusProbe />);

    expect(screen.getByTestId('online-state')).toHaveTextContent('offline');
  });

  it('defaults to online when navigator.onLine is unavailable', () => {
    Reflect.deleteProperty(window.navigator, 'onLine');

    render(<OnlineStatusProbe />);

    expect(screen.getByTestId('online-state')).toHaveTextContent('online');
  });

  it('updates when browser online and offline events fire', () => {
    setNavigatorOnline(true);

    render(<OnlineStatusProbe />);

    expect(screen.getByTestId('online-state')).toHaveTextContent('online');

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(screen.getByTestId('online-state')).toHaveTextContent('offline');

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(screen.getByTestId('online-state')).toHaveTextContent('online');
  });

  it('removes online and offline listeners on unmount', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener');
    const removeEventListener = vi.spyOn(window, 'removeEventListener');

    const { unmount } = render(<OnlineStatusProbe />);
    unmount();

    const onlineListener = addEventListener.mock.calls.find(([eventName]) => eventName === 'online')?.[1];
    const offlineListener = addEventListener.mock.calls.find(([eventName]) => eventName === 'offline')?.[1];

    expect(removeEventListener).toHaveBeenCalledWith('online', onlineListener);
    expect(removeEventListener).toHaveBeenCalledWith('offline', offlineListener);
  });
});
