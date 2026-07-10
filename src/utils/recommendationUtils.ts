import type { DiaryEntry } from '../types/index.ts';
import { getDiaryEntryKey } from './diaryEntryIdentity.ts';
import { sanitizeEntryContent, sanitizeEntryTags } from './entryTextValidation.ts';
import { getEntryTimestamp } from './entryTime.ts';
import { isValidImageSource } from './imageSourceValidation.ts';
import { isValidLocationInfo } from './importUtils.ts';

export interface EntryRecommendation {
  id: string;
  label: string;
  description: string;
  actionLabel: string;
  entry: DiaryEntry;
}

interface RecommendationCandidate {
  entry: DiaryEntry;
  key: string;
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength).trim()}...`;
}

function sortEntries(entries: DiaryEntry[]): RecommendationCandidate[] {
  return entries
    .map((entry, index) => ({
      entry,
      key: getDiaryEntryKey(entry, index),
    }))
    .filter(({ entry }) => getEntryTimestamp(entry.created_at) !== null)
    .sort((left, right) => (getEntryTimestamp(right.entry.created_at) ?? 0) - (getEntryTimestamp(left.entry.created_at) ?? 0));
}

function isOlderThanDays(entry: DiaryEntry, now: Date, days: number) {
  const timestamp = getEntryTimestamp(entry.created_at);
  if (timestamp === null) {
    return false;
  }

  return now.getTime() - timestamp >= days * 24 * 60 * 60 * 1000;
}

function findSeasonalEntry(candidates: RecommendationCandidate[], now: Date, usedKeys: Set<string>) {
  const targetMonth = now.getMonth();

  return candidates.find(({ entry, key }) => {
    if (usedKeys.has(key) || !isOlderThanDays(entry, now, 45)) {
      return false;
    }

    const timestamp = getEntryTimestamp(entry.created_at);
    if (timestamp === null) {
      return false;
    }

    return new Date(timestamp).getMonth() === targetMonth;
  });
}

function findTagEntry(candidates: RecommendationCandidate[], usedKeys: Set<string>) {
  const tagCounts = new Map<string, number>();

  candidates.forEach(({ entry }) => {
    sanitizeEntryTags(entry.tags).forEach((tag) => {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    });
  });

  const rankedTags = [...tagCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-CN'));

  for (const [tag, count] of rankedTags) {
    const matchingCandidate = candidates.find(({ entry, key }) => !usedKeys.has(key) && sanitizeEntryTags(entry.tags).includes(tag));
    if (matchingCandidate) {
      return { candidate: matchingCandidate, tag, count };
    }
  }

  return null;
}

function findSceneEntry(candidates: RecommendationCandidate[], usedKeys: Set<string>) {
  return candidates.find(({ entry, key }) => {
    if (usedKeys.has(key)) {
      return false;
    }

    return hasRenderableImages(entry) || hasRenderableLocation(entry) || sanitizeEntryContent(entry.content).length >= 220;
  });
}

function hasRenderableImages(entry: DiaryEntry): boolean {
  return Array.isArray(entry.images) && entry.images.some(isValidImageSource);
}

function hasRenderableLocation(entry: DiaryEntry): boolean {
  return Boolean(entry.location && isValidLocationInfo(entry.location));
}

function buildRecentRecommendation({ entry, key }: RecommendationCandidate): EntryRecommendation {
  return {
    id: `recent-${key}`,
    label: '继续读',
    description: '离现在最近的一篇，适合顺着当前记录继续往下读。',
    actionLabel: '打开这篇',
    entry,
  };
}

function buildSeasonalRecommendation({ entry, key }: RecommendationCandidate): EntryRecommendation {
  return {
    id: `seasonal-${key}`,
    label: '此月回看',
    description: '和当前月份同季，适合做一轮轻量的时间回看。',
    actionLabel: '回看这页',
    entry,
  };
}

function buildTagRecommendation({ entry, key }: RecommendationCandidate, tag: string, count: number): EntryRecommendation {
  return {
    id: `tag-${key}-${tag}`,
    label: '主题线索',
    description: `标签“${tag}”出现了 ${count} 次，这篇适合作为这一条主题线索的入口。`,
    actionLabel: '打开主题',
    entry,
  };
}

function buildSceneRecommendation({ entry, key }: RecommendationCandidate): EntryRecommendation {
  const sceneLabel = hasRenderableImages(entry)
    ? '图片'
    : hasRenderableLocation(entry)
      ? '地点'
      : '更完整的正文';

  return {
    id: `scene-${key}`,
    label: '场景回放',
    description: `这篇带有${sceneLabel}信息，回看时更容易找回当时的环境和状态。`,
    actionLabel: '查看原文',
    entry,
  };
}

function buildArchiveRecommendation({ entry, key }: RecommendationCandidate): EntryRecommendation {
  const preview = truncateText(sanitizeEntryContent(entry.content).replace(/\s+/g, ' ').trim(), 36);

  return {
    id: `archive-${key}`,
    label: '翻旧页',
    description: preview ? `这是一段更早的记录，从这里重新打开旧页会更自然。` : '从更早的一页重新开始，适合打断最近输入惯性。',
    actionLabel: '翻回这篇',
    entry,
  };
}

export function getEntryRecommendations(entries: DiaryEntry[], now = new Date()): EntryRecommendation[] {
  const sortedCandidates = sortEntries(entries);
  if (sortedCandidates.length < 2) {
    return [];
  }

  const recommendations: EntryRecommendation[] = [];
  const usedKeys = new Set<string>();
  const pushRecommendation = (recommendation: EntryRecommendation | null, key: string | null) => {
    if (!recommendation || !key || usedKeys.has(key)) {
      return;
    }

    usedKeys.add(key);
    recommendations.push(recommendation);
  };

  const recentCandidate = sortedCandidates[0]!;
  pushRecommendation(buildRecentRecommendation(recentCandidate), recentCandidate.key);

  const seasonalCandidate = findSeasonalEntry(sortedCandidates, now, usedKeys);
  if (seasonalCandidate) {
    pushRecommendation(buildSeasonalRecommendation(seasonalCandidate), seasonalCandidate.key);
  }

  const tagRecommendation = findTagEntry(sortedCandidates, usedKeys);
  if (tagRecommendation) {
    pushRecommendation(
      buildTagRecommendation(tagRecommendation.candidate, tagRecommendation.tag, tagRecommendation.count),
      tagRecommendation.candidate.key
    );
  }

  const sceneCandidate = findSceneEntry(sortedCandidates, usedKeys);
  if (sceneCandidate) {
    pushRecommendation(buildSceneRecommendation(sceneCandidate), sceneCandidate.key);
  }

  if (recommendations.length < 3) {
    const olderCandidate = [...sortedCandidates].reverse().find(({ key }) => !usedKeys.has(key));
    if (olderCandidate) {
      pushRecommendation(buildArchiveRecommendation(olderCandidate), olderCandidate.key);
    }
  }

  return recommendations.slice(0, 3);
}
