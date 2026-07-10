import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getLocalStorageItem,
  getSessionStorageItem,
  isLocalStorageAvailable,
  removeLocalStorageItem,
  removeSessionStorageItem,
  setLocalStorageItem,
  setLocalStorageItemStrict,
  setSessionStorageItem,
} from './browserStorage';

describe('browserStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('reads and writes localStorage values when storage is available', () => {
    expect(isLocalStorageAvailable()).toBe(true);
    expect(setLocalStorageItem('key', 'value')).toBe(true);
    expect(getLocalStorageItem('key')).toBe('value');
    expect(removeLocalStorageItem('key')).toBe(true);
    expect(getLocalStorageItem('key')).toBeNull();
  });

  it('returns null when reading localStorage fails', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });

    expect(getLocalStorageItem('key')).toBeNull();
  });

  it('preserves localStorage write errors for strict writes', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage is full', 'QuotaExceededError');
    });

    expect(() => setLocalStorageItemStrict('key', 'value')).toThrow(/Storage is full/);
  });

  it('returns false when writing or removing localStorage values fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage is full', 'QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });

    expect(setLocalStorageItem('key', 'value')).toBe(false);
    expect(removeLocalStorageItem('key')).toBe(false);
  });

  it('reports unavailable storage instead of treating no-op writes as successful', () => {
    vi.stubGlobal('localStorage', undefined);

    expect(isLocalStorageAvailable()).toBe(false);
    expect(setLocalStorageItem('key', 'value')).toBe(false);
    expect(removeLocalStorageItem('key')).toBe(false);
    expect(() => setLocalStorageItemStrict('key', 'value')).toThrow(/localStorage 不可用/);

    vi.stubGlobal('sessionStorage', undefined);

    expect(setSessionStorageItem('key', 'value')).toBe(false);
    expect(removeSessionStorageItem('key')).toBe(false);
  });

  it('reads and writes sessionStorage values when storage is available', () => {
    expect(setSessionStorageItem('key', 'value')).toBe(true);
    expect(getSessionStorageItem('key')).toBe('value');
    expect(removeSessionStorageItem('key')).toBe(true);
    expect(getSessionStorageItem('key')).toBeNull();
  });

  it('handles blocked sessionStorage access', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage is full', 'QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });

    expect(getSessionStorageItem('key')).toBeNull();
    expect(setSessionStorageItem('key', 'value')).toBe(false);
    expect(removeSessionStorageItem('key')).toBe(false);
  });
});
