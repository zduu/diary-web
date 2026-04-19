import type { ApiResponse, DiaryEntry } from '../../../src/types/index.ts';
import type { Env } from '../_shared.ts';
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
} from '../_shared.ts';
import { deleteManagedImagesIfUnreferenced } from '../_imageStorage.ts';

type EntryUpdates = Partial<Omit<DiaryEntry, 'id' | 'created_at' | 'updated_at'>>;
const ENTRY_UPDATE_BODY_MAX_BYTES = 40 * 1024 * 1024;

function appendUpdateField(fields: string[], values: unknown[], field: string, value: unknown) {
  fields.push(`${field} = ?`);
  values.push(value);
}

export const onRequestOptions = async (): Promise<Response> => optionsResponse();

export const onRequestGet = async (context: { params: { id: string }; request: Request; env: Env }): Promise<Response> => {
  const id = parseEntryId(context.params.id);

  if (id == null) {
    return jsonResponse<ApiResponse>({
      success: false,
      error: '无效的日记ID',
    }, { status: 400 });
  }

  try {
    const session = await readSession(context.request, context.env);
    const result = await context.env.DB.prepare(
      session.isAdminAuthenticated
        ? 'SELECT * FROM diary_entries WHERE id = ? AND deleted_at IS NULL'
        : 'SELECT * FROM diary_entries WHERE id = ? AND deleted_at IS NULL AND hidden = 0'
    ).bind(id).first<Record<string, unknown>>();

    if (!result) {
      return jsonResponse<ApiResponse>({
        success: false,
        error: '日记不存在',
      }, { status: 404 });
    }

    const hydratedRow = await ensureEntryUuidForRow(context.env.DB, result);

    return jsonResponse<DiaryEntry>({
      success: true,
      data: formatEntry(hydratedRow),
    });
  } catch (error) {
    return jsonResponse<ApiResponse>({
      success: false,
      error: error instanceof Error ? error.message : '获取日记失败',
    }, { status: 500 });
  }
};

export const onRequestPut = async (context: { params: { id: string }; request: Request; env: Env }): Promise<Response> => {
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
    const { data: updates, error: bodyError, status: bodyStatus } = await parseJsonBody<EntryUpdates>(context.request, {
      requireObject: true,
      requireJsonContentType: true,
      maxBodyBytes: ENTRY_UPDATE_BODY_MAX_BYTES,
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

    const fields: string[] = [];
    const values: unknown[] = [];
    const { data: normalizedUpdates, error } = normalizeEntryInput(updates, { allowPartial: true });

    if (!normalizedUpdates) {
      return jsonResponse<ApiResponse>({
        success: false,
        error: error ?? '请求体格式无效',
      }, { status: 400 });
    }

    if (normalizedUpdates.title !== undefined) {
      appendUpdateField(fields, values, 'title', normalizedUpdates.title);
    }

    if (normalizedUpdates.content !== undefined) {
      appendUpdateField(fields, values, 'content', normalizedUpdates.content);
    }

    if (normalizedUpdates.content_type !== undefined) {
      appendUpdateField(fields, values, 'content_type', normalizedUpdates.content_type);
    }

    if (normalizedUpdates.mood !== undefined) {
      appendUpdateField(fields, values, 'mood', normalizedUpdates.mood);
    }

    if (normalizedUpdates.weather !== undefined) {
      appendUpdateField(fields, values, 'weather', normalizedUpdates.weather);
    }

    if (normalizedUpdates.images !== undefined) {
      appendUpdateField(fields, values, 'images', normalizedUpdates.images);
    }

    if (normalizedUpdates.location !== undefined) {
      appendUpdateField(fields, values, 'location', normalizedUpdates.location);
    }

    if (normalizedUpdates.tags !== undefined) {
      appendUpdateField(fields, values, 'tags', normalizedUpdates.tags);
    }

    if (normalizedUpdates.hidden !== undefined) {
      appendUpdateField(fields, values, 'hidden', normalizedUpdates.hidden);
    }

    if (fields.length === 0) {
      return jsonResponse<DiaryEntry>({
        success: true,
        data: formatEntry(hydratedExistingEntry),
        message: '没有更改',
      });
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const updatedEntry = await context.env.DB.prepare(
      `UPDATE diary_entries SET ${fields.join(', ')} WHERE id = ? RETURNING *`
    ).bind(...values).first<Record<string, unknown>>();

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
      console.warn('Failed to delete some unreferenced R2 images after entry update:', imageCleanup.failedKeys);
    }

    return jsonResponse<DiaryEntry>({
      success: true,
      data: formatEntry(await ensureEntryUuidForRow(context.env.DB, updatedEntry)),
      message: '日记更新成功',
    });
  } catch (error) {
    return jsonResponse<ApiResponse>({
      success: false,
      error: error instanceof Error ? error.message : '更新日记失败',
    }, { status: 500 });
  }
};

export const onRequestDelete = async (context: { params: { id: string }; request: Request; env: Env }): Promise<Response> => {
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
    const existingEntry = await context.env.DB.prepare('SELECT * FROM diary_entries WHERE id = ? AND deleted_at IS NULL').bind(id).first<Record<string, unknown>>();

    if (!existingEntry) {
      return jsonResponse<ApiResponse>({
        success: false,
        error: '日记不存在',
      }, { status: 404 });
    }

    const deletedAt = new Date().toISOString();
    const result = await context.env.DB.prepare(
      'UPDATE diary_entries SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL'
    ).bind(deletedAt, deletedAt, id).run();

    if (!result.success || result.meta.changes === 0) {
      throw new Error('删除失败');
    }

    const imageCleanup = await deleteManagedImagesIfUnreferenced({
      env: context.env,
      request: context.request,
      imageUrls: formatEntry(await ensureEntryUuidForRow(context.env.DB, existingEntry)).images ?? [],
      excludingEntryId: id,
    });

    if (imageCleanup.failedKeys.length > 0) {
      console.warn('Failed to delete some unreferenced R2 images after entry deletion:', imageCleanup.failedKeys);
    }

    return jsonResponse<ApiResponse>({
      success: true,
      message: '日记删除成功',
    });
  } catch (error) {
    return jsonResponse<ApiResponse>({
      success: false,
      error: error instanceof Error ? error.message : '删除日记失败',
    }, { status: 500 });
  }
};
