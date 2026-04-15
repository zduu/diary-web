import type { DiaryEntry } from '../types/index.ts';
import { normalizeTimeString } from './timeUtils.ts';

export interface EntryRecommendation {
  id: string;
  label: string;
  description: string;
  actionLabel: string;
  entry: DiaryEntry;
}

function getEntryTimestamp(entry: DiaryEntry): number | null {
  if (!entry.created_at) {
    return null;
  }

  const timestamp = new Date(normalizeTimeString(entry.created_at)).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength).trim()}...`;
}

function sortEntries(entries: DiaryEntry[]) {
  return [...entries]
    .filter((entry) => getEntryTimestamp(entry) !== null)
    .sort((left, right) => (getEntryTimestamp(right) ?? 0) - (getEntryTimestamp(left) ?? 0));
}

function isOlderThanDays(entry: DiaryEntry, now: Date, days: number) {
  const timestamp = getEntryTimestamp(entry);
  if (timestamp === null) {
    return false;
  }

  return now.getTime() - timestamp >= days * 24 * 60 * 60 * 1000;
}

function findSeasonalEntry(entries: DiaryEntry[], now: Date, usedIds: Set<number>) {
  const targetMonth = now.getMonth();

  return entries.find((entry) => {
    if (!entry.id || usedIds.has(entry.id) || !isOlderThanDays(entry, now, 45)) {
      return false;
    }

    const timestamp = getEntryTimestamp(entry);
    if (timestamp === null) {
      return false;
    }

    return new Date(timestamp).getMonth() === targetMonth;
  });
}

function findTagEntry(entries: DiaryEntry[], usedIds: Set<number>) {
  const tagCounts = new Map<string, number>();

  entries.forEach((entry) => {
    entry.tags?.forEach((tag) => {
      const normalizedTag = tag.trim();
      if (!normalizedTag) {
        return;
      }

      tagCounts.set(normalizedTag, (tagCounts.get(normalizedTag) ?? 0) + 1);
    });
  });

  const rankedTags = [...tagCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-CN'));

  for (const [tag, count] of rankedTags) {
    const matchingEntry = entries.find((entry) => entry.id && !usedIds.has(entry.id) && entry.tags?.includes(tag));
    if (matchingEntry) {
      return { entry: matchingEntry, tag, count };
    }
  }

  return null;
}

function findSceneEntry(entries: DiaryEntry[], usedIds: Set<number>) {
  return entries.find((entry) => {
    if (!entry.id || usedIds.has(entry.id)) {
      return false;
    }

    return Boolean(entry.images?.length) || Boolean(entry.location) || entry.content.length >= 220;
  });
}

function buildRecentRecommendation(entry: DiaryEntry): EntryRecommendation {
  return {
    id: `recent-${entry.id ?? 'entry'}`,
    label: '继续读',
    description: '离现在最近的一篇，适合顺着当前记录继续往下读。',
    actionLabel: '打开这篇',
    entry,
  };
}

function buildSeasonalRecommendation(entry: DiaryEntry): EntryRecommendation {
  return {
    id: `seasonal-${entry.id ?? 'entry'}`,
    label: '此月回看',
    description: '和当前月份同季，适合做一轮轻量的时间回看。',
    actionLabel: '回看这页',
    entry,
  };
}

function buildTagRecommendation(entry: DiaryEntry, tag: string, count: number): EntryRecommendation {
  return {
    id: `tag-${entry.id ?? 'entry'}-${tag}`,
    label: '主题线索',
    description: `标签“${tag}”出现了 ${count} 次，这篇适合作为这一条主题线索的入口。`,
    actionLabel: '打开主题',
    entry,
  };
}

function buildSceneRecommendation(entry: DiaryEntry): EntryRecommendation {
  const sceneLabel = entry.images?.length
    ? '图片'
    : entry.location
      ? '地点'
      : '更完整的正文';

  return {
    id: `scene-${entry.id ?? 'entry'}`,
    label: '场景回放',
    description: `这篇带有${sceneLabel}信息，回看时更容易找回当时的环境和状态。`,
    actionLabel: '查看原文',
    entry,
  };
}

function buildArchiveRecommendation(entry: DiaryEntry): EntryRecommendation {
  const preview = truncateText(entry.content.replace(/\s+/g, ' ').trim(), 36);

  return {
    id: `archive-${entry.id ?? 'entry'}`,
    label: '翻旧页',
    description: preview ? `这是一段更早的记录，从这里重新打开旧页会更自然。` : '从更早的一页重新开始，适合打断最近输入惯性。',
    actionLabel: '翻回这篇',
    entry,
  };
}

export function getEntryRecommendations(entries: DiaryEntry[], now = new Date()): EntryRecommendation[] {
  const sortedEntries = sortEntries(entries);
  if (sortedEntries.length < 2) {
    return [];
  }

  const recommendations: EntryRecommendation[] = [];
  const usedIds = new Set<number>();
  const pushRecommendation = (recommendation: EntryRecommendation | null) => {
    if (!recommendation || !recommendation.entry.id || usedIds.has(recommendation.entry.id)) {
      return;
    }

    usedIds.add(recommendation.entry.id);
    recommendations.push(recommendation);
  };

  pushRecommendation(buildRecentRecommendation(sortedEntries[0]));

  const seasonalEntry = findSeasonalEntry(sortedEntries, now, usedIds);
  if (seasonalEntry) {
    pushRecommendation(buildSeasonalRecommendation(seasonalEntry));
  }

  const tagRecommendation = findTagEntry(sortedEntries, usedIds);
  if (tagRecommendation) {
    pushRecommendation(buildTagRecommendation(tagRecommendation.entry, tagRecommendation.tag, tagRecommendation.count));
  }

  const sceneEntry = findSceneEntry(sortedEntries, usedIds);
  if (sceneEntry) {
    pushRecommendation(buildSceneRecommendation(sceneEntry));
  }

  if (recommendations.length < 3) {
    const olderEntry = [...sortedEntries].reverse().find((entry) => entry.id && !usedIds.has(entry.id));
    if (olderEntry) {
      pushRecommendation(buildArchiveRecommendation(olderEntry));
    }
  }

  return recommendations.slice(0, 3);
}
