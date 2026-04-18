import type { ApiResponse } from '../../../src/types/index.ts';
import type { Env } from '../_shared.ts';
import { jsonResponse } from '../_shared.ts';

const IMAGE_KEY_PATTERN = /^(?:[a-zA-Z0-9][a-zA-Z0-9._-]*)(?:\/[a-zA-Z0-9][a-zA-Z0-9._-]*)*$/;
const DEFAULT_IMAGE_CONTENT_TYPE = 'application/octet-stream';
const IMAGE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

function buildImageHeaders(object: R2ObjectBody) {
  const headers = new Headers();
  headers.set('Cache-Control', IMAGE_CACHE_CONTROL);
  headers.set('Content-Type', object.httpMetadata?.contentType || DEFAULT_IMAGE_CONTENT_TYPE);

  if (typeof object.size === 'number' && object.size >= 0) {
    headers.set('Content-Length', String(object.size));
  }

  if (object.httpEtag) {
    headers.set('ETag', object.httpEtag);
  }

  return headers;
}

export const onRequestGet = async (context: { params: { key: string }; env: Env }): Promise<Response> => {
  const { key } = context.params;

  if (!key || !IMAGE_KEY_PATTERN.test(key)) {
    return jsonResponse<ApiResponse>({
      success: false,
      error: '无效的图片标识',
    }, { status: 400 });
  }

  if (!context.env.IMAGES_BUCKET) {
    return jsonResponse<ApiResponse>({
      success: false,
      error: 'R2 图片存储未配置',
    }, { status: 503 });
  }

  const object = await context.env.IMAGES_BUCKET.get(key);

  if (!object) {
    return jsonResponse<ApiResponse>({
      success: false,
      error: '图片不存在',
    }, { status: 404 });
  }

  return new Response(object.body, {
    headers: buildImageHeaders(object),
  });
};
