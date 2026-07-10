import { format, isToday, isYesterday, isThisWeek, isThisMonth, isThisYear } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import {
  normalizeTimeString,
  parseTimeString,
} from './timestampUtils.ts';

export {
  normalizeTimeString,
  parseTimeString,
};

export interface TimeDisplay {
  relative: string;
  absolute: string;
  tooltip: string;
}

const UNKNOWN_TIME_DISPLAY: TimeDisplay = {
  relative: '时间未知',
  absolute: '--:--',
  tooltip: '未知时间',
};

export function getSmartTimeDisplay(dateString?: string | null): TimeDisplay {
  const date = parseTimeString(dateString);
  if (!date) {
    return UNKNOWN_TIME_DISPLAY;
  }

  const now = new Date();
  
  // 相对时间显示
  let relative: string;
  
  if (isToday(date)) {
    const hoursDiff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    const minutesDiff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (minutesDiff < 1) {
      relative = '刚刚';
    } else if (minutesDiff < 60) {
      relative = `${minutesDiff}分钟前`;
    } else if (hoursDiff < 24) {
      relative = `${hoursDiff}小时前`;
    } else {
      relative = '今天';
    }
  } else if (isYesterday(date)) {
    relative = '昨天';
  } else if (isThisWeek(date)) {
    const daysDiff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    relative = `${daysDiff}天前`;
  } else if (isThisMonth(date)) {
    const daysDiff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    relative = `${daysDiff}天前`;
  } else if (isThisYear(date)) {
    relative = format(date, 'MM月dd日', { locale: zhCN });
  } else {
    relative = format(date, 'yyyy年MM月dd日', { locale: zhCN });
  }
  
  // 绝对时间显示（显示日记的创建时间，而不是当前时间）
  const absolute = format(date, 'HH:mm', { locale: zhCN });
  
  // 详细时间（用于tooltip）
  const tooltip = format(date, 'yyyy年MM月dd日 EEEE HH:mm:ss', { locale: zhCN });
  
  return {
    relative,
    absolute,
    tooltip,
  };
}

export function formatTimelineDate(dateString?: string | null): string {
  const date = parseTimeString(dateString);
  if (!date) {
    return '日期未知';
  }
  
  if (isToday(date)) {
    return '今天';
  } else if (isYesterday(date)) {
    return '昨天';
  } else if (isThisWeek(date)) {
    return format(date, 'EEEE', { locale: zhCN });
  } else if (isThisMonth(date)) {
    return format(date, 'MM月dd日', { locale: zhCN });
  } else if (isThisYear(date)) {
    return format(date, 'MM月dd日', { locale: zhCN });
  } else {
    return format(date, 'yyyy年MM月dd日', { locale: zhCN });
  }
}

/**
 * 格式化完整的日期时间显示（包含具体时间）
 */
export function formatFullDateTime(dateString?: string | null): string {
  const date = parseTimeString(dateString);
  if (!date) {
    return '未知时间';
  }

  return format(date, 'yyyy年MM月dd日 HH:mm', { locale: zhCN });
}
