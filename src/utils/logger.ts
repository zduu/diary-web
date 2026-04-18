const isDebugEnabled = Boolean(import.meta.env?.DEV);

export function debugLog(...args: unknown[]) {
  if (!isDebugEnabled) {
    return;
  }

  console.log(...args);
}

export function debugWarn(...args: unknown[]) {
  if (!isDebugEnabled) {
    return;
  }

  console.warn(...args);
}

export function debugError(...args: unknown[]) {
  if (!isDebugEnabled) {
    return;
  }

  console.error(...args);
}
