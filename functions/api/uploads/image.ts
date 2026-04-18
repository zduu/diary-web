import type { ApiResponse } from '../../../src/types/index.ts';
import type { Env } from '../_shared.ts';
import {
  jsonResponse,
  optionsResponse,
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
};

type UploadTarget =
  | { kind: 'r2'; bucket: R2Bucket }
  | { kind: 'cloudflare-images'; config: CloudflareImagesConfig };

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const DEFAULT_IMAGE_VARIANT = 'public';
const R2_IMAGE_KEY_PREFIX = 'diary';
const DEFAULT_IMAGE_CONTENT_TYPE = 'application/octet-stream';

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

  if (explicitExtension && /^[a-z0-9]{1,10}$/.test(explicitExtension)) {
    return explicitExtension;
  }

  switch (contentType) {
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

function buildR2ImageKey(file: File) {
  const extension = sanitizeFileExtension(file.name || '', file.type);
  return `${R2_IMAGE_KEY_PREFIX}/image-${Date.now()}-${crypto.randomUUID()}.${extension}`;
}

async function uploadToR2(bucket: R2Bucket, file: File, request: Request): Promise<string> {
  const key = buildR2ImageKey(file);
  const contentType = file.type || DEFAULT_IMAGE_CONTENT_TYPE;
  const buffer = await file.arrayBuffer();

  await bucket.put(key, buffer, {
    httpMetadata: {
      contentType,
    },
  });

  return new URL(`/api/images/${encodeURIComponent(key)}`, request.url).toString();
}

async function uploadToCloudflareImages(file: File, config: CloudflareImagesConfig): Promise<string> {
  const uploadFormData = new FormData();
  uploadFormData.set('file', file, file.name || `diary-image-${Date.now()}`);

  const cloudflareResponse = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/images/v1`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
      },
      body: uploadFormData,
    }
  );

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

export const onRequestOptions = async (): Promise<Response> => optionsResponse();

export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
  const session = await readSession(context.request, context.env);
  const unauthorized = requireAdminSession(session);

  if (unauthorized) {
    return unauthorized;
  }

  const contentType = context.request.headers.get('Content-Type')?.toLowerCase() ?? '';

  if (!contentType.includes('multipart/form-data')) {
    return jsonResponse<ApiResponse>({
      success: false,
      error: '图片上传请求必须使用 multipart/form-data',
    }, { status: 415 });
  }

  const uploadTarget = getUploadTarget(context.env);

  if (!uploadTarget) {
    return jsonResponse<ApiResponse>({
      success: false,
      error: '图片上传功能未配置，请先绑定 R2 bucket 或设置 Cloudflare Images 参数',
    }, { status: 503 });
  }

  try {
    const formData = await context.request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return jsonResponse<ApiResponse>({
        success: false,
        error: '缺少图片文件（字段名应为 file）',
      }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
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
      ? await uploadToR2(uploadTarget.bucket, file, context.request)
      : await uploadToCloudflareImages(file, uploadTarget.config);

    return jsonResponse<UploadImageResponse>({
      success: true,
      data: {
        url: uploadedImageUrl,
      },
      message: '图片上传成功',
    });
  } catch (error) {
    return jsonResponse<ApiResponse>({
      success: false,
      error: error instanceof Error ? error.message : '图片上传失败',
    }, { status: 500 });
  }
};
