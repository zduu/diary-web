import type { DiaryEntry } from '../../types/index.ts';
import { sanitizeEntryHidden, sanitizeEntryTags } from '../../utils/entryTextValidation.ts';
import { parseTimeString } from '../../utils/timeUtils.ts';

export interface FilterMeta {
  visibleEntries: DiaryEntry[];
  availableTags: string[];
  untaggedEntryCount: number;
  availableYears: string[];
  availableMonths: string[];
  availableMonthsByYear: Record<string, string[]>;
}

export interface FilterMetaControls {
  availableTags: string[];
  untaggedEntryCount: number;
  availableYears: string[];
  availableMonths?: string[];
  availableMonthsByYear: Record<string, string[]>;
}

function getVisibleEntries(entries: DiaryEntry[], includeHidden = false) {
  return entries.filter((entry) => includeHidden || !sanitizeEntryHidden(entry.hidden));
}

function getAvailableTags(entries: DiaryEntry[], includeHidden = false) {
  const tagSet = new Set<string>();

  getVisibleEntries(entries, includeHidden).forEach((entry) => {
    sanitizeEntryTags(entry.tags).forEach((tag) => tagSet.add(tag));
  });

  return Array.from(tagSet).sort();
}

function getUntaggedEntryCount(entries: DiaryEntry[], includeHidden = false) {
  return getVisibleEntries(entries, includeHidden).filter((entry) => sanitizeEntryTags(entry.tags).length === 0).length;
}

function readNaturalNumber(value: string) {
  return /^\d+$/.test(value) ? Number(value) : null;
}

function sortNaturalNumberStringsDesc(a: string, b: string) {
  const aValue = readNaturalNumber(a);
  const bValue = readNaturalNumber(b);

  if (aValue !== null && bValue !== null) {
    return bValue - aValue;
  }

  if (aValue !== null) {
    return -1;
  }

  if (bValue !== null) {
    return 1;
  }

  return b.localeCompare(a, 'zh-CN');
}

function getAvailableYears(entries: DiaryEntry[], includeHidden = false) {
  const yearSet = new Set<string>();

  getVisibleEntries(entries, includeHidden).forEach((entry) => {
    const entryDate = parseTimeString(entry.created_at);
    if (!entryDate) {
      return;
    }

    yearSet.add(entryDate.getFullYear().toString());
  });

  return Array.from(yearSet).sort(sortNaturalNumberStringsDesc);
}

function getAvailableMonths(entries: DiaryEntry[], year?: string, includeHidden = false) {
  const monthSet = new Set<string>();

  getVisibleEntries(entries, includeHidden).forEach((entry) => {
    const entryDate = parseTimeString(entry.created_at);
    if (!entryDate) {
      return;
    }

    if (year && entryDate.getFullYear().toString() !== year) {
      return;
    }

    const month = (entryDate.getMonth() + 1).toString().padStart(2, '0');
    monthSet.add(month);
  });

  return Array.from(monthSet).sort(sortNaturalNumberStringsDesc);
}

function getAvailableMonthsByYear(entries: DiaryEntry[], includeHidden = false) {
  const monthMap = new Map<string, Set<string>>();

  getVisibleEntries(entries, includeHidden).forEach((entry) => {
    const entryDate = parseTimeString(entry.created_at);
    if (!entryDate) {
      return;
    }

    const year = entryDate.getFullYear().toString();
    const month = (entryDate.getMonth() + 1).toString().padStart(2, '0');

    if (!monthMap.has(year)) {
      monthMap.set(year, new Set());
    }

    monthMap.get(year)!.add(month);
  });

  return Object.fromEntries(
    Array.from(monthMap.entries()).map(([year, months]) => [
      year,
      Array.from(months).sort(sortNaturalNumberStringsDesc),
    ])
  ) as Record<string, string[]>;
}

function intersectList(values: string[], allowedValues: string[]) {
  const allowed = new Set(allowedValues);
  const seen = new Set<string>();

  return values.filter((value) => {
    if (!allowed.has(value) || seen.has(value)) {
      return false;
    }

    seen.add(value);
    return true;
  });
}

export function formatMonthLabel(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return '未知月份';
  }

  if (/^\d{1,2}$/.test(trimmedValue)) {
    const month = Number(trimmedValue);
    if (month >= 1 && month <= 12) {
      return `${month}月`;
    }
  }

  return trimmedValue;
}

export function buildFilterMeta(entries: DiaryEntry[], includeHidden = false): FilterMeta {
  const visibleEntries = getVisibleEntries(entries, includeHidden);

  return {
    visibleEntries,
    availableTags: getAvailableTags(entries, includeHidden),
    untaggedEntryCount: getUntaggedEntryCount(entries, includeHidden),
    availableYears: getAvailableYears(entries, includeHidden),
    availableMonths: getAvailableMonths(entries, undefined, includeHidden),
    availableMonthsByYear: getAvailableMonthsByYear(entries, includeHidden),
  };
}

export function sanitizeFilterMetaControls(
  controls: FilterMetaControls,
  entries: DiaryEntry[],
  includeHidden = false
): FilterMetaControls {
  const safeMeta = buildFilterMeta(entries, includeHidden);

  return {
    availableTags: intersectList(controls.availableTags, safeMeta.availableTags),
    untaggedEntryCount: safeMeta.untaggedEntryCount,
    availableYears: intersectList(controls.availableYears, safeMeta.availableYears),
    availableMonths: controls.availableMonths
      ? intersectList(controls.availableMonths, safeMeta.availableMonths)
      : undefined,
    availableMonthsByYear: Object.fromEntries(
      Object.entries(controls.availableMonthsByYear)
        .filter(([year]) => safeMeta.availableYears.includes(year))
        .map(([year, months]) => [
          year,
          intersectList(months, safeMeta.availableMonthsByYear[year] ?? []),
        ])
        .filter(([, months]) => months.length > 0)
    ) as Record<string, string[]>,
  };
}
