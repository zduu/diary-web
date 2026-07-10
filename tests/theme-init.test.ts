import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

test('theme init still applies the default theme when localStorage access is blocked', async () => {
  const script = await readFile(path.join(process.cwd(), 'public/theme-init.js'), 'utf8');
  const addedClasses: string[] = [];
  const attributes = new Map<string, string>();
  const root = {
    classList: {
      add: (value: string) => addedClasses.push(value),
    },
    style: {} as Record<string, string>,
  };

  vm.runInNewContext(script, {
    document: {
      documentElement: root,
      querySelector: () => ({
        setAttribute: (key: string, value: string) => attributes.set(key, value),
      }),
    },
    localStorage: {
      getItem: () => {
        throw new Error('blocked');
      },
    },
  }, {
    filename: 'public/theme-init.js',
  });

  assert.deepEqual(addedClasses, ['theme-light']);
  assert.equal(root.style.backgroundColor, '#f9fafb');
  assert.equal(root.style.colorScheme, 'light');
  assert.equal(attributes.get('content'), '#f9fafb');
});
