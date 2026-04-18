import type { ApiResponse } from '../../../src/types/index.ts';
import type { Env } from '../_shared.ts';
import {
  jsonResponse,
  optionsResponse,
  readSession,
  requireAdminSession,
} from '../_shared.ts';

type R2SelfCheckResponse = {
  bucketBindingPresent: boolean;
  canWrite: boolean;
  canRead: boolean;
  canDelete: boolean;
  readBackMatches: boolean;
  testedKey: string | null;
  keyPrefix: string;
  message: string;
};

const R2_SELF_CHECK_PREFIX = 'diary/__healthcheck__';
const R2_DEFAULT_PREFIX = 'diary/';

export const onRequestOptions = async (): Promise<Response> => optionsResponse();

export const onRequestGet = async (context: { request: Request; env: Env }): Promise<Response> => {
  const session = await readSession(context.request, context.env);
  const unauthorized = requireAdminSession(session);

  if (unauthorized) {
    return unauthorized;
  }

  if (!context.env.IMAGES_BUCKET) {
    return jsonResponse<R2SelfCheckResponse>({
      success: true,
      data: {
        bucketBindingPresent: false,
        canWrite: false,
        canRead: false,
        canDelete: false,
        readBackMatches: false,
        testedKey: null,
        keyPrefix: R2_DEFAULT_PREFIX,
        message: '当前部署未检测到 IMAGES_BUCKET 绑定',
      },
    });
  }

  const testedKey = `${R2_SELF_CHECK_PREFIX}/check-${Date.now()}-${crypto.randomUUID()}.txt`;
  const probeText = `r2-self-check:${testedKey}`;

  let canWrite = false;
  let canRead = false;
  let canDelete = false;
  let readBackMatches = false;

  try {
    await context.env.IMAGES_BUCKET.put(testedKey, probeText, {
      httpMetadata: {
        contentType: 'text/plain; charset=utf-8',
      },
    });
    canWrite = true;

    const storedObject = await context.env.IMAGES_BUCKET.get(testedKey);
    if (storedObject) {
      canRead = true;
      const storedText = await new Response(storedObject.body).text();
      readBackMatches = storedText === probeText;
    }

    await context.env.IMAGES_BUCKET.delete(testedKey);
    canDelete = true;

    const message = canWrite && canRead && canDelete && readBackMatches
      ? 'IMAGES_BUCKET 已绑定，R2 可正常写入、读取和删除'
      : 'IMAGES_BUCKET 已绑定，但读写校验未完全通过';

    return jsonResponse<R2SelfCheckResponse>({
      success: true,
      data: {
        bucketBindingPresent: true,
        canWrite,
        canRead,
        canDelete,
        readBackMatches,
        testedKey,
        keyPrefix: R2_DEFAULT_PREFIX,
        message,
      },
    });
  } catch (error) {
    try {
      await context.env.IMAGES_BUCKET.delete(testedKey);
    } catch {
      // Ignore cleanup errors so the diagnostic result can surface the primary failure.
    }

    return jsonResponse<R2SelfCheckResponse>({
      success: true,
      data: {
        bucketBindingPresent: true,
        canWrite,
        canRead,
        canDelete,
        readBackMatches,
        testedKey,
        keyPrefix: R2_DEFAULT_PREFIX,
        message: error instanceof Error ? error.message : 'R2 自检失败',
      },
    });
  }
};
