import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequestGet as getImage } from '../functions/api/images/[key].ts';
import { onRequestPost as uploadImage } from '../functions/api/uploads/image.ts';
import { createSessionToken } from '../functions/api/_shared.ts';
import type { Env } from '../functions/api/_shared.ts';

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

type UploadTestEnvOverrides = Partial<Omit<Env, 'DB' | 'IMAGES_BUCKET'>> & {
  DB?: D1Database;
  IMAGES_BUCKET?: R2Bucket | MockR2Bucket;
};

function createEnv(overrides: UploadTestEnvOverrides = {}): Env {
  const { DB, IMAGES_BUCKET, ...rest } = overrides;
  const env: Env = {
    DB: (DB ?? {}) as unknown as D1Database,
    ENVIRONMENT: 'development',
    SESSION_SECRET: 'upload-test-secret',
    ...rest,
  };

  if (IMAGES_BUCKET) {
    env.IMAGES_BUCKET = IMAGES_BUCKET as unknown as R2Bucket;
  }

  return {
    ...env,
  };
}

async function parseJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

async function buildSessionCookie(scope: 'app' | 'admin', env: Env): Promise<string> {
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

test('image upload rejects oversized multipart bodies before parsing form data', async () => {
  const env = createEnv({
    IMAGES_BUCKET: new MockR2Bucket(),
  });
  const adminCookie = await buildSessionCookie('admin', env);
  let formDataCalled = false;

  const response = await uploadImage({
    request: {
      url: 'https://example.com/api/uploads/image',
      headers: new Headers({
        Cookie: adminCookie,
        'Content-Type': 'multipart/form-data; boundary=test',
        'Content-Length': String(13 * 1024 * 1024),
      }),
      async formData() {
        formDataCalled = true;
        throw new Error('form data should not be parsed');
      },
    } as Request,
    env,
  });

  assert.equal(response.status, 413);
  assert.equal(formDataCalled, false);
  const payload = await parseJson<{ success: boolean; error: string }>(response);
  assert.equal(payload.success, false);
  assert.match(payload.error, /请求体不能超过 12MB/);
});

test('image upload rejects disguised multipart content types', async () => {
  const env = createEnv({
    IMAGES_BUCKET: new MockR2Bucket(),
  });
  const adminCookie = await buildSessionCookie('admin', env);
  let formDataCalled = false;

  const response = await uploadImage({
    request: {
      url: 'https://example.com/api/uploads/image',
      headers: new Headers({
        Cookie: adminCookie,
        'Content-Type': 'text/plain; multipart/form-data',
      }),
      async formData() {
        formDataCalled = true;
        throw new Error('form data should not be parsed');
      },
    } as Request,
    env,
  });

  assert.equal(response.status, 415);
  assert.equal(formDataCalled, false);
  const payload = await parseJson<{ success: boolean; error: string }>(response);
  assert.equal(payload.success, false);
  assert.match(payload.error, /multipart\/form-data 或 application\/json/);
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

test('image upload accepts file-like values from runtime form data parsing', async () => {
  const bucket = new MockR2Bucket();
  const env = createEnv({
    IMAGES_BUCKET: bucket,
  });
  const adminCookie = await buildSessionCookie('admin', env);
  const fileLikeValue = {
    name: 'runtime-upload.png',
    type: 'IMAGE/PNG',
    size: 15,
    async arrayBuffer() {
      return new TextEncoder().encode('fake-image-data').buffer;
    },
  };

  const response = await uploadImage({
    request: {
      url: 'https://example.com/api/uploads/image',
      headers: new Headers({
        Cookie: adminCookie,
        'Content-Type': 'multipart/form-data; boundary=test',
      }),
      async formData() {
        return {
          get(key: string) {
            return key === 'file' ? fileLikeValue : null;
          },
          *values() {
            yield fileLikeValue;
          },
        } as unknown as FormData;
      },
    } as Request,
    env,
  });

  assert.equal(response.status, 200);
  const payload = await parseJson<{ success: boolean; data?: { url: string } }>(response);
  assert.equal(payload.success, true);
  assert.match(payload.data?.url ?? '', /^https:\/\/example\.com\/api\/images\/diary%2Fimage-/);
});

test('image upload rejects stalled file reads with a timeout error', async () => {
  const bucket = new MockR2Bucket();
  const env = createEnv({
    IMAGES_BUCKET: bucket,
    IMAGES_FILE_READ_TIMEOUT_MS: '1',
  });
  const adminCookie = await buildSessionCookie('admin', env);
  const fileLikeValue = {
    name: 'stalled-upload.png',
    type: 'image/png',
    size: 15,
    async arrayBuffer() {
      return new Promise<ArrayBuffer>(() => {});
    },
  };

  const response = await uploadImage({
    request: {
      url: 'https://example.com/api/uploads/image',
      headers: new Headers({
        Cookie: adminCookie,
        'Content-Type': 'multipart/form-data; boundary=test',
      }),
      async formData() {
        return {
          get(key: string) {
            return key === 'file' ? fileLikeValue : null;
          },
          *values() {
            yield fileLikeValue;
          },
        } as unknown as FormData;
      },
    } as Request,
    env,
  });

  assert.equal(response.status, 500);
  const payload = await parseJson<{ success: boolean; error: string }>(response);
  assert.equal(payload.success, false);
  assert.match(payload.error, /图片读取超时/);
});

test('image upload accepts base64 json payloads and stores them in r2', async () => {
  const bucket = new MockR2Bucket();
  const env = createEnv({
    IMAGES_BUCKET: bucket,
  });
  const adminCookie = await buildSessionCookie('admin', env);

  const response = await uploadImage({
    request: new Request('https://example.com/api/uploads/image', {
      method: 'POST',
      headers: {
        Cookie: adminCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dataUrl: 'data:IMAGE/PNG;base64,aGVsbG8=',
        filename: 'fallback.png',
      }),
    }),
    env,
  });

  assert.equal(response.status, 200);
  const payload = await parseJson<{ success: boolean; data?: { url: string } }>(response);
  assert.equal(payload.success, true);
  assert.match(payload.data?.url ?? '', /^https:\/\/example\.com\/api\/images\/diary%2Fimage-/);
});

test('image upload rejects malformed base64 json payloads with 400', async () => {
  const env = createEnv({
    IMAGES_BUCKET: new MockR2Bucket(),
  });
  const adminCookie = await buildSessionCookie('admin', env);

  const response = await uploadImage({
    request: new Request('https://example.com/api/uploads/image', {
      method: 'POST',
      headers: {
        Cookie: adminCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dataUrl: 'data:image/png;base64,@@@@',
        filename: 'broken.png',
      }),
    }),
    env,
  });

  assert.equal(response.status, 400);
  const payload = await parseJson<{ success: boolean; error: string }>(response);
  assert.equal(payload.success, false);
  assert.match(payload.error, /base64 图片/);
});

test('image upload rejects invalid base64 padding in json payloads with 400', async () => {
  const env = createEnv({
    IMAGES_BUCKET: new MockR2Bucket(),
  });
  const adminCookie = await buildSessionCookie('admin', env);

  const response = await uploadImage({
    request: new Request('https://example.com/api/uploads/image', {
      method: 'POST',
      headers: {
        Cookie: adminCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dataUrl: 'data:image/png;base64,abc=def',
        filename: 'broken.png',
      }),
    }),
    env,
  });

  assert.equal(response.status, 400);
  const payload = await parseJson<{ success: boolean; error: string }>(response);
  assert.equal(payload.success, false);
  assert.match(payload.error, /base64 图片/);
});

test('image upload ignores unsafe filename extensions for generated r2 keys', async () => {
  const env = createEnv({
    IMAGES_BUCKET: new MockR2Bucket(),
  });
  const adminCookie = await buildSessionCookie('admin', env);

  const response = await uploadImage({
    request: new Request('https://example.com/api/uploads/image', {
      method: 'POST',
      headers: {
        Cookie: adminCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dataUrl: 'data:image/png;base64,aGVsbG8=',
        filename: 'avatar.php',
      }),
    }),
    env,
  });

  assert.equal(response.status, 200);
  const payload = await parseJson<{ success: boolean; data?: { url: string } }>(response);
  const key = decodeURIComponent(payload.data?.url.split('/').pop() ?? '');
  assert.match(key, /\.png$/);
  assert.doesNotMatch(key, /\.php$/);
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
  assert.equal(imageResponse.headers.get('X-Content-Type-Options'), 'nosniff');

  const imageBuffer = new Uint8Array(await imageResponse.arrayBuffer());
  assert.equal(new TextDecoder().decode(imageBuffer), 'fake-image-data');
});

test('image fetch accepts encoded route keys for nested r2 paths', async () => {
  const bucket = new MockR2Bucket();
  const env = createEnv({
    IMAGES_BUCKET: bucket,
  });
  const storedKey = 'diary/image-preview-test.png';

  await bucket.put(storedKey, new TextEncoder().encode('preview'), {
    httpMetadata: {
      contentType: 'image/png',
    },
  });

  const response = await getImage({
    params: { key: encodeURIComponent(storedKey) },
    env,
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'image/png');
  assert.equal(await response.text(), 'preview');
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
  const observedRequests: Array<{ url: string; method: string; signal?: AbortSignal | null }> = [];

  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    observedRequests.push({
      url,
      method: init?.method || 'GET',
      signal: init?.signal ?? null,
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
    assert.equal(observedRequests[0]?.signal instanceof AbortSignal, true);
    assert.equal(observedRequests[0]?.signal?.aborted, false);
    assert.match(observedRequests[0]?.url ?? '', /api\.cloudflare\.com\/client\/v4\/accounts\/account-123\/images\/v1/);

    const payload = await parseJson<{ success: boolean; data?: { url: string } }>(response);
    assert.equal(payload.success, true);
    assert.equal(payload.data?.url, 'https://imagedelivery.net/demo-hash/image-123/public');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('image upload aborts cloudflare images requests that exceed the configured timeout', async () => {
  const env = createEnv({
    IMAGES_ACCOUNT_ID: 'account-123',
    IMAGES_API_TOKEN: 'token-abc',
    IMAGES_UPLOAD_TIMEOUT_MS: '1',
  });
  const adminCookie = await buildSessionCookie('admin', env);
  const originalFetch = globalThis.fetch;
  let observedSignal: AbortSignal | null = null;

  globalThis.fetch = async (_input, init) => {
    observedSignal = init?.signal ?? null;

    return new Promise<Response>((_resolve, reject) => {
      observedSignal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
  };

  try {
    const response = await uploadImage({
      request: buildImageUploadRequest(adminCookie, new File(['fake-image-data'], 'a.png', { type: 'image/png' })),
      env,
    });

    assert.equal(response.status, 500);
    assert.equal(observedSignal?.aborted, true);

    const payload = await parseJson<{ success: boolean; error: string }>(response);
    assert.equal(payload.success, false);
    assert.match(payload.error, /上传超时/);
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
