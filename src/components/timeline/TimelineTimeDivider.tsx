import { Clock } from 'lucide-react';
import type { TimeDisplay } from '../../utils/timeUtils.ts';
import { useThemeContext } from '../ThemeProvider';

interface TimelineTimeDividerProps {
  timeDisplay: TimeDisplay;
  isMobile: boolean;
}

export function TimelineTimeDivider({
  timeDisplay,
  isMobile,
}: TimelineTimeDividerProps) {
  const { theme } = useThemeContext();

  return (
    <div className={`${isMobile ? 'my-4' : 'my-6'} flex justify-center`}>
      <div
        className={`flex items-center gap-2 rounded-full ${isMobile ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'}`}
        style={{
          backgroundColor: theme.mode === 'dark'
            ? 'rgba(55, 65, 81, 0.5)'
            : theme.colors.surface,
          border: `1px solid ${theme.mode === 'dark' ? '#374151' : theme.colors.border}`,
          color: theme.colors.textSecondary,
        }}
      >
        <Clock className="h-3 w-3" />
        <span>{timeDisplay.relative}</span>
      </div>
    </div>
  );
}
