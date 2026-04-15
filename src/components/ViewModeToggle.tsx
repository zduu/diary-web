import type { CSSProperties } from 'react';
import { useThemeContext } from './ThemeProvider';

export type ViewMode = 'card' | 'timeline' | 'archive';

const VIEW_MODE_OPTIONS: Array<{
  mode: ViewMode;
  label: string;
  compactLabel: string;
  title: string;
}> = [
  { mode: 'card', label: '卡片', compactLabel: '卡片', title: '卡片模式' },
  { mode: 'timeline', label: '时间轴', compactLabel: '时间', title: '时间轴模式' },
  { mode: 'archive', label: '归纳', compactLabel: '归纳', title: '归纳模式' },
];

interface ViewModeToggleProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  archiveViewEnabled?: boolean;
  compact?: boolean;
}

export function ViewModeToggle({
  viewMode,
  onViewModeChange,
  archiveViewEnabled = true,
  compact = false,
}: ViewModeToggleProps) {
  const { theme } = useThemeContext();
  const options = archiveViewEnabled
    ? VIEW_MODE_OPTIONS
    : VIEW_MODE_OPTIONS.filter((option) => option.mode !== 'archive');
  const wrapperStyle: CSSProperties = {
    backgroundColor: theme.mode === 'dark' ? 'rgba(148, 163, 184, 0.08)' : 'rgba(255, 255, 255, 0.48)',
    border: `1px solid ${theme.colors.border}`,
  };

  const getButtonStyle = (active: boolean): CSSProperties => ({
    background: active ? `linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.accent})` : 'transparent',
    color: active ? 'white' : theme.colors.textSecondary,
    boxShadow: active ? '0 10px 24px rgba(37, 99, 235, 0.16)' : 'none',
  });

  return (
    <div
      className={`flex items-center gap-1 rounded-2xl ${compact ? 'p-1' : 'p-1.5'}`}
      style={wrapperStyle}
      role="tablist"
      aria-label="日记视图切换"
    >
      {options.map((option) => {
        const active = viewMode === option.mode;

        return (
          <button
            key={option.mode}
            type="button"
            onClick={() => onViewModeChange(option.mode)}
            role="tab"
            aria-selected={active}
            aria-label={`切换到${option.title.replace('模式', '视图')}`}
            className={`rounded-xl font-medium transition-all duration-200 ${compact ? 'min-w-[4.25rem] px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm'} ${
              active ? 'shadow-sm' : ''
            }`}
            style={getButtonStyle(active)}
            title={option.title}
          >
            <span>{compact ? option.compactLabel : option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
