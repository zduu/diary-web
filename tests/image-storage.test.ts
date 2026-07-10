import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decodeManagedImageKey,
  extractManagedImageKeys,
  warnImageCleanupFailures,
} from '../functions/api/_imageStorage.ts';

test('decodeManagedImageKey accepts only bounded managed image keys', () => {
  assert.equal(decodeManagedImageKey('diary%2Fimage-123.png'), 'diary/image-123.png');
  assert.equal(decodeManagedImageKey('/diary/image-123.png'), 'diary/image-123.png');
  assert.equal(decodeManagedImageKey('../secret.png'), null);
  assert.equal(decodeManagedImageKey('diary/%2e%2e/secret.png'), null);
  assert.equal(decodeManagedImageKey(`diary/${'a'.repeat(520)}.png`), null);
});

test('extractManagedImageKeys keeps only same-origin managed image urls', () => {
  const request = new Request('https://example.com/api/entries/1');

  assert.deepEqual(extractManagedImageKeys([
    'https://example.com/api/images/diary%2Fone.png',
    '/api/images/diary%2Ftwo.png?size=large',
    'https://cdn.example.com/api/images/diary%2Fexternal.png',
    'https://example.com/uploads/diary%2Fother.png',
    '/api/images/diary/%2e%2e/secret.png',
    '/api/images/diary%2Fone.png',
  ], request), [
    'diary/one.png',
    'diary/two.png',
  ]);
});

test('warnImageCleanupFailures only logs when cleanup has failed keys', () => {
  const originalWarn = console.warn;
  const calls: unknown[][] = [];
  console.warn = (...args: unknown[]) => {
    calls.push(args);
  };

  try {
    warnImageCleanupFailures('entry update', []);
    assert.equal(calls.length, 0);

    warnImageCleanupFailures('entry update', ['images/one.jpg', 'images/two.jpg']);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.[0], 'Failed to delete some unreferenced R2 images after entry update:');
    assert.deepEqual(calls[0]?.[1], ['images/one.jpg', 'images/two.jpg']);
  } finally {
    console.warn = originalWarn;
  }
});
