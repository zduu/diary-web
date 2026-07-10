import type { DiaryEntry } from '../../types/index.ts';
import { parseTimeString } from '../../utils/timeUtils.ts';
import {
  ArchiveGroup,
  ArchiveGroupBy,
  ArchiveSubGroup,
} from './archiveTypes';
import {
  getArchiveMonthKey,
  getArchiveTimeLabel,
  getArchiveWeekKey,
} from './archiveGroupingLabels';

function getEntryDate(entry: DiaryEntry) {
  return parseTimeString(entry.created_at);
}

function getRequiredEntryDate(entry: DiaryEntry) {
  return getEntryDate(entry) ?? new Date(0);
}

function sortEntriesByDate(entries: DiaryEntry[]) {
  return [...entries].sort((a, b) => getRequiredEntryDate(b).getTime() - getRequiredEntryDate(a).getTime());
}

function groupEntriesByKey(entries: DiaryEntry[], getKey: (entry: DiaryEntry) => string) {
  const groups = new Map<string, DiaryEntry[]>();

  entries.forEach((entry) => {
    const key = getKey(entry);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(entry);
  });

  return groups;
}

function getArchiveGroupKey(date: Date, groupBy: ArchiveGroupBy) {
  if (groupBy === 'year') {
    return date.getFullYear().toString();
  }

  if (groupBy === 'month') {
    return getArchiveMonthKey(date);
  }

  return getArchiveWeekKey(date);
}

function createSubGroups(
  entries: DiaryEntry[],
  groupBy: Extract<ArchiveGroupBy, 'month' | 'week'>,
  useNaturalTime: boolean,
): ArchiveSubGroup[] {
  const groups = groupEntriesByKey(entries, (entry) => getArchiveGroupKey(getRequiredEntryDate(entry), groupBy));

  return Array.from(groups.entries())
    .map(([key, groupEntries]) => {
      const firstEntry = groupEntries[groupEntries.length - 1];
      const date = getRequiredEntryDate(firstEntry);

      return {
        key,
        title: getArchiveTimeLabel(date, groupBy, key, useNaturalTime),
        entries: sortEntriesByDate(groupEntries),
        count: groupEntries.length,
      };
    })
    .sort((a, b) => getRequiredEntryDate(b.entries[b.entries.length - 1]).getTime() - getRequiredEntryDate(a.entries[a.entries.length - 1]).getTime());
}

function getArchiveGroupBy(entries: DiaryEntry[]): ArchiveGroupBy {
  const sortedEntries = sortEntriesByDate(entries);
  const firstEntry = getRequiredEntryDate(sortedEntries[sortedEntries.length - 1]);
  const lastEntry = getRequiredEntryDate(sortedEntries[0]);
  const timeSpanDays = Math.ceil((lastEntry.getTime() - firstEntry.getTime()) / (1000 * 60 * 60 * 24));
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  if (timeSpanDays >= 365 || firstEntry.getFullYear() < currentYear) {
    return 'year';
  }

  if (
    timeSpanDays >= 60 ||
    (firstEntry.getFullYear() === currentYear && firstEntry.getMonth() < currentMonth - 1) ||
    (firstEntry.getMonth() < currentMonth && now.getDate() > 7)
  ) {
    return 'month';
  }

  return 'week';
}

export function createArchiveGroups(entries: DiaryEntry[], useNaturalTime: boolean): ArchiveGroup[] {
  if (entries.length === 0) return [];

  const datedEntries = entries.filter((entry) => getEntryDate(entry));
  const undatedEntries = entries.filter((entry) => !getEntryDate(entry));
  const sortedEntries = sortEntriesByDate(datedEntries);
  const groupBy = sortedEntries.length > 0 ? getArchiveGroupBy(sortedEntries) : 'year';
  const groups = groupEntriesByKey(sortedEntries, (entry) => getArchiveGroupKey(getRequiredEntryDate(entry), groupBy));

  const datedGroups = Array.from(groups.entries()).map(([key, groupEntries]) => {
    const firstEntry = groupEntries[groupEntries.length - 1];
    const date = getRequiredEntryDate(firstEntry);
    let subGroups: ArchiveSubGroup[] | undefined;

    if (groupBy === 'year') {
      subGroups = createSubGroups(groupEntries, 'month', useNaturalTime);
    } else if (groupBy === 'month') {
      const now = new Date();
      if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) {
        subGroups = createSubGroups(groupEntries, 'week', useNaturalTime);
      }
    }

    return {
      key,
      title: getArchiveTimeLabel(date, groupBy, key, useNaturalTime),
      entries: groupEntries,
      count: groupEntries.length,
      subGroups,
    };
  });

  if (undatedEntries.length === 0) {
    return datedGroups;
  }

  return [
    ...datedGroups,
    {
      key: 'unknown-date',
      title: '日期未知',
      entries: undatedEntries,
      count: undatedEntries.length,
    },
  ];
}
