import type { ApiResponse, DiaryEntry } from '../../../../src/types/index.ts';
import type { Env } from '../../_shared.ts';
import {
  ensureEntryUuidForRow,
  formatEntry,
  jsonResponse,
  normalizeEntryInput,
  optionsResponse,
  parseJsonBody,
  parseEntryId,
  readSession,
  requireAdminSession,
} from '../../_shared.ts';
import { deleteManagedImagesIfUnreferenced } from '../../_imageStorage.ts';

type EditRequest = Partial<Omit<DiaryEntry, 'id' | 'created_at' | 'updated_at'>>;
const ENTRY_EDIT_BODY_MAX_BYTES = 40 * 1024 * 1024;

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
    const { data: updates, error: bodyError, status: bodyStatus } = await parseJsonBody<EditRequest>(context.request, {
      requireObject: true,
      requireJsonContentType: true,
      maxBodyBytes: ENTRY_EDIT_BODY_MAX_BYTES,
    });
    if (!updates) {
      return jsonResponse<ApiResponse>({
        success: false,
        error: bodyError ?? '请求体格式无效',
      }, { status: bodyStatus ?? 400 });
    }

    const existingEntry = await context.env.DB.prepare('SELECT * FROM diary_entries WHERE id = ? AND deleted_at IS NULL').bind(id).first<Record<string, unknown>>();

    if (!existingEntry) {
      return jsonResponse<ApiResponse>({
        success: false,
        error: '日记不存在',
      }, { status: 404 });
    }

    const hydratedExistingEntry = await ensureEntryUuidForRow(context.env.DB, existingEntry);
    const previousImages = formatEntry(hydratedExistingEntry).images ?? [];

    const { data: normalizedUpdates, error } = normalizeEntryInput(updates, { allowPartial: true });
    if (!normalizedUpdates) {
      return jsonResponse<ApiResponse>({
        success: false,
        error: error ?? '请求体格式无效',
      }, { status: 400 });
    }

    const updatedEntry = await context.env.DB.prepare(`
      UPDATE diary_entries
      SET title = COALESCE(?, title),
          content = COALESCE(?, content),
          content_type = COALESCE(?, content_type),
          mood = COALESCE(?, mood),
          weather = COALESCE(?, weather),
          images = COALESCE(?, images),
          location = ?,
          tags = COALESCE(?, tags),
          hidden = COALESCE(?, hidden),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      RETURNING *
    `).bind(
      normalizedUpdates.title ?? null,
      normalizedUpdates.content ?? null,
      normalizedUpdates.content_type ?? null,
      normalizedUpdates.mood ?? null,
      normalizedUpdates.weather ?? null,
      normalizedUpdates.images ?? null,
      normalizedUpdates.location !== undefined ? normalizedUpdates.location : hydratedExistingEntry.location ?? null,
      normalizedUpdates.tags ?? null,
      normalizedUpdates.hidden ?? null,
      id
    ).first<Record<string, unknown>>();

    if (!updatedEntry) {
      throw new Error('更新失败');
    }

    const nextImages = formatEntry(updatedEntry).images ?? [];
    const removedImages = previousImages.filter((imageUrl) => !nextImages.includes(imageUrl));
    const imageCleanup = await deleteManagedImagesIfUnreferenced({
      env: context.env,
      request: context.request,
      imageUrls: removedImages,
      excludingEntryId: id,
    });

    if (imageCleanup.failedKeys.length > 0) {
      console.warn('Failed to delete some unreferenced R2 images after entry edit:', imageCleanup.failedKeys);
    }

    return jsonResponse<DiaryEntry>({
      success: true,
      data: formatEntry(await ensureEntryUuidForRow(context.env.DB, updatedEntry)),
      message: '日记编辑成功',
    });
  } catch (error) {
    return jsonResponse<ApiResponse>({
      success: false,
      error: error instanceof Error ? error.message : '编辑日记失败',
    }, { status: 500 });
  }
};
