function getLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function getSessionStorage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

function getStorageItem(storage: Storage | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function setStorageItem(storage: Storage | null, key: string, value: string): boolean {
  if (!storage) {
    return false;
  }

  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeStorageItem(storage: Storage | null, key: string): boolean {
  if (!storage) {
    return false;
  }

  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function getLocalStorageItem(key: string): string | null {
  return getStorageItem(getLocalStorage(), key);
}

export function isLocalStorageAvailable() {
  return getLocalStorage() !== null;
}

export function setLocalStorageItem(key: string, value: string): boolean {
  return setStorageItem(getLocalStorage(), key, value);
}

export function setLocalStorageItemStrict(key: string, value: string): void {
  const storage = getLocalStorage();
  if (!storage) {
    throw new Error('localStorage 不可用');
  }

  storage.setItem(key, value);
}

export function removeLocalStorageItem(key: string): boolean {
  return removeStorageItem(getLocalStorage(), key);
}

export function getSessionStorageItem(key: string): string | null {
  return getStorageItem(getSessionStorage(), key);
}

export function setSessionStorageItem(key: string, value: string): boolean {
  return setStorageItem(getSessionStorage(), key, value);
}

export function removeSessionStorageItem(key: string): boolean {
  return removeStorageItem(getSessionStorage(), key);
}
