import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');

function getContentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.webmanifest')) return 'application/manifest+json; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

function normalizeRequestPath(urlPath) {
  if (urlPath === '/') {
    return 'index.html';
  }

  return urlPath.replace(/^\/+/, '');
}

async function readResponseFile(urlPath) {
  const relativePath = normalizeRequestPath(urlPath);
  const targetPath = path.join(distDir, relativePath);
  return readFile(targetPath);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function collectAssetUrls(indexHtml) {
  const matches = indexHtml.matchAll(/"(\/assets\/[^"]+\.(?:js|css))"/g);
  return Array.from(new Set(Array.from(matches, ([assetPath]) => assetPath.slice(1, -1))));
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');

  try {
    const fileBuffer = await readResponseFile(requestUrl.pathname);
    response.writeHead(200, {
      'Content-Type': getContentType(requestUrl.pathname),
      'Cache-Control': 'no-store',
    });
    response.end(fileBuffer);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not Found');
  }
});

try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('无法获取 smoke server 端口');
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;

  const homeResponse = await fetch(`${baseUrl}/`);
  assert(homeResponse.ok, '首页访问失败');
  const homeHtml = await homeResponse.text();
  assert(homeHtml.includes('<div id="root"></div>'), '首页缺少 root 挂载节点');
  assert(homeHtml.includes('/manifest.webmanifest'), '首页未引用 manifest.webmanifest');
  assert(homeHtml.includes('/favicon.svg'), '首页未引用 favicon.svg');

  const manifestResponse = await fetch(`${baseUrl}/manifest.webmanifest`);
  assert(manifestResponse.ok, 'manifest.webmanifest 访问失败');
  const manifest = await manifestResponse.json();
  assert(manifest.display === 'standalone', 'manifest.display 不是 standalone');
  assert(manifest.icons?.some((icon) => icon.src === '/favicon.svg'), 'manifest 未包含 favicon.svg 图标');

  const serviceWorkerResponse = await fetch(`${baseUrl}/sw.js`);
  assert(serviceWorkerResponse.ok, 'sw.js 访问失败');
  const serviceWorkerContent = await serviceWorkerResponse.text();
  assert(serviceWorkerContent.includes("self.addEventListener('fetch'"), 'sw.js 内容无效');

  const faviconResponse = await fetch(`${baseUrl}/favicon.svg`);
  assert(faviconResponse.ok, 'favicon.svg 访问失败');
  const faviconContent = await faviconResponse.text();
  assert(faviconContent.includes('<svg'), 'favicon.svg 内容无效');

  const assetUrls = collectAssetUrls(homeHtml);
  assert(assetUrls.length >= 2, '首页未找到关键静态资源引用');

  for (const assetUrl of assetUrls.slice(0, 4)) {
    const assetResponse = await fetch(`${baseUrl}${assetUrl}`);
    assert(assetResponse.ok, `静态资源访问失败: ${assetUrl}`);
  }

  console.log('构建产物 smoke test 通过');
} finally {
  server.close();
}
