import type { ApiResponse, DiaryEntry } from '../../../src/types/index.ts';
import type { Env } from '../_shared.ts';
import {
  ensureEntryUuidForRow,
  formatEntry,
  jsonResponse,
  normalizeEntryInput,
  optionsResponse,
  parseJsonBody,
  readSession,
  requireAdminSession,
} from '../_shared.ts';

type BatchImportRequest = {
  entries?: DiaryEntry[];
  options?: {
    overwrite?: boolean;
  };
};

type BatchUpdateRequest = {
  entries?: DiaryEntry[];
};

const MAX_BATCH_ENTRIES = 200;
const BATCH_BODY_MAX_BYTES = 50 * 1024 * 1024;

function parseBatchEntries(input: unknown): { entries?: DiaryEntry[]; error?: string; status?: number } {
  if (input === undefined) {
    return { entries: [] };
  }

  if (!Array.isArray(input)) {
    return { error: 'entries 必须是数组', status: 400 };
  }

  if (input.length > MAX_BATCH_ENTRIES) {
    return { error: `单次批量操作最多允许 ${MAX_BATCH_ENTRIES} 条`, status: 413 };
  }

  return { entries: input as DiaryEntry[] };
}

function parseBatchUpdateId(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return null;
  }

  return value;
}

export const onRequestOptions = async (): Promise<Response> => optionsResponse();

export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
  const session = await readSession(context.request, context.env);
  const unauthorized = requireAdminSession(session);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const { data: body, error: bodyError, status: bodyStatus } = await parseJsonBody<BatchImportRequest>(context.request, {
      requireObject: true,
      requireJsonContentType: true,
      maxBodyBytes: BATCH_BODY_MAX_BYTES,
    });
    if (!body) {
      return jsonResponse<ApiResponse>({
        success: false,
        error: bodyError ?? '请求体格式无效',
      }, { status: bodyStatus ?? 400 });
    }

    const { entries, error: entriesError, status: entriesStatus } = parseBatchEntries(body.entries);
    if (!entries) {
      return jsonResponse<ApiResponse>({
        success: false,
        error: entriesError ?? 'entries 格式无效',
      }, { status: entriesStatus ?? 400 });
    }

    const overwrite = body.options?.overwrite === true;

    if (entries.length === 0) {
      return jsonResponse<DiaryEntry[]>({
        success: true,
        data: [],
        message: '没有可导入的内容',
      });
    }

    const normalizedEntries: Array<NonNullable<ReturnType<typeof normalizeEntryInput>['data']>> = [];
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const { data: normalizedEntry, error } = normalizeEntryInput(entry, {
        requireContent: true,
        includeCreatedAt: true,
        includeEntryUuid: true,
      });

      if (!normalizedEntry) {
        return jsonResponse<ApiResponse>({
          success: false,
          error: `第 ${index + 1} 条导入数据无效: ${error ?? '格式错误'}`,
        }, { status: 400 });
      }

      normalizedEntries.push(normalizedEntry);
    }

    if (overwrite) {
      await context.env.DB.prepare('DELETE FROM diary_entries').run();
    }

    const importedEntries: DiaryEntry[] = [];
    for (const normalizedEntry of normalizedEntries) {
      const insertedEntry = await context.env.DB.prepare(`
        INSERT INTO diary_entries (entry_uuid, title, content, content_type, mood, weather, images, location, tags, hidden, created_at, updated_at, deleted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, NULL)
        RETURNING *
      `).bind(
        normalizedEntry.entry_uuid,
        normalizedEntry.title,
        normalizedEntry.content,
        normalizedEntry.content_type,
        normalizedEntry.mood,
        normalizedEntry.weather,
        normalizedEntry.images,
        normalizedEntry.location,
        normalizedEntry.tags,
        normalizedEntry.hidden,
        normalizedEntry.created_at
      ).first<Record<string, unknown>>();

      if (insertedEntry) {
        importedEntries.push(formatEntry(await ensureEntryUuidForRow(context.env.DB, insertedEntry)));
      }
    }

    return jsonResponse<DiaryEntry[]>({
      success: true,
      data: importedEntries,
      message: `成功导入 ${importedEntries.length} 篇日记`,
    });
  } catch (error) {
    return jsonResponse<ApiResponse>({
      success: false,
      error: error instanceof Error ? error.message : '批量导入失败',
    }, { status: 500 });
  }
};

export const onRequestPut = async (context: { request: Request; env: Env }): Promise<Response> => {
  const session = await readSession(context.request, context.env);
  const unauthorized = requireAdminSession(session);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const { data: body, error: bodyError, status: bodyStatus } = await parseJsonBody<BatchUpdateRequest>(context.request, {
      requireObject: true,
      requireJsonContentType: true,
      maxBodyBytes: BATCH_BODY_MAX_BYTES,
    });
    if (!body) {
      return jsonResponse<ApiResponse>({
        success: false,
        error: bodyError ?? '请求体格式无效',
      }, { status: bodyStatus ?? 400 });
    }

    const { entries, error: entriesError, status: entriesStatus } = parseBatchEntries(body.entries);
    if (!entries) {
      return jsonResponse<ApiResponse>({
        success: false,
        error: entriesError ?? 'entries 格式无效',
      }, { status: entriesStatus ?? 400 });
    }

    const normalizedUpdates: Array<{ id: number; entry: NonNullable<ReturnType<typeof normalizeEntryInput>['data']> }> = [];
    const seenIds = new Set<number>();
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const id = parseBatchUpdateId(entry.id);
      if (id == null) {
        return jsonResponse<ApiResponse>({
          success: false,
          error: `第 ${index + 1} 条更新数据缺少有效 id`,
        }, { status: 400 });
      }

      if (seenIds.has(id)) {
        return jsonResponse<ApiResponse>({
          success: false,
          error: `批量更新中存在重复 id: ${id}`,
        }, { status: 400 });
      }
      seenIds.add(id);

      const { data: normalizedEntry, error } = normalizeEntryInput(entry, {
        requireContent: true,
        includeCreatedAt: true,
        includeEntryUuid: true,
      });

      if (!normalizedEntry) {
        return jsonResponse<ApiResponse>({
          success: false,
          error: `第 ${index + 1} 条更新数据无效: ${error ?? '格式错误'}`,
        }, { status: 400 });
      }

      const existingEntry = await context.env.DB.prepare('SELECT id FROM diary_entries WHERE id = ? AND deleted_at IS NULL').bind(id).first<{ id: number }>();
      if (!existingEntry) {
        return jsonResponse<ApiResponse>({
          success: false,
          error: `第 ${index + 1} 条更新目标不存在`,
        }, { status: 404 });
      }

      normalizedUpdates.push({ id, entry: normalizedEntry });
    }

    const updatedEntries: DiaryEntry[] = [];
    for (const normalizedUpdate of normalizedUpdates) {
      const updatedEntry = await context.env.DB.prepare(`
        UPDATE diary_entries
        SET title = ?,
            content = ?,
            content_type = ?,
            mood = ?,
            weather = ?,
            images = ?,
            location = ?,
            tags = ?,
            hidden = ?,
            entry_uuid = ?,
            created_at = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        RETURNING *
      `).bind(
        normalizedUpdate.entry.title,
        normalizedUpdate.entry.content,
        normalizedUpdate.entry.content_type,
        normalizedUpdate.entry.mood,
        normalizedUpdate.entry.weather,
        normalizedUpdate.entry.images,
        normalizedUpdate.entry.location,
        normalizedUpdate.entry.tags,
        normalizedUpdate.entry.hidden,
        normalizedUpdate.entry.entry_uuid,
        normalizedUpdate.entry.created_at,
        normalizedUpdate.id
      ).first<Record<string, unknown>>();

      if (updatedEntry) {
        updatedEntries.push(formatEntry(await ensureEntryUuidForRow(context.env.DB, updatedEntry)));
      }
    }

    return jsonResponse<DiaryEntry[]>({
      success: true,
      data: updatedEntries,
      message: `成功更新 ${updatedEntries.length} 篇日记`,
    });
  } catch (error) {
    return jsonResponse<ApiResponse>({
      success: false,
      error: error instanceof Error ? error.message : '批量更新失败',
    }, { status: 500 });
  }
};
