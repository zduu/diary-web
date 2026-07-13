import { Clock3, Compass, History, Sparkles, Tag } from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useThemeContext } from '../ThemeProvider';
import type { DiaryEntry } from '../../types/index.ts';
import { sanitizeEntryTags, sanitizeEntryTitle } from '../../utils/entryTextValidation.ts';
import type { EntryRecommendation } from '../../utils/recommendationUtils.ts';
import { formatFullDateTime } from '../../utils/timeUtils.ts';
import {
  getInsetSurfaceStyle,
  getMutedSurfaceStyle,
  getPrimaryButtonStyle,
  getShellSurfaceStyle,
} from './appShellStyles';

interface RecommendationsPanelProps {
  recommendations: EntryRecommendation[];
  isPending?: boolean;
  onOpenEntry: (entry: DiaryEntry) => void;
}

function getRecommendationIcon(label: string) {
  switch (label) {
    case '继续读':
      return Clock3;
    case '此月回看':
      return History;
    case '主题线索':
      return Tag;
    case '场景回放':
      return Compass;
    default:
      return Sparkles;
  }
}

export function RecommendationsPanel({
  recommendations,
  isPending = false,
  onOpenEntry,
}: RecommendationsPanelProps) {
  const { theme } = useThemeContext();
  const isMobile = useIsMobile();

  if (recommendations.length === 0) {
    return null;
  }

  const shellSurfaceStyle = getShellSurfaceStyle(theme);
  const mutedSurfaceStyle = getMutedSurfaceStyle(theme);
  const insetSurfaceStyle = getInsetSurfaceStyle(theme);
  const primaryButtonStyle = getPrimaryButtonStyle(theme);

  return (
    <section
      className={`rounded-[1.8rem] transition-all duration-200 ${isMobile ? 'p-3' : 'p-5'}`}
      style={{
        ...shellSurfaceStyle,
        opacity: isPending ? 0.8 : 1,
      }}
    >
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${isMobile ? '' : 'justify-between'}`}>
        <div className="flex items-center gap-2.5">
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs uppercase tracking-[0.18em]"
            style={{ ...mutedSurfaceStyle, color: theme.colors.primary }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            recommendations
          </div>
          <h2
            className={`${isMobile ? 'text-base' : 'text-lg'} font-semibold tracking-[-0.02em]`}
            style={{ color: theme.colors.text }}
          >
            轻回看入口
          </h2>
        </div>

        <p
          className={`${isMobile ? 'w-full text-xs leading-5' : 'text-sm'}`}
          style={{ color: theme.colors.textSecondary }}
        >
          {isPending ? '结果更新中，推荐会跟着当前列表调整。' : '随最近内容、标签和旧页线索自动更新。'}
        </p>
      </div>

      <div className={`mt-4 grid gap-3 ${isMobile ? 'grid-cols-1' : 'md:grid-cols-3'}`}>
        {recommendations.map((recommendation) => {
          const Icon = getRecommendationIcon(recommendation.label);
          const entryTitle = sanitizeEntryTitle(recommendation.entry.title, '未命名日记');
          const entryTags = sanitizeEntryTags(recommendation.entry.tags);

          return (
            <article
              key={recommendation.id}
              className={`rounded-[1.5rem] ${isMobile ? 'p-4' : 'p-5'}`}
              style={insetSurfaceStyle}
            >
              <div className="flex items-start justify-between gap-3">
                <div
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs uppercase tracking-[0.16em]"
                  style={{ ...mutedSurfaceStyle, color: theme.colors.primary }}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {recommendation.label}
                </div>

                <div className="text-xs" style={{ color: theme.colors.textSecondary }}>
                  {recommendation.entry.created_at ? formatFullDateTime(recommendation.entry.created_at) : '时间未知'}
                </div>
              </div>

              <h3
                className={`${isMobile ? 'mt-4 text-base' : 'mt-5 text-lg'} font-semibold leading-7 tracking-[-0.03em]`}
                style={{ color: theme.colors.text }}
              >
                {entryTitle}
              </h3>

              <p
                className={`${isMobile ? 'mt-2 text-sm leading-6' : 'mt-3 text-sm leading-7'}`}
                style={{ color: theme.colors.textSecondary }}
              >
                {recommendation.description}
              </p>

              {entryTags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {entryTags.slice(0, isMobile ? 3 : 4).map((tag) => (
                    <span
                      key={`${recommendation.id}-${tag}`}
                      className="rounded-full px-2.5 py-1 text-xs"
                      style={mutedSurfaceStyle}
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => onOpenEntry(recommendation.entry)}
                className={`mt-5 inline-flex items-center justify-center rounded-xl font-medium transition-transform duration-200 hover:-translate-y-0.5 ${isMobile ? 'w-full px-3 py-2 text-sm' : 'px-4 py-2.5 text-sm'}`}
                style={primaryButtonStyle}
              >
                {recommendation.actionLabel}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
