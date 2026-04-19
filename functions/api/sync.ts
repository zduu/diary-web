import type { ApiResponse, DiaryEntry } from '../../src/types/index.ts';
import type { Env } from './_shared.ts';
import { deleteManagedImagesIfUnreferenced } from './_imageStorage.ts';
import {
  ensureEntryUuidsForRows,
  formatEntry,
  jsonResponse,
  normalizeEntryInput,
  optionsResponse,
  parseJsonBody,
  readSession,
  requireAdminSession,
  verifySyncAccessToken,
} from './_shared.ts';

type SyncRequest = {
  entries?: DiaryEntry[];
  lastSyncedAt?: string | null;
};

type SyncResponse = {
  entries: DiaryEntry[];
  pushedCount: number;
  deletedCount: number;
  confirmedEntryUuids: string[];
  syncedAt: string;
};

function parseLastSyncedAt(value: unknown): string | null {
  if (value == null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  return Number.isNaN(Date.parse(value)) ? null : value;
}

const SYNC_BODY_MAX_BYTES = 60 * 1024 * 1024;
const MAX_SYNC_ENTRIES = 500;

function parseSyncEntries(input: unknown): { entries?: DiaryEntry[]; error?: string; status?: number } {
  if (input === undefined) {
    return { entries: [] };
  }

  if (!Array.isArray(input)) {
    return { error: 'entries 必须是数组', status: 400 };
  }

  if (input.length > MAX_SYNC_ENTRIES) {
    return { error: `单次同步最多允许 ${MAX_SYNC_ENTRIES} 条`, status: 413 };
  }

  return { entries: input as DiaryEntry[] };
}

function getComparableTimestamp(value: unknown) {
  if (typeof value !== 'string') {
    return 0;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function isPendingDeleteEntry(entry: DiaryEntry) {
  return entry.sync_state === 'pending_delete' || (typeof entry.deleted_at === 'string' && entry.deleted_at.trim().length > 0);
}

export const onRequestOptions = async (): Promise<Response> => optionsResponse();

export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
  const syncToken = context.request.headers.get('X-Sync-Token')?.trim() ?? '';

  if (syncToken) {
    const verified = await verifySyncAccessToken(context.env.DB, syncToken, context.env);
    if (!verified) {
      return jsonResponse<ApiResponse>({
        success: false,
        error: '同步令牌错误',
      }, { status: 401 });
    }
  } else {
    const session = await readSession(context.request, context.env);
    const unauthorized = requireAdminSession(session);
    if (unauthorized) {
      return unauthorized;
    }
  }

  try {
    const { data: body, error: bodyError, status: bodyStatus } = await parseJsonBody<SyncRequest>(context.request, {
      requireObject: true,
      requireJsonContentType: true,
      maxBodyBytes: SYNC_BODY_MAX_BYTES,
    });
    if (!body) {
      return jsonResponse<ApiResponse>({
        success: false,
        error: bodyError ?? '请求体格式无效',
      }, { status: bodyStatus ?? 400 });
    }

    const { entries, error: entriesError, status: entriesStatus } = parseSyncEntries(body.entries);
    if (!entries) {
      return jsonResponse<ApiResponse>({
        success: false,
        error: entriesError ?? 'entries 格式无效',
      }, { status: entriesStatus ?? 400 });
    }

    let pushedCount = 0;
    let deletedCount = 0;
    const confirmedEntryUuids = new Set<string>();
    const lastSyncedAt = parseLastSyncedAt(body.lastSyncedAt);

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]!;
      const { data: normalizedEntry, error } = normalizeEntryInput(entry, {
        requireContent: !isPendingDeleteEntry(entry),
        includeCreatedAt: true,
        includeUpdatedAt: true,
        includeEntryUuid: true,
      });

      if (!normalizedEntry || !normalizedEntry.entry_uuid || !normalizedEntry.updated_at) {
        return jsonResponse<ApiResponse>({
          success: false,
          error: `第 ${index + 1} 条同步数据无效: ${error ?? '缺少同步标识或更新时间'}`,
        }, { status: 400 });
      }

      const existingEntry = await context.env.DB.prepare('SELECT * FROM diary_entries WHERE entry_uuid = ?')
        .bind(normalizedEntry.entry_uuid)
        .first<Record<string, unknown>>();

      if (isPendingDeleteEntry(entry)) {
        if (!existingEntry) {
          continue;
        }

        const existingDeletedAt = getComparableTimestamp(existingEntry.deleted_at);
        const incomingDeletedAt = getComparableTimestamp(normalizedEntry.updated_at);

        if (incomingDeletedAt < Math.max(existingDeletedAt, getComparableTimestamp(existingEntry.updated_at))) {
          continue;
        }

        const deleteResult = await context.env.DB.prepare(
          'UPDATE diary_entries SET deleted_at = ?, updated_at = ? WHERE entry_uuid = ? RETURNING *'
        )
          .bind(normalizedEntry.updated_at, normalizedEntry.updated_at, normalizedEntry.entry_uuid)
          .first<Record<string, unknown>>();

        if (deleteResult) {
          deletedCount += 1;
          confirmedEntryUuids.add(normalizedEntry.entry_uuid);
          const imageCleanup = await deleteManagedImagesIfUnreferenced({
            env: context.env,
            request: context.request,
            imageUrls: formatEntry(existingEntry).images ?? [],
            excludingEntryId: Number(existingEntry.id ?? 0),
          });

          if (imageCleanup.failedKeys.length > 0) {
            console.warn('Failed to delete some unreferenced R2 images after sync deletion:', imageCleanup.failedKeys);
          }
        }
        continue;
      }

      if (!existingEntry) {
        const insertedRow = await context.env.DB.prepare(`
          INSERT INTO diary_entries (entry_uuid, title, content, content_type, mood, weather, images, location, tags, hidden, created_at, updated_at, deleted_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
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
          normalizedEntry.created_at,
          normalizedEntry.updated_at
        ).first<Record<string, unknown>>();

        if (!insertedRow) {
          throw new Error('同步插入失败');
        }

        pushedCount += 1;
        confirmedEntryUuids.add(normalizedEntry.entry_uuid);
        continue;
      }

      const existingUpdatedAt = getComparableTimestamp(existingEntry.updated_at);
      const incomingUpdatedAt = getComparableTimestamp(normalizedEntry.updated_at);

      if (incomingUpdatedAt < existingUpdatedAt) {
        continue;
      }

      const updatedRow = await context.env.DB.prepare(`
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
            created_at = ?,
            updated_at = ?,
            deleted_at = NULL
        WHERE entry_uuid = ?
        RETURNING *
      `).bind(
        normalizedEntry.title,
        normalizedEntry.content,
        normalizedEntry.content_type,
        normalizedEntry.mood,
        normalizedEntry.weather,
        normalizedEntry.images,
        normalizedEntry.location,
        normalizedEntry.tags,
        normalizedEntry.hidden,
        normalizedEntry.created_at,
        normalizedEntry.updated_at,
        normalizedEntry.entry_uuid
      ).first<Record<string, unknown>>();

      if (!updatedRow) {
        throw new Error('同步更新失败');
      }

      pushedCount += 1;
      confirmedEntryUuids.add(normalizedEntry.entry_uuid);
    }

    const syncedAt = new Date().toISOString();
    const statement = lastSyncedAt
      ? context.env.DB.prepare(`
          SELECT * FROM diary_entries
          WHERE unixepoch(COALESCE(deleted_at, updated_at)) >= unixepoch(?)
          ORDER BY unixepoch(COALESCE(deleted_at, updated_at)) DESC
        `).bind(lastSyncedAt)
      : context.env.DB.prepare('SELECT * FROM diary_entries WHERE deleted_at IS NULL ORDER BY created_at DESC');
    const { results } = await statement.all<Record<string, unknown>>();
    const hydratedResults = await ensureEntryUuidsForRows(context.env.DB, results);

    return jsonResponse<SyncResponse>({
      success: true,
      data: {
        entries: hydratedResults.map((row) => formatEntry(row)),
        pushedCount,
        deletedCount,
        confirmedEntryUuids: [...confirmedEntryUuids],
        syncedAt,
      },
      message: `同步完成：上传/更新 ${pushedCount} 条，删除 ${deletedCount} 条`,
    });
  } catch (error) {
    return jsonResponse<ApiResponse>({
      success: false,
      error: error instanceof Error ? error.message : '同步失败',
    }, { status: 500 });
  }
};
