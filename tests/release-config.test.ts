import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseWranglerReleaseConfig,
  stripTomlComments,
} from '../scripts/lib/release-config.mjs';

test('stripTomlComments removes inline comments outside strings', () => {
  const content = [
    'name = "diary-web" # project name',
    'pages_build_output_dir = "dist" # build output',
    'quote = "keep # inside string"',
  ].join('\n');

  assert.equal(
    stripTomlComments(content),
    [
      'name = "diary-web"',
      'pages_build_output_dir = "dist"',
      'quote = "keep # inside string"',
    ].join('\n'),
  );
});

test('parseWranglerReleaseConfig reads values with inline comments', () => {
  const config = parseWranglerReleaseConfig(`
name = "diary-web" # project
pages_build_output_dir = "dist" # output

[[d1_databases]]
binding = "DB" # binding
database_name = "diary-db" # name
database_id = "db-123" # id

[vars]
ENVIRONMENT = "production" # env
APP_TIMEZONE = "Asia/Shanghai" # timezone
IMAGES_VARIANT = "public#cdn" # keep hash
`);

  assert.equal(config.projectName, 'diary-web');
  assert.equal(config.pagesBuildOutputDir, 'dist');
  assert.equal(config.d1Binding, 'DB');
  assert.equal(config.d1DatabaseName, 'diary-db');
  assert.equal(config.d1DatabaseId, 'db-123');
  assert.equal(config.environment, 'production');
  assert.equal(config.appTimezone, 'Asia/Shanghai');
  assert.equal(config.imagesVariant, 'public#cdn');
});
