import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequestGet as getImage } from '../functions/api/images/[key].ts';
import { onRequestPost as uploadImage } from '../functions/api/uploads/image.ts';
import { createSessionToken } from '../functions/api/_shared.ts';

class MockR2Bucket {
  private readonly store = new Map<string, { body: Uint8Array; contentType?: string }>();

  async put(key: string, value: BodyInit | ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }) {
    const buffer = await new Response(value as BodyInit).arrayBuffer();
    this.store.set(key, {
      body: new Uint8Array(buffer),
      contentType: options?.httpMetadata?.contentType,
    });
  }

  async get(key: string) {
    const stored = this.store.get(key);
    if (!stored) {
      return null;
    }

    return {
      body: stored.body,
      size: stored.body.byteLength,
      httpEtag: 'test-etag',
      httpMetadata: {
        contentType: stored.contentType,
      },
    };
  }
}

function createEnv(overrides: Record<string, unknown> = {}) {
  return {
    DB: {} as any,
    ENVIRONMENT: 'development',
    SESSION_SECRET: 'upload-test-secret',
    ...overrides,
  } as any;
}

async function parseJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

async function buildSessionCookie(scope: 'app' | 'admin', env: any): Promise<string> {
  const token = await createSessionToken(scope, env);
  return `diary_session=${encodeURIComponent(token)}`;
}

function buildImageUploadRequest(cookie?: string, file?: File, fieldName = 'file'): Request {
  const formData = new FormData();
  if (file) {
    formData.set(fieldName, file, file.name);
  }

  return new Request('https://example.com/api/uploads/image', {
    method: 'POST',
    headers: cookie ? { Cookie: cookie } : undefined,
    body: formData,
  });
}

test('image upload requires admin session', async () => {
  const env = createEnv();

  const guestResponse = await uploadImage({
    request: buildImageUploadRequest(undefined, new File(['fake'], 'a.png', { type: 'image/png' })),
    env,
  });

  assert.equal(guestResponse.status, 401);

  const appCookie = await buildSessionCookie('app', env);
  const appResponse = await uploadImage({
    request: buildImageUploadRequest(appCookie, new File(['fake'], 'a.png', { type: 'image/png' })),
    env,
  });

  assert.equal(appResponse.status, 403);
});

test('image upload returns 503 when images config is missing', async () => {
  const env = createEnv();
  const adminCookie = await buildSessionCookie('admin', env);

  const response = await uploadImage({
    request: buildImageUploadRequest(adminCookie, new File(['fake'], 'a.png', { type: 'image/png' })),
    env,
  });

  assert.equal(response.status, 503);
  const payload = await parseJson<{ success: boolean; error: string }>(response);
  assert.equal(payload.success, false);
  assert.match(payload.error, /未配置/);
});

test('image upload validates file type', async () => {
  const env = createEnv({
    IMAGES_ACCOUNT_ID: 'account-123',
    IMAGES_API_TOKEN: 'token-abc',
  });
  const adminCookie = await buildSessionCookie('admin', env);

  const response = await uploadImage({
    request: buildImageUploadRequest(adminCookie, new File(['not-image'], 'a.txt', { type: 'text/plain' })),
    env,
  });

  assert.equal(response.status, 400);
});

test('image upload accepts common fallback field names', async () => {
  const bucket = new MockR2Bucket();
  const env = createEnv({
    IMAGES_BUCKET: bucket,
  });
  const adminCookie = await buildSessionCookie('admin', env);

  const response = await uploadImage({
    request: buildImageUploadRequest(adminCookie, new File(['fake-image-data'], 'a.png', { type: 'image/png' }), 'image'),
    env,
  });

  assert.equal(response.status, 200);
  const payload = await parseJson<{ success: boolean; data?: { url: string } }>(response);
  assert.equal(payload.success, true);
  assert.match(payload.data?.url ?? '', /^https:\/\/example\.com\/api\/images\/diary%2Fimage-/);
});

test('image upload falls back to the first file in multipart form data', async () => {
  const bucket = new MockR2Bucket();
  const env = createEnv({
    IMAGES_BUCKET: bucket,
  });
  const adminCookie = await buildSessionCookie('admin', env);
  const formData = new FormData();
  formData.set('note', 'not-a-file');
  formData.set('attachment', new File(['fake-image-data'], 'a.png', { type: 'image/png' }), 'a.png');

  const response = await uploadImage({
    request: new Request('https://example.com/api/uploads/image', {
      method: 'POST',
      headers: { Cookie: adminCookie },
      body: formData,
    }),
    env,
  });

  assert.equal(response.status, 200);
  const payload = await parseJson<{ success: boolean; data?: { url: string } }>(response);
  assert.equal(payload.success, true);
});

test('image upload stores file in r2 and returns local image URL when bucket binding exists', async () => {
  const bucket = new MockR2Bucket();
  const env = createEnv({
    IMAGES_BUCKET: bucket,
  });
  const adminCookie = await buildSessionCookie('admin', env);

  const response = await uploadImage({
    request: buildImageUploadRequest(adminCookie, new File(['fake-image-data'], 'a.png', { type: 'image/png' })),
    env,
  });

  assert.equal(response.status, 200);

  const payload = await parseJson<{ success: boolean; data?: { url: string } }>(response);
  assert.equal(payload.success, true);
  assert.match(payload.data?.url ?? '', /^https:\/\/example\.com\/api\/images\/diary%2Fimage-/);

  const key = payload.data?.url
    ? decodeURIComponent(payload.data.url.split('/').pop() ?? '')
    : undefined;
  assert.ok(key);

  const imageResponse = await getImage({
    params: { key },
    env,
  });

  assert.equal(imageResponse.status, 200);
  assert.equal(imageResponse.headers.get('Content-Type'), 'image/png');
  assert.equal(imageResponse.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');

  const imageBuffer = new Uint8Array(await imageResponse.arrayBuffer());
  assert.equal(new TextDecoder().decode(imageBuffer), 'fake-image-data');
});

test('image upload proxies file to cloudflare images and returns accessible url', async () => {
  const env = createEnv({
    IMAGES_ACCOUNT_ID: 'account-123',
    IMAGES_API_TOKEN: 'token-abc',
    IMAGES_DELIVERY_URL: 'https://imagedelivery.net/demo-hash',
    IMAGES_VARIANT: 'public',
  });
  const adminCookie = await buildSessionCookie('admin', env);

  const originalFetch = globalThis.fetch;
  const observedRequests: Array<{ url: string; method: string }> = [];

  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    observedRequests.push({
      url,
      method: init?.method || 'GET',
    });

    return new Response(JSON.stringify({
      success: true,
      result: {
        id: 'image-123',
        variants: ['https://imagedelivery.net/demo-hash/image-123/public'],
      },
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  };

  try {
    const response = await uploadImage({
      request: buildImageUploadRequest(adminCookie, new File(['fake-image-data'], 'a.png', { type: 'image/png' })),
      env,
    });

    assert.equal(response.status, 200);
    assert.equal(observedRequests.length, 1);
    assert.equal(observedRequests[0]?.method, 'POST');
    assert.match(observedRequests[0]?.url ?? '', /api\.cloudflare\.com\/client\/v4\/accounts\/account-123\/images\/v1/);

    const payload = await parseJson<{ success: boolean; data?: { url: string } }>(response);
    assert.equal(payload.success, true);
    assert.equal(payload.data?.url, 'https://imagedelivery.net/demo-hash/image-123/public');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('image fetch returns 404 for missing r2 object', async () => {
  const env = createEnv({
    IMAGES_BUCKET: new MockR2Bucket(),
  });

  const response = await getImage({
    params: { key: 'missing-image.png' },
    env,
  });

  assert.equal(response.status, 404);
});
