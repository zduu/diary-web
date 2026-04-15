import {
  assertIncludes,
  fileExists,
  loadWranglerReleaseConfig,
  readRootText,
} from './lib/release-config.mjs';

const requiredFiles = [
  '_headers',
  'wrangler.toml',
  'schema.sql',
  'README.md',
  'docs/production-checklist.md',
  'docs/release-master-cutover.md',
  'docs/security-migration.md',
  'public/favicon.svg',
  'public/manifest.webmanifest',
  'public/sw.js',
];

const errors = [];

for (const relativePath of requiredFiles) {
  // eslint-disable-next-line no-await-in-loop
  const exists = await fileExists(relativePath);
  if (!exists) {
    errors.push(`缺少发布必需文件: ${relativePath}`);
  }
}

const headersContent = await readRootText('_headers');
assertIncludes(headersContent, 'Content-Security-Policy:', '_headers 缺少 Content-Security-Policy', errors);
assertIncludes(headersContent, 'Strict-Transport-Security:', '_headers 缺少 Strict-Transport-Security', errors);
assertIncludes(headersContent, 'X-Content-Type-Options: nosniff', '_headers 缺少 X-Content-Type-Options', errors);

const wranglerConfig = await loadWranglerReleaseConfig();
assertIncludes(wranglerConfig.active, '[[d1_databases]]', 'wrangler.toml 缺少 D1 数据库绑定配置', errors);

if (wranglerConfig.pagesBuildOutputDir !== 'dist') {
  errors.push('wrangler.toml 未声明 Pages 构建输出目录 dist');
}

if (wranglerConfig.d1Binding !== 'DB') {
  errors.push('wrangler.toml 缺少 DB 绑定');
}

if (!wranglerConfig.d1DatabaseName || !wranglerConfig.d1DatabaseId) {
  errors.push('wrangler.toml 缺少 D1 数据库名称或 database_id');
}

if (/preview_id\s*=/.test(wranglerConfig.active)) {
  errors.push('wrangler.toml 仍包含 preview_id，请确认是否保留了过时 KV 预览配置');
}

const readmeContent = await readRootText('README.md');
assertIncludes(readmeContent, 'docs/production-checklist.md', 'README.md 未链接上线检查清单', errors);
assertIncludes(readmeContent, 'docs/stats-api.md', 'README.md 未链接统计接口文档', errors);

const indexHtmlContent = await readRootText('index.html');
assertIncludes(indexHtmlContent, 'href="/manifest.webmanifest"', 'index.html 未引用 manifest.webmanifest', errors);
assertIncludes(indexHtmlContent, 'href="/favicon.svg"', 'index.html 未引用 favicon.svg', errors);

const manifestContent = await readRootText('public/manifest.webmanifest');
assertIncludes(manifestContent, '"display": "standalone"', 'manifest.webmanifest 未声明 standalone 显示模式', errors);
assertIncludes(manifestContent, '"/favicon.svg"', 'manifest.webmanifest 未引用 favicon.svg', errors);

const serviceWorkerContent = await readRootText('public/sw.js');
assertIncludes(serviceWorkerContent, "self.addEventListener('fetch'", 'sw.js 缺少 fetch 缓存逻辑', errors);

const mainEntryContent = await readRootText('src/main.tsx');
assertIncludes(
  mainEntryContent,
  "serviceWorker.register('/sw.js')",
  'src/main.tsx 未注册 sw.js',
  errors
);

if (errors.length > 0) {
  console.error('发布校验失败:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('发布校验通过');
