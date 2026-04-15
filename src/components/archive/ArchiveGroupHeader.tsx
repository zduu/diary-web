import type { ReactNode } from 'react';
import { ThemeConfig } from '../../hooks/useTheme';
import {
  ArchiveGroup,
  ArchiveHeaderStyle,
} from './archiveTypes';

interface ArchiveGroupHeaderProps {
  group: ArchiveGroup;
  headerStyle: ArchiveHeaderStyle;
  expanded: boolean;
  isMobile: boolean;
  theme: ThemeConfig;
  onToggle: () => void;
}

interface ArchiveToggleButtonProps {
  expanded: boolean;
  indicatorColor: string;
  className: string;
  onToggle: () => void;
  children?: ReactNode;
}

function ArchiveToggleButton({
  expanded,
  indicatorColor,
  className,
  onToggle,
  children,
}: ArchiveToggleButtonProps) {
  return (
    <button type="button" onClick={onToggle} className={className}>
      <span className="text-sm font-medium" style={{ color: indicatorColor }}>
        {expanded ? 'v' : '>'}
      </span>
      {children}
    </button>
  );
}

export function ArchiveGroupHeader({
  group,
  headerStyle,
  expanded,
  isMobile,
  theme,
  onToggle,
}: ArchiveGroupHeaderProps) {
  const titleColor = theme.mode === 'dark' ? 'white' : theme.colors.text;
  const mutedColor = theme.mode === 'dark' ? 'rgba(255, 255, 255, 0.7)' : theme.colors.textSecondary;
  const dividerColor = theme.mode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : theme.colors.border;
  const titleClassName = isMobile ? 'text-lg' : 'text-xl';

  switch (headerStyle) {
    case 'minimal':
      return (
        <ArchiveToggleButton
          expanded={expanded}
          indicatorColor={theme.colors.primary}
          className="mb-4 flex items-center gap-3 transition-opacity hover:opacity-80"
          onToggle={onToggle}
        >
          <span
            className={`${isMobile ? 'text-base' : 'text-lg'} font-medium`}
            style={{ color: titleColor }}
          >
            {group.title} ({group.count})
          </span>
        </ArchiveToggleButton>
      );

    case 'timeline':
      return (
        <div className="mb-4 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: theme.colors.primary }} />
            <ArchiveToggleButton
              expanded={expanded}
              indicatorColor={theme.colors.primary}
              className="flex items-center gap-2 transition-opacity hover:opacity-80"
              onToggle={onToggle}
            >
              <h3
                className={`${titleClassName} font-semibold`}
                style={{ color: titleColor }}
              >
                {group.title}
              </h3>
            </ArchiveToggleButton>
          </div>
          <div className="h-px flex-1" style={{ backgroundColor: dividerColor }} />
          <span className="text-sm" style={{ color: mutedColor }}>{group.count} 条</span>
        </div>
      );

    case 'badge':
      return (
        <div className="mb-4 flex items-center gap-3">
          <ArchiveToggleButton
            expanded={expanded}
            indicatorColor={theme.colors.primary}
            className="flex items-center gap-2 transition-opacity hover:opacity-80"
            onToggle={onToggle}
          />
          <div
            className="flex items-center gap-2 rounded-full px-4 py-2"
            style={{
              backgroundColor: `${theme.colors.primary}15`,
              border: `1px solid ${theme.colors.primary}30`,
            }}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: theme.colors.primary }} aria-hidden="true" />
            <span
              className={`${isMobile ? 'text-sm' : 'text-base'} font-medium`}
              style={{ color: theme.colors.primary }}
            >
              {group.title}
            </span>
            <span
              className="rounded-full px-2 py-1 text-xs"
              style={{ backgroundColor: theme.colors.primary, color: 'white' }}
            >
              {group.count}
            </span>
          </div>
        </div>
      );

    default:
      return (
        <div className="mb-4 flex items-center gap-4">
          <ArchiveToggleButton
            expanded={expanded}
            indicatorColor={theme.colors.primary}
            className="flex items-center gap-2 transition-opacity hover:opacity-80"
            onToggle={onToggle}
          >
            <h3
              className={`${titleClassName} font-bold`}
              style={{ color: titleColor }}
            >
              {group.title}
            </h3>
          </ArchiveToggleButton>

          <div className="h-px flex-1" style={{ backgroundColor: dividerColor }} />

          <div className="flex items-center gap-2 text-sm" style={{ color: mutedColor }}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: theme.colors.textSecondary }} aria-hidden="true" />
            <span>{group.count} 条日记</span>
          </div>
        </div>
      );
  }
}
