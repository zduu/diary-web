import type { ApiResponse, DiaryEntry } from '../../../../src/types/index.ts';
import type { Env } from '../../_shared.ts';
import {
  formatEntry,
  jsonResponse,
  optionsResponse,
  parseEntryId,
  readSession,
  requireAdminSession,
} from '../../_shared.ts';

export const onRequestOptions = async (): Promise<Response> => optionsResponse();

export const onRequestPost = async (context: { params: { id: string }; request: Request; env: Env }): Promise<Response> => {
  const id = parseEntryId(context.params.id);

  if (id == null) {
    return jsonResponse<ApiResponse>({
      success: false,
      error: '无效的日记ID',
    }, { status: 400 });
  }

  const session = await readSession(context.request, context.env);
  const unauthorized = requireAdminSession(session);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const existingEntry = await context.env.DB.prepare('SELECT hidden FROM diary_entries WHERE id = ? AND deleted_at IS NULL').bind(id).first<{ hidden: number }>();

    if (!existingEntry) {
      return jsonResponse<ApiResponse>({
        success: false,
        error: '日记不存在',
      }, { status: 404 });
    }

    const nextHidden = existingEntry.hidden ? 0 : 1;
    const updatedEntry = await context.env.DB.prepare(
      'UPDATE diary_entries SET hidden = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *'
    ).bind(nextHidden, id).first<Record<string, unknown>>();

    if (!updatedEntry) {
      throw new Error('切换隐藏状态失败');
    }

    return jsonResponse<DiaryEntry>({
      success: true,
      data: formatEntry(updatedEntry),
      message: nextHidden ? '日记已隐藏' : '日记已显示',
    });
  } catch (error) {
    return jsonResponse<ApiResponse>({
      success: false,
      error: error instanceof Error ? error.message : '切换隐藏状态失败',
    }, { status: 500 });
  }
};
