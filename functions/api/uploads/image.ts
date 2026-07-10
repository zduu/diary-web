import type { ApiResponse } from '../../../src/types/index.ts';
import { isValidBase64Payload } from '../../../src/utils/imageSourceValidation.ts';
import type { Env } from '../_shared.ts';
import {
  jsonResponse,
  optionsResponse,
  parseJsonBody,
  readSession,
  requireAdminSession,
} from '../_shared.ts';

type UploadImageResponse = {
  url: string;
};

type CloudflareImageUploadResult = {
  id?: string;
  variants?: string[];
};

type CloudflareImageUploadResponse = {
  success?: boolean;
  errors?: Array<{ message?: string }>;
  result?: CloudflareImageUploadResult;
};

type CloudflareImagesConfig = {
  accountId: string;
  apiToken: string;
  deliveryUrl?: string;
  variant: string;
  uploadTimeoutMs: number;
};

type UploadTarget =
  | { kind: 'r2'; bucket: R2Bucket }
  | { kind: 'cloudflare-images'; config: CloudflareImagesConfig };

type UploadedFile = {
  name: string;
  type: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

type JsonImageUploadRequest = {
  dataUrl?: string;
  filename?: string;
};

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_MULTIPART_BODY_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_JSON_BODY_BYTES = 15 * 1024 * 1024;
const DEFAULT_UPLOADED_FILE_READ_TIMEOUT_MS = 15000;
const DEFAULT_IMAGE_VARIANT = 'public';
const DEFAULT_CLOUDFLARE_IMAGES_UPLOAD_TIMEOUT_MS = 15000;
const R2_IMAGE_KEY_PREFIX = 'diary';
const DEFAULT_IMAGE_CONTENT_TYPE = 'application/octet-stream';
const FALLBACK_UPLOAD_FIELD_NAMES = ['image', 'upload', 'imageFile', 'files'];
const ALLOWED_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif']);

function resolvePositiveTimeout(value: string | undefined, fallbackMs: number) {
  const timeoutMs = Number(value);

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return fallbackMs;
  }

  return timeoutMs;
}

function resolveCloudflareImagesUploadTimeout(value: string | undefined) {
  return resolvePositiveTimeout(value, DEFAULT_CLOUDFLARE_IMAGES_UPLOAD_TIMEOUT_MS);
}

function resolveUploadedFileReadTimeout(value: string | undefined) {
  return resolvePositiveTimeout(value, DEFAULT_UPLOADED_FILE_READ_TIMEOUT_MS);
}

function parseContentLength(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value.trim())) {
    return null;
  }

  const contentLength = Number(value);
  return Number.isSafeInteger(contentLength) ? contentLength : null;
}

function getRequestMediaType(value: string | null): string {
  return value?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

function rejectOversizedMultipartBody(request: Request): void {
  const contentLength = parseContentLength(request.headers.get('Content-Length'));
  if (contentLength == null || contentLength <= MAX_IMAGE_MULTIPART_BODY_BYTES) {
    return;
  }

  throw Object.assign(
    new Error(`图片上传请求体不能超过 ${Math.floor(MAX_IMAGE_MULTIPART_BODY_BYTES / (1024 * 1024))}MB`),
    { status: 413 }
  );
}

function getCloudflareImagesConfig(env: Env): CloudflareImagesConfig | null {
  const accountId = env.IMAGES_ACCOUNT_ID?.trim();
  const apiToken = env.IMAGES_API_TOKEN?.trim();

  if (!accountId || !apiToken) {
    return null;
  }

  return {
    accountId,
    apiToken,
    deliveryUrl: env.IMAGES_DELIVERY_URL?.trim(),
    variant: env.IMAGES_VARIANT?.trim() || DEFAULT_IMAGE_VARIANT,
    uploadTimeoutMs: resolveCloudflareImagesUploadTimeout(env.IMAGES_UPLOAD_TIMEOUT_MS),
  };
}

function getUploadTarget(env: Env): UploadTarget | null {
  if (env.IMAGES_BUCKET) {
    return {
      kind: 'r2',
      bucket: env.IMAGES_BUCKET,
    };
  }

  const imagesConfig = getCloudflareImagesConfig(env);
  if (!imagesConfig) {
    return null;
  }

  return {
    kind: 'cloudflare-images',
    config: imagesConfig,
  };
}

function resolveUploadedImageUrl(
  result: CloudflareImageUploadResult | undefined,
  config: CloudflareImagesConfig
): string | null {
  const imageId = result?.id?.trim();
  const variants = result?.variants;

  if (config.deliveryUrl && imageId) {
    return `${config.deliveryUrl.replace(/\/+$/, '')}/${imageId}/${config.variant}`;
  }

  if (!Array.isArray(variants) || variants.length === 0) {
    return null;
  }

  const matchedVariant = variants.find((variantUrl) => variantUrl.endsWith(`/${config.variant}`));
  return matchedVariant ?? variants[0] ?? null;
}

function sanitizeFileExtension(fileName: string, contentType: string) {
  const explicitExtension = fileName.split('.').pop()?.trim().toLowerCase();

  if (explicitExtension && ALLOWED_IMAGE_EXTENSIONS.has(explicitExtension)) {
    return explicitExtension;
  }

  switch (contentType.toLowerCase()) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    case 'image/svg+xml':
      return 'svg';
    case 'image/avif':
      return 'avif';
    default:
      return 'bin';
  }
}

function normalizeMediaType(value: string) {
  return value.trim().toLowerCase();
}

function isImageContentType(value: string) {
  return normalizeMediaType(value).startsWith('image/');
}

function buildR2ImageKey(file: UploadedFile) {
  const extension = sanitizeFileExtension(file.name || '', file.type);
  return `${R2_IMAGE_KEY_PREFIX}/image-${Date.now()}-${crypto.randomUUID()}.${extension}`;
}

async function readUploadedFileBuffer(file: UploadedFile, timeoutMs: number): Promise<ArrayBuffer> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('图片读取超时，请重新选择文件后再试'));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      file.arrayBuffer(),
      timeoutPromise,
    ]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

async function uploadToR2(bucket: R2Bucket, file: UploadedFile, request: Request, fileReadTimeoutMs: number): Promise<string> {
  const key = buildR2ImageKey(file);
  const contentType = file.type ? normalizeMediaType(file.type) : DEFAULT_IMAGE_CONTENT_TYPE;
  const buffer = await readUploadedFileBuffer(file, fileReadTimeoutMs);

  await bucket.put(key, buffer, {
    httpMetadata: {
      contentType,
    },
  });

  return new URL(`/api/images/${encodeURIComponent(key)}`, request.url).toString();
}

async function uploadToCloudflareImages(
  file: UploadedFile,
  config: CloudflareImagesConfig,
  fileReadTimeoutMs: number
): Promise<string> {
  const canonicalFile = new File(
    [await readUploadedFileBuffer(file, fileReadTimeoutMs)],
    file.name || `diary-image-${Date.now()}`,
    { type: file.type ? normalizeMediaType(file.type) : DEFAULT_IMAGE_CONTENT_TYPE }
  );
  const uploadFormData = new FormData();
  uploadFormData.set('file', canonicalFile, canonicalFile.name);
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, config.uploadTimeoutMs);

  let cloudflareResponse: Response;

  try {
    cloudflareResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/images/v1`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiToken}`,
        },
        body: uploadFormData,
        signal: abortController.signal,
      }
    );
  } catch (error) {
    if (abortController.signal.aborted) {
      throw new Error('Cloudflare Images 上传超时，请稍后重试');
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  let cloudflarePayload: CloudflareImageUploadResponse | null = null;

  try {
    cloudflarePayload = await cloudflareResponse.json() as CloudflareImageUploadResponse;
  } catch {
    cloudflarePayload = null;
  }

  if (!cloudflareResponse.ok || !cloudflarePayload?.success) {
    const errorMessage = cloudflarePayload?.errors?.[0]?.message?.trim();
    throw new Error(errorMessage || 'Cloudflare Images 上传失败');
  }

  const uploadedImageUrl = resolveUploadedImageUrl(cloudflarePayload.result, config);
  if (!uploadedImageUrl) {
    throw new Error('图片上传成功，但未返回可用访问地址');
  }

  return uploadedImageUrl;
}

function toUploadedFile(value: unknown): UploadedFile | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<UploadedFile>;
  if (
    typeof candidate.arrayBuffer !== 'function'
    || typeof candidate.size !== 'number'
    || !Number.isFinite(candidate.size)
    || typeof candidate.type !== 'string'
  ) {
    return null;
  }

  return {
    name: typeof candidate.name === 'string' && candidate.name.trim()
      ? candidate.name
      : `diary-image-${Date.now()}.bin`,
    type: candidate.type,
    size: candidate.size,
    arrayBuffer: candidate.arrayBuffer.bind(value) as () => Promise<ArrayBuffer>,
  };
}

function extractUploadedFile(formData: FormData): UploadedFile | null {
  const directFile = toUploadedFile(formData.get('file'));
  if (directFile) {
    return directFile;
  }

  for (const fieldName of FALLBACK_UPLOAD_FIELD_NAMES) {
    const candidate = toUploadedFile(formData.get(fieldName));
    if (candidate) {
      return candidate;
    }
  }

  for (const value of formData.values()) {
    const candidate = toUploadedFile(value);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function decodeBase64ToBytes(base64Value: string) {
  const binary = atob(base64Value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function createUploadedFileFromDataUrl(dataUrl: string, filename?: string): UploadedFile {
  const match = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\r\n]+)$/i);

  if (!match) {
    throw Object.assign(new Error('dataUrl 不是有效的 base64 图片'), { status: 400 });
  }

  const contentType = normalizeMediaType(match[1] || DEFAULT_IMAGE_CONTENT_TYPE);
  const base64Payload = (match[2] || '').replace(/\s+/g, '');
  let bytes: Uint8Array;

  if (!isValidBase64Payload(base64Payload)) {
    throw Object.assign(new Error('dataUrl 不是有效的 base64 图片'), { status: 400 });
  }

  try {
    bytes = decodeBase64ToBytes(base64Payload);
  } catch {
    throw Object.assign(new Error('dataUrl 不是有效的 base64 图片'), { status: 400 });
  }

  return {
    name: filename?.trim() || `diary-image-${Date.now()}.${sanitizeFileExtension('', contentType)}`,
    type: contentType,
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

async function readUploadedFile(request: Request): Promise<UploadedFile> {
  const mediaType = getRequestMediaType(request.headers.get('Content-Type'));

  if (mediaType === 'multipart/form-data') {
    rejectOversizedMultipartBody(request);
    const formData = await request.formData();
    const file = extractUploadedFile(formData);

    if (!file) {
      throw new Error('缺少图片文件，请检查上传表单是否包含图片文件');
    }

    return file;
  }

  if (mediaType === 'application/json') {
    const { data, error, status } = await parseJsonBody<JsonImageUploadRequest>(request, {
      requireObject: true,
      requireJsonContentType: true,
      maxBodyBytes: MAX_IMAGE_JSON_BODY_BYTES,
    });

    if (!data) {
      throw Object.assign(new Error(error ?? '图片上传请求体无效'), { status: status ?? 400 });
    }

    if (typeof data.dataUrl !== 'string' || !data.dataUrl.trim()) {
      throw new Error('缺少 base64 图片数据');
    }

    return createUploadedFileFromDataUrl(data.dataUrl, data.filename);
  }

  throw Object.assign(new Error('图片上传请求必须使用 multipart/form-data 或 application/json'), { status: 415 });
}

export const onRequestOptions = async (): Promise<Response> => optionsResponse();

export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
  const session = await readSession(context.request, context.env);
  const unauthorized = requireAdminSession(session);

  if (unauthorized) {
    return unauthorized;
  }

  const uploadTarget = getUploadTarget(context.env);
  const fileReadTimeoutMs = resolveUploadedFileReadTimeout(context.env.IMAGES_FILE_READ_TIMEOUT_MS);

  if (!uploadTarget) {
    return jsonResponse<ApiResponse>({
      success: false,
      error: '图片上传功能未配置，请先绑定 R2 bucket 或设置 Cloudflare Images 参数',
    }, { status: 503 });
  }

  try {
    const file = await readUploadedFile(context.request);

    if (!isImageContentType(file.type)) {
      return jsonResponse<ApiResponse>({
        success: false,
        error: '仅支持图片文件上传',
      }, { status: 400 });
    }

    if (file.size <= 0) {
      return jsonResponse<ApiResponse>({
        success: false,
        error: '图片文件为空',
      }, { status: 400 });
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return jsonResponse<ApiResponse>({
        success: false,
        error: `图片大小不能超过 ${Math.floor(MAX_IMAGE_SIZE_BYTES / (1024 * 1024))}MB`,
      }, { status: 413 });
    }

    const uploadedImageUrl = uploadTarget.kind === 'r2'
      ? await uploadToR2(uploadTarget.bucket, file, context.request, fileReadTimeoutMs)
      : await uploadToCloudflareImages(file, uploadTarget.config, fileReadTimeoutMs);

    return jsonResponse<UploadImageResponse>({
      success: true,
      data: {
        url: uploadedImageUrl,
      },
      message: '图片上传成功',
    });
  } catch (error) {
    const status = typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number'
      ? error.status
      : 500;

    return jsonResponse<ApiResponse>({
      success: false,
      error: error instanceof Error ? error.message : '图片上传失败',
    }, { status });
  }
};
