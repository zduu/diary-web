import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

type CacheStub = {
  put: (key: string, response: Response) => Promise<void>;
};

async function loadFetchListener(deps: {
  cache: CacheStub;
  fetchImpl: (request: { method: string; mode: string; url: string }) => Promise<Response>;
}) {
  const script = await readFile(path.join(process.cwd(), 'public/sw.js'), 'utf8');
  const listeners = new Map<string, (event: { request: { method: string; mode: string; url: string }; respondWith: (response: Promise<Response>) => void }) => void>();

  vm.runInNewContext(script, {
    URL,
    caches: {
      delete: async () => true,
      keys: async () => [],
      match: async () => undefined,
      open: async (cacheName: string) => {
        assert.equal(cacheName, 'diary-shell-v2');
        return deps.cache;
      },
    },
    fetch: deps.fetchImpl,
    self: {
      location: { origin: 'https://example.com' },
      addEventListener: (type: string, listener: (event: { request: { method: string; mode: string; url: string }; respondWith: (response: Promise<Response>) => void }) => void) => {
        listeners.set(type, listener);
      },
      clients: { claim: async () => undefined },
      skipWaiting: async () => undefined,
    },
  }, {
    filename: 'public/sw.js',
  });

  const listener = listeners.get('fetch');
  assert.ok(listener, 'service worker should register a fetch listener');
  return listener;
}

test('service worker refreshes cached root shell after successful navigation', async () => {
  const cacheWrites: Array<{ key: string; response: Response }> = [];
  const fetchListener = await loadFetchListener({
    cache: {
      put: async (key, response) => {
        cacheWrites.push({ key, response });
      },
    },
    fetchImpl: async () => new Response('<!doctype html><title>fresh shell</title>', {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    }),
  });

  let responsePromise: Promise<Response> | undefined;
  fetchListener({
    request: {
      method: 'GET',
      mode: 'navigate',
      url: 'https://example.com/archive?view=timeline',
    },
    respondWith: (response) => {
      responsePromise = response;
    },
  });

  assert.ok(responsePromise, 'fetch handler should respond to navigation requests');
  const response = await responsePromise;
  assert.equal(response.status, 200);
  assert.match(await response.text(), /fresh shell/);

  await Promise.resolve();

  assert.equal(cacheWrites.length, 1);
  assert.equal(cacheWrites[0]?.key, '/');
  assert.match(await cacheWrites[0]!.response.text(), /fresh shell/);
});
