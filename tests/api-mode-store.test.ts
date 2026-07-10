import test from 'node:test';
import assert from 'node:assert/strict';

import { ApiModeStore } from '../src/services/apiModeStore.ts';

class MockLocalStorage {
  private readonly store = new Map<string, string>();

  clear() {
    this.store.clear();
  }

  getItem(key: string) {
    return this.store.get(key) ?? null;
  }

  removeItem(key: string) {
    this.store.delete(key);
  }

  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
}

globalThis.localStorage = new MockLocalStorage() as unknown as Storage;

function waitForMicrotasks() {
  return new Promise((resolve) => {
    queueMicrotask(resolve);
  });
}

test('ApiModeStore catches background local data cleanup failures', async () => {
  const unhandledReasons: unknown[] = [];
  const unhandledListener = (reason: unknown) => {
    unhandledReasons.push(reason);
  };
  process.on('unhandledRejection', unhandledListener);

  const store = new ApiModeStore({
    clearCoreData: async () => {
      throw new Error('clear failed');
    },
    setDefaultDataEnabled: async () => {
      throw new Error('defaults failed');
    },
  });

  try {
    store.clearLocalData();
    store.setDefaultDataEnabled(true);
    await waitForMicrotasks();
    await waitForMicrotasks();

    assert.deepEqual(unhandledReasons, []);
  } finally {
    process.off('unhandledRejection', unhandledListener);
  }
});

test('ApiModeStore disables default data only after core cleanup finishes', async () => {
  const actions: string[] = [];
  let finishCleanup: (() => void) | undefined;
  const cleanupGate = new Promise<void>((resolve) => {
    finishCleanup = resolve;
  });
  const store = new ApiModeStore({
    clearCoreData: async () => {
      actions.push('clear:start');
      await cleanupGate;
      actions.push('clear:end');
    },
    setDefaultDataEnabled: async (enabled) => {
      actions.push(`defaults:${enabled}`);
    },
  });

  store.clearLocalData();
  await waitForMicrotasks();

  assert.deepEqual(actions, ['clear:start']);

  finishCleanup?.();
  await waitForMicrotasks();
  await waitForMicrotasks();

  assert.deepEqual(actions, ['clear:start', 'clear:end', 'defaults:false']);
});
