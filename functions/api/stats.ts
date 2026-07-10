import type { ApiResponse, DiaryStats } from '../../src/types/index.ts';
import { parseTimeString } from '../../src/utils/timestampUtils.ts';
import type { Env } from './_shared.ts';
import { getAdminAccessStatus, jsonResponse, optionsResponse, readSession, timingSafeEqual } from './_shared.ts';

interface StatsEntry {
  created_at?: string;
}

const DEFAULT_STATS_TIME_ZONE = 'Asia/Shanghai';

function getStatsTimeZone(env: Env): string {
  const configured = env.APP_TIMEZONE?.trim();
  if (!configured) {
    return DEFAULT_STATS_TIME_ZONE;
  }

  try {
    // 验证时区是否有效，无效时回退到默认值
    new Intl.DateTimeFormat('en-US', { timeZone: configured }).format(new Date());
    return configured;
  } catch {
    console.warn(`APP_TIMEZONE "${configured}" 无效，已回退到 ${DEFAULT_STATS_TIME_ZONE}`);
    return DEFAULT_STATS_TIME_ZONE;
  }
}

function formatDateKey(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error(`无法格式化时区日期: ${timeZone}`);
  }

  return `${year}-${month}-${day}`;
}

function toIsoDateKey(value: string | undefined, timeZone: string): string | null {
  const date = parseTimeString(value);
  if (!date) {
    return null;
  }

  return formatDateKey(date, timeZone);
}

function getEntryTimestamp(value: string | undefined): number | null {
  return parseTimeString(value)?.getTime() ?? null;
}

function getValidStatsDateRange(entries: StatsEntry[]): {
  latestEntryDate: string | null;
  firstEntryDate: string | null;
} {
  const sortedEntries = [...entries]
    .filter((entry) => getEntryTimestamp(entry.created_at) !== null)
    .sort((left, right) => (getEntryTimestamp(right.created_at) ?? 0) - (getEntryTimestamp(left.created_at) ?? 0));

  return {
    latestEntryDate: sortedEntries[0]?.created_at ?? null,
    firstEntryDate: sortedEntries[sortedEntries.length - 1]?.created_at ?? null,
  };
}

function shiftDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}

function calculateConsecutiveDays(
  entries: StatsEntry[],
  timeZone: string
): { consecutive_days: number; current_streak_start: string | null } {
  if (entries.length === 0) {
    return { consecutive_days: 0, current_streak_start: null };
  }

  const uniqueDates = Array.from(new Set(
    entries
      .map((entry) => toIsoDateKey(entry.created_at, timeZone))
      .filter((date): date is string => date !== null)
  )).sort((left, right) => right.localeCompare(left));

  if (uniqueDates.length === 0) {
    return { consecutive_days: 0, current_streak_start: null };
  }

  let consecutiveDays = 1;
  let currentStreakStart = uniqueDates[0];
  const todayStr = formatDateKey(new Date(), timeZone);
  const yesterdayStr = shiftDateKey(todayStr, -1);

  if (uniqueDates[0] !== todayStr && uniqueDates[0] !== yesterdayStr) {
    return { consecutive_days: 0, current_streak_start: null };
  }

  for (let index = 1; index < uniqueDates.length; index += 1) {
    const expectedDate = shiftDateKey(uniqueDates[index - 1], -1);
    if (uniqueDates[index] === expectedDate) {
      consecutiveDays += 1;
      currentStreakStart = uniqueDates[index];
      continue;
    }

    break;
  }

  return { consecutive_days: consecutiveDays, current_streak_start: currentStreakStart };
}

function calculateTotalDaysWithEntries(entries: StatsEntry[], timeZone: string): number {
  return new Set(
    entries
      .map((entry) => toIsoDateKey(entry.created_at, timeZone))
      .filter((date): date is string => date !== null)
  ).size;
}

function hasValidStatsApiKey(request: Request, env: Env): boolean {
  const configuredKey = env.STATS_API_KEY?.trim();

  if (!configuredKey) {
    return false;
  }

  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return timingSafeEqual(authHeader.slice(7), configuredKey);
  }

  const apiKeyHeader = request.headers.get('X-API-Key');
  if (apiKeyHeader) {
    return timingSafeEqual(apiKeyHeader, configuredKey);
  }

  return false;
}

export const onRequestOptions = async (): Promise<Response> => optionsResponse();

export const onRequestGet = async (context: { request: Request; env: Env }): Promise<Response> => {
  try {
    const session = await readSession(context.request, context.env);
    const hasApiKey = hasValidStatsApiKey(context.request, context.env);
    const timeZone = getStatsTimeZone(context.env);

    if (!session.isAdminAuthenticated && !hasApiKey) {
      return jsonResponse<ApiResponse>({
        success: false,
        error: '访问被拒绝',
        message: context.env.STATS_API_KEY
          ? '需要管理员会话或有效的统计 API 密钥'
          : '需要管理员会话访问统计接口',
      }, { status: getAdminAccessStatus(session) });
    }

    const result = await context.env.DB.prepare(`
      SELECT created_at
      FROM diary_entries
      ORDER BY created_at DESC
    `).all<StatsEntry>();

    const entries = result.results;
    const { consecutive_days, current_streak_start } = calculateConsecutiveDays(entries, timeZone);
    const total_days_with_entries = calculateTotalDaysWithEntries(entries, timeZone);
    const total_entries = entries.length;
    const { latestEntryDate, firstEntryDate } = getValidStatsDateRange(entries);

    const stats: DiaryStats = {
      consecutive_days,
      total_days_with_entries,
      total_entries,
      latest_entry_date: latestEntryDate,
      first_entry_date: firstEntryDate,
      current_streak_start,
    };

    return jsonResponse<DiaryStats>({
      success: true,
      data: stats,
    });
  } catch (error) {
    return jsonResponse<ApiResponse>({
      success: false,
      error: '获取日记统计失败',
      message: error instanceof Error ? error.message : '未知错误',
    }, { status: 500 });
  }
};
