function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeBaseUrl(input) {
  const value = input?.trim();

  if (!value) {
    throw new Error('请提供预发地址，例如: npm run smoke:remote -- https://preview.example.com');
  }

  const url = new URL(value);
  return url.toString().replace(/\/+$/, '');
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function collectAssetUrls(indexHtml) {
  const matches = indexHtml.matchAll(/"(\/assets\/[^"]+\.(?:js|css))"/g);
  return Array.from(new Set(Array.from(matches, ([assetPath]) => assetPath.slice(1, -1))));
}

function requireHeader(response, headerName, expectedFragment) {
  const headerValue = response.headers.get(headerName);
  assert(headerValue, `缺少响应头: ${headerName}`);
  assert(
    headerValue.includes(expectedFragment),
    `响应头 ${headerName} 缺少期望值: ${expectedFragment}`
  );
}

const baseUrlArg = process.argv.slice(2).find((value) => !value.startsWith('--')) ?? process.env.SMOKE_BASE_URL;
const skipSecurityHeaders = hasFlag('--skip-security-headers');
const skipApiCheck = hasFlag('--skip-api-check');
const baseUrl = normalizeBaseUrl(baseUrlArg);
const rootUrl = `${baseUrl}/`;

const homeResponse = await fetch(rootUrl, {
  redirect: 'follow',
});
assert(homeResponse.ok, `首页访问失败: ${homeResponse.status}`);

if (!skipSecurityHeaders) {
  requireHeader(homeResponse, 'content-security-policy', "default-src 'self'");
  requireHeader(homeResponse, 'x-content-type-options', 'nosniff');
  requireHeader(homeResponse, 'referrer-policy', 'strict-origin-when-cross-origin');

  if (new URL(baseUrl).protocol === 'https:') {
    requireHeader(homeResponse, 'strict-transport-security', 'max-age=');
  }
}

const homeHtml = await homeResponse.text();
assert(homeHtml.includes('<div id="root"></div>'), '首页缺少 root 挂载节点');
assert(homeHtml.includes('/manifest.webmanifest'), '首页未引用 manifest.webmanifest');
assert(homeHtml.includes('/favicon.svg'), '首页未引用 favicon.svg');

const manifestResponse = await fetch(`${baseUrl}/manifest.webmanifest`);
assert(manifestResponse.ok, `manifest.webmanifest 访问失败: ${manifestResponse.status}`);
const manifest = await manifestResponse.json();
assert(manifest.display === 'standalone', 'manifest.display 不是 standalone');
assert(manifest.icons?.some((icon) => icon.src === '/favicon.svg'), 'manifest 未包含 favicon.svg 图标');

const serviceWorkerResponse = await fetch(`${baseUrl}/sw.js`);
assert(serviceWorkerResponse.ok, `sw.js 访问失败: ${serviceWorkerResponse.status}`);
const serviceWorkerText = await serviceWorkerResponse.text();
assert(serviceWorkerText.includes("self.addEventListener('fetch'"), 'sw.js 内容无效');

const faviconResponse = await fetch(`${baseUrl}/favicon.svg`);
assert(faviconResponse.ok, `favicon.svg 访问失败: ${faviconResponse.status}`);
const faviconText = await faviconResponse.text();
assert(faviconText.includes('<svg'), 'favicon.svg 内容无效');

const assetUrls = collectAssetUrls(homeHtml);
assert(assetUrls.length >= 2, '首页未找到关键静态资源引用');

for (const assetUrl of assetUrls.slice(0, 4)) {
  const assetResponse = await fetch(`${baseUrl}${assetUrl}`);
  assert(assetResponse.ok, `静态资源访问失败: ${assetUrl}`);
}

if (!skipApiCheck) {
  const statsResponse = await fetch(`${baseUrl}/api/stats`, {
    headers: {
      Accept: 'application/json',
    },
  });
  assert([401, 403].includes(statsResponse.status), `/api/stats 未按预期拒绝匿名访问: ${statsResponse.status}`);
  requireHeader(statsResponse, 'cache-control', 'no-store');
  requireHeader(statsResponse, 'x-content-type-options', 'nosniff');

  const statsPayload = await statsResponse.json();
  assert(statsPayload?.success === false, '/api/stats 匿名访问返回格式异常');
}

console.log(`远端 smoke test 通过: ${baseUrl}`);
