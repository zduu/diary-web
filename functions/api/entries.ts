import type { ApiResponse, DiaryEntry } from '../../src/types/index.ts';
import type { Env } from './_shared.ts';
import { formatEntry, jsonResponse, normalizeEntryInput, optionsResponse, parseJsonBody, readSession, requireAdminSession } from './_shared.ts';

const ENTRY_WRITE_BODY_MAX_BYTES = 40 * 1024 * 1024;

export const onRequestOptions = async (): Promise<Response> => optionsResponse();

export const onRequestGet = async (context: { request: Request; env: Env }): Promise<Response> => {
  try {
    const session = await readSession(context.request, context.env);
    const statement = session.isAdminAuthenticated
      ? context.env.DB.prepare('SELECT * FROM diary_entries ORDER BY created_at DESC')
      : context.env.DB.prepare('SELECT * FROM diary_entries WHERE hidden = 0 ORDER BY created_at DESC');
    const { results } = await statement.all<Record<string, unknown>>();

    return jsonResponse<DiaryEntry[]>({
      success: true,
      data: results.map((row) => formatEntry(row)),
    });
  } catch (error) {
    return jsonResponse<ApiResponse>({
      success: false,
      error: error instanceof Error ? error.message : '获取日记失败',
    }, { status: 500 });
  }
};

export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
  const session = await readSession(context.request, context.env);
  const unauthorized = requireAdminSession(session);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const { data: body, error: bodyError, status: bodyStatus } = await parseJsonBody<DiaryEntry>(context.request, {
      requireObject: true,
      requireJsonContentType: true,
      maxBodyBytes: ENTRY_WRITE_BODY_MAX_BYTES,
    });
    if (!body) {
      return jsonResponse<ApiResponse>({
        success: false,
        error: bodyError ?? '请求体格式无效',
      }, { status: bodyStatus ?? 400 });
    }

    const { data: entry, error } = normalizeEntryInput(body, { requireContent: true });
    if (!entry) {
      return jsonResponse<ApiResponse>({
        success: false,
        error: error ?? '请求体格式无效',
      }, { status: 400 });
    }

    const result = await context.env.DB.prepare(`
      INSERT INTO diary_entries (title, content, content_type, mood, weather, images, location, tags, hidden)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `).bind(
      entry.title,
      entry.content,
      entry.content_type,
      entry.mood,
      entry.weather,
      entry.images,
      entry.location,
      entry.tags,
      entry.hidden
    ).first<Record<string, unknown>>();

    if (!result) {
      throw new Error('创建失败');
    }

    return jsonResponse<DiaryEntry>({
      success: true,
      data: formatEntry(result),
      message: '日记创建成功',
    });
  } catch (error) {
    return jsonResponse<ApiResponse>({
      success: false,
      error: error instanceof Error ? error.message : '创建日记失败',
    }, { status: 500 });
  }
};
