import type { ArchiveGroupBy } from './archiveTypes';

const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

export function getArchiveMonthKey(date: Date) {
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
}

function getArchiveWeekStart(date: Date) {
  const startOfWeek = new Date(date);
  const dayOfWeek = startOfWeek.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  startOfWeek.setDate(startOfWeek.getDate() - daysToMonday);
  return startOfWeek;
}

export function getArchiveWeekKey(date: Date) {
  const startOfWeek = getArchiveWeekStart(date);
  return `${startOfWeek.getFullYear()}-${(startOfWeek.getMonth() + 1).toString().padStart(2, '0')}-W${startOfWeek.getDate()}`;
}

function getArchiveMonthLabel(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function getArchiveWeekRangeLabel(date: Date) {
  const startOfWeek = getArchiveWeekStart(date);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  return `${startOfWeek.getMonth() + 1}月${startOfWeek.getDate()}日-${endOfWeek.getMonth() + 1}月${endOfWeek.getDate()}日`;
}

function parseArchiveYearKey(key: string) {
  if (!/^\d{4}$/.test(key)) {
    return null;
  }

  const year = Number(key);
  return Number.isFinite(year) ? year : null;
}

function parseArchiveMonthKey(key: string) {
  const [yearStr, monthStr] = key.split('-');
  if (!yearStr || !monthStr || !/^\d{4}$/.test(yearStr) || !/^\d{1,2}$/.test(monthStr)) {
    return null;
  }

  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return {
    year,
    monthIndex: month - 1,
  };
}

export function getArchiveTimeLabel(
  date: Date,
  groupBy: ArchiveGroupBy,
  key: string,
  useNaturalTime: boolean,
) {
  if (useNaturalTime) {
    return getNaturalArchiveTimeLabel(date, groupBy, key);
  }

  if (groupBy === 'year') {
    return `${key}年`;
  }

  if (groupBy === 'month') {
    return getArchiveMonthLabel(date);
  }

  return getArchiveWeekRangeLabel(date);
}

function getNaturalArchiveTimeLabel(date: Date, groupBy: ArchiveGroupBy, key: string) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  if (groupBy === 'year') {
    const year = parseArchiveYearKey(key);
    if (year === null) {
      return `${date.getFullYear()}年`;
    }

    if (year === currentYear) return '今年';
    if (year === currentYear - 1) return '去年';
    if (year === currentYear - 2) return '前年';
    return `${year}年`;
  }

  if (groupBy === 'month') {
    const parsedKey = parseArchiveMonthKey(key);
    if (!parsedKey) {
      return getArchiveMonthLabel(date);
    }

    const { year, monthIndex: month } = parsedKey;

    if (year === currentYear && month === currentMonth) return '本月';
    if (year === currentYear && month === currentMonth - 1) return '上个月';
    if (year === currentYear - 1 && month === 11 && currentMonth === 0) return '上个月';
    if (year === currentYear) return monthNames[month];
    return `${year}年${month + 1}月`;
  }

  const startOfWeek = getArchiveWeekStart(date);
  const weekYear = startOfWeek.getFullYear();
  const nowStartOfWeek = getArchiveWeekStart(now);

  nowStartOfWeek.setHours(0, 0, 0, 0);

  const normalizedStartOfWeek = new Date(startOfWeek);
  normalizedStartOfWeek.setHours(0, 0, 0, 0);

  const daysDiff = Math.floor((nowStartOfWeek.getTime() - normalizedStartOfWeek.getTime()) / (24 * 60 * 60 * 1000));
  const weeksDiff = Math.floor(daysDiff / 7);

  if (weeksDiff === 0) return '本周';
  if (weeksDiff === 1) return '上周';
  if (weeksDiff === 2) return '上上周';
  if (weeksDiff === 3) return '3周前';
  if (weeksDiff === 4) return '4周前';
  if (weeksDiff >= 5 && weeksDiff <= 8) return `${weeksDiff}周前`;

  const firstDayOfMonth = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), 1);
  const firstDayWeekday = firstDayOfMonth.getDay();
  const daysToFirstMonday = firstDayWeekday === 1 ? 0 : (firstDayWeekday === 0 ? 1 : 8 - firstDayWeekday);
  const firstMondayDate = 1 + daysToFirstMonday;

  let weekOfMonth = 0;
  if (startOfWeek.getDate() >= firstMondayDate) {
    weekOfMonth = Math.floor((startOfWeek.getDate() - firstMondayDate) / 7) + 1;
  }

  if (weekYear === currentYear) {
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    if (startOfWeek.getMonth() === endOfWeek.getMonth()) {
      if (weekOfMonth <= 0) {
        return `${startOfWeek.getMonth() + 1}月${startOfWeek.getDate()}日那周`;
      }
      return `${monthNames[startOfWeek.getMonth()]}第${weekOfMonth}周`;
    }

    return `${startOfWeek.getMonth() + 1}月${startOfWeek.getDate()}日那周`;
  }

  if (weekOfMonth <= 0) {
    return `${weekYear}年${startOfWeek.getMonth() + 1}月${startOfWeek.getDate()}日那周`;
  }

  return `${weekYear}年${startOfWeek.getMonth() + 1}月第${weekOfMonth}周`;
}
