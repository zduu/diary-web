import type { ReactNode } from 'react';
import { useThemeContext } from './ThemeProvider';
import { getMutedSurfaceStyle, getShellSurfaceStyle } from './app/appShellStyles';

interface ContentStatePanelProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  eyebrow?: string;
  isMobile?: boolean;
  className?: string;
  surface?: 'shell' | 'muted';
  align?: 'center' | 'left';
  density?: 'default' | 'compact';
}

export function ContentStatePanel({
  icon,
  title,
  description,
  action,
  eyebrow = 'content status',
  isMobile = false,
  className = '',
  surface = 'shell',
  align = 'center',
  density = 'default',
}: ContentStatePanelProps) {
  const { theme } = useThemeContext();
  const isCompact = density === 'compact';
  const panelStyle = surface === 'muted' ? getMutedSurfaceStyle(theme) : getShellSurfaceStyle(theme);
  const alignClassName = align === 'left' ? 'items-start text-left' : 'items-center text-center';
  const iconColor = theme.mode === 'dark' ? '#f9fafb' : theme.colors.primary;
  const iconBackground = theme.mode === 'dark' ? '#374151' : `${theme.colors.primary}12`;

  return (
    <section
      className={`rounded-[1.8rem] ${isCompact ? (isMobile ? 'p-4' : 'p-5') : isMobile ? 'p-5' : 'p-7'} ${className}`.trim()}
      style={panelStyle}
    >
      <div className={`flex flex-col ${alignClassName}`}>
        <div
          className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${isCompact ? 'mb-3' : 'mb-4'}`}
          style={{
            backgroundColor: iconBackground,
            color: iconColor,
            border: `1px solid ${theme.colors.border}`,
          }}
        >
          {eyebrow}
        </div>

        <div
          className={`flex items-center justify-center rounded-[1.5rem] ${isCompact ? 'mb-3 h-12 w-12 text-2xl' : isMobile ? 'mb-4 h-14 w-14 text-3xl' : 'mb-5 h-16 w-16 text-4xl'}`}
          style={{
            backgroundColor: iconBackground,
            color: iconColor,
            border: `1px solid ${theme.colors.border}`,
          }}
        >
          {icon}
        </div>

        <h3
          className={`${isCompact ? 'text-base' : isMobile ? 'text-lg' : 'text-xl'} font-semibold tracking-[-0.03em]`}
          style={{ color: theme.mode === 'dark' ? '#f9fafb' : theme.colors.text }}
        >
          {title}
        </h3>

        {description && (
          <p
            className={`${isCompact ? 'mt-2 text-sm leading-6' : isMobile ? 'mt-2 text-sm leading-6' : 'mt-3 text-base leading-7'} max-w-2xl`}
            style={{ color: theme.colors.textSecondary }}
          >
            {description}
          </p>
        )}

        {action && (
          <div className={isCompact ? 'mt-3' : 'mt-5'}>
            {action}
          </div>
        )}
      </div>
    </section>
  );
}
