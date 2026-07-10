/**
 * 标准化时间字符串，确保正确处理数据库返回的时间格式。
 * SQLite 的 CURRENT_TIMESTAMP 返回 UTC 时间，格式为 'YYYY-MM-DD HH:MM:SS'。
 *
 * 规则：
 * - 仅日期格式（YYYY-MM-DD）→ 视为 UTC 午夜，附加 T00:00:00Z
 * - 无 T 分隔符（SQLite 格式）→ 替换空格为 T，无时区则附加 Z
 * - 有时区则保留原值
 * - 如已有 T 但无时区 → 附加 Z（视为 UTC）
 *
 * 注意：此函数始终假定无时区的时间字符串为 UTC。如果输入来自本地时区上下文，
 * 调用方应在传入前自行转换为 UTC。
 */
export function normalizeTimeString(dateString?: string | null): string {
  if (!dateString) return '';

  const trimmedDateString = dateString.trim();
  if (!trimmedDateString) return '';

  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmedDateString);

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedDateString)) {
    return `${trimmedDateString}T00:00:00Z`;
  }

  if (!trimmedDateString.includes('T')) {
    return `${trimmedDateString.replace(' ', 'T')}${hasTimeZone ? '' : 'Z'}`;
  }

  if (!hasTimeZone) {
    return `${trimmedDateString}Z`;
  }

  return trimmedDateString;
}

export function parseTimeString(dateString?: string | null): Date | null {
  const normalizedDateString = normalizeTimeString(dateString);
  if (!normalizedDateString) {
    return null;
  }

  const date = new Date(normalizedDateString);
  return Number.isNaN(date.getTime()) ? null : date;
}
