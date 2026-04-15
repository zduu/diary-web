import type { ThemeConfig } from '../../hooks/useTheme';
import type { TimelineDateItem } from './timelineItems';

interface TimelineDateNavigatorProps {
  dateItems: TimelineDateItem[];
  activeDateAnchor: string | null;
  theme: ThemeConfig;
  className?: string;
}

export function TimelineDateNavigator({
  dateItems,
  activeDateAnchor,
  theme,
  className = 'mb-6',
}: TimelineDateNavigatorProps) {
  if (dateItems.length <= 1) {
    return null;
  }

  return (
    <div
      className={`${className} flex gap-2 overflow-x-auto rounded-[1.4rem] p-2`}
      style={{
        backgroundColor: theme.mode === 'dark' ? 'rgba(148, 163, 184, 0.08)' : 'rgba(255, 255, 255, 0.6)',
        border: `1px solid ${theme.colors.border}`,
      }}
    >
      {dateItems.map((item) => {
        const isActive = activeDateAnchor === item.data.anchorId;

        return (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              document.getElementById(item.data.anchorId)?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
              });
            }}
            className="shrink-0 rounded-2xl px-3 py-2 text-left transition-transform duration-200 hover:-translate-y-0.5"
            style={{
              background: isActive
                ? `linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.accent})`
                : theme.mode === 'dark'
                  ? 'rgba(10, 18, 28, 0.52)'
                  : theme.colors.surface,
              border: `1px solid ${isActive ? 'transparent' : theme.colors.border}`,
              color: isActive ? '#ffffff' : theme.colors.text,
              boxShadow: isActive ? '0 12px 28px rgba(37, 99, 235, 0.18)' : 'none',
            }}
          >
            <div className="text-sm font-semibold">{item.data.dateGroup}</div>
            <div className="mt-1 text-xs opacity-80">{item.data.entryCount} 篇</div>
          </button>
        );
      })}
    </div>
  );
}
