import { useThemeContext } from '../ThemeProvider';

interface TimelineDateDividerProps {
  anchorId: string;
  entryCount: number;
  dateGroup: string;
  isFirst: boolean;
  isMobile: boolean;
}

export function TimelineDateDivider({
  anchorId,
  entryCount,
  dateGroup,
  isFirst,
  isMobile,
}: TimelineDateDividerProps) {
  const { theme } = useThemeContext();

  return (
    <div id={anchorId} className={`${isFirst ? 'mt-0' : isMobile ? 'mt-6' : 'mt-8'} ${isMobile ? 'mb-4' : 'mb-6'} scroll-mt-32`}>
      <div className={`flex items-center ${isMobile ? 'gap-2.5' : 'gap-3'}`}>
        <div
          className={`flex items-center justify-center rounded-full ${isMobile ? 'h-8 w-8' : 'h-10 w-10'}`}
          style={{
            backgroundColor: theme.mode === 'dark'
              ? '#374151'
              : `${theme.colors.primary}10`,
            border: `2px solid ${theme.mode === 'dark' ? '#4b5563' : theme.colors.primary}`,
          }}
        >
          <span
            className={`rounded-full ${isMobile ? 'h-2.5 w-2.5' : 'h-3 w-3'}`}
            style={{ backgroundColor: theme.mode === 'dark' ? '#f9fafb' : theme.colors.primary }}
            aria-hidden="true"
          />
        </div>
        <div className="flex-1">
          <h2
            className={`${isMobile ? 'text-lg' : 'text-xl'} font-bold`}
            style={{
              color: theme.mode === 'dark' ? '#f9fafb' : theme.colors.text,
            }}
          >
            {dateGroup}
          </h2>
          <div className="mt-1 text-xs tracking-[0.12em] uppercase" style={{ color: theme.colors.textSecondary }}>
            {entryCount} 篇记录
          </div>
          <div
            className={`${isMobile ? 'mt-1.5' : 'mt-2'} h-px opacity-20`}
            style={{
              backgroundColor: theme.mode === 'dark' ? '#4b5563' : theme.colors.border,
            }}
          />
        </div>
      </div>
    </div>
  );
}
