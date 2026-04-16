import { Suspense, lazy } from 'react';
import { BookOpen, Plus, RefreshCw, Settings } from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useThemeContext } from '../ThemeProvider';
import { getPrimaryButtonStyle, getQuietButtonStyle, getShellSurfaceStyle } from './appShellStyles';

const ThemeToggle = lazy(() =>
  import('../ThemeToggle').then((module) => ({ default: module.ThemeToggle }))
);

interface AppHeaderProps {
  isAdminAuthenticated: boolean;
  isAdminPanelOpen: boolean;
  loading: boolean;
  onOpenAdminPanel: () => void;
  onOpenNewEntry: () => void;
  onRefreshEntries: () => void;
}

export function AppHeader({
  isAdminAuthenticated,
  isAdminPanelOpen,
  loading,
  onOpenAdminPanel,
  onOpenNewEntry,
  onRefreshEntries,
}: AppHeaderProps) {
  const { theme } = useThemeContext();
  const isMobile = useIsMobile();
  const shellSurfaceStyle = getShellSurfaceStyle(theme);
  const quietButtonStyle = getQuietButtonStyle(theme);
  const primaryButtonStyle = getPrimaryButtonStyle(theme);
  const controlButtons = (
    <>
      <div>
        <Suspense fallback={null}>
          <ThemeToggle />
        </Suspense>
      </div>

      <button
        type="button"
        onClick={onOpenAdminPanel}
        aria-label="打开管理员面板"
        aria-haspopup="dialog"
        aria-expanded={isAdminPanelOpen}
        className={`${isMobile ? 'rounded-lg p-2' : 'rounded-xl p-2.5'} transition-transform duration-200 hover:-translate-y-0.5`}
        style={quietButtonStyle}
        title="管理员面板"
      >
        <Settings className={`${isMobile ? 'h-4 w-4' : 'h-5 w-5'}`} />
      </button>

      <button
        type="button"
        onClick={onRefreshEntries}
        disabled={loading}
        aria-label={loading ? '正在刷新日记内容' : '刷新日记内容'}
        aria-busy={loading}
        className={`${isMobile ? 'rounded-lg p-2' : 'rounded-xl p-2.5'} transition-transform duration-200 hover:-translate-y-0.5 disabled:opacity-50`}
        style={quietButtonStyle}
        title="刷新"
      >
        <RefreshCw className={`${isMobile ? 'h-4 w-4' : 'h-5 w-5'} ${loading ? 'animate-spin' : ''}`} />
      </button>
    </>
  );

  return (
    <header className="sticky top-0 z-30 border-b border-transparent">
      <div
        className={`mx-auto max-w-6xl ${isMobile ? 'px-3 pt-2.5' : 'px-4 pt-4 md:px-6'}`}
        style={{ paddingTop: isMobile ? 'max(0.5rem, var(--safe-area-top))' : undefined }}
      >
        <div
          className={`app-header ${isMobile ? 'rounded-[1.3rem] px-3 py-2' : 'rounded-[1.9rem] px-4 py-3 md:px-5 md:py-4'} ${theme.effects.blur}`}
          style={shellSurfaceStyle}
        >
          <div className={`flex ${isMobile ? 'flex-col gap-2' : 'flex-col gap-4 md:flex-row md:items-center md:justify-between'}`}>
            <div className={`flex items-center ${isMobile ? 'justify-between gap-3' : 'gap-2 md:gap-4'}`}>
              <div className={`flex min-w-0 items-center ${isMobile ? 'gap-2.5' : 'gap-2 md:gap-4'}`}>
              <div
                className={`${isMobile ? 'rounded-xl p-1.5' : 'rounded-2xl p-2 md:p-3'}`}
                style={{ background: `linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.accent})` }}
              >
                <BookOpen className={`${isMobile ? 'h-5 w-5' : 'h-6 w-6 md:h-8 md:w-8'}`} style={{ color: 'white' }} />
              </div>

              <div className="min-w-0">
                <h1
                  className={`${isMobile ? 'text-lg' : 'text-xl md:text-3xl'} font-semibold tracking-[-0.04em]`}
                  style={{ color: theme.colors.text }}
                >
                  我的日记
                </h1>
                <p className={`${isMobile ? 'block text-[11px]' : 'hidden text-xs sm:block md:text-sm'}`} style={{ color: theme.colors.textSecondary }}>
                  记录生活，留住美好，也让界面轻一点
                </p>
              </div>
            </div>

              {isMobile && (
                <div className="flex items-center gap-1.5">
                  {controlButtons}
                </div>
              )}
            </div>

            <div className={`flex items-center ${isMobile ? 'gap-2' : 'flex-wrap gap-2 md:gap-3 md:justify-end'}`}>
              {isAdminAuthenticated && (
                <button
                  type="button"
                  onClick={onOpenNewEntry}
                  aria-label="新建日记"
                  className={`flex items-center justify-center gap-2 font-semibold transition-transform duration-200 hover:-translate-y-0.5 ${
                    isMobile
                      ? 'flex-1 rounded-xl px-3 py-2 text-sm'
                      : 'order-1 flex-1 rounded-2xl px-4 py-2.5 text-sm sm:flex-none md:order-none md:px-5 md:py-3 md:text-base'
                  }`}
                  style={primaryButtonStyle}
                >
                  <Plus className={`${isMobile ? 'h-4 w-4' : 'h-4 w-4 md:h-5 md:w-5'}`} />
                  <span className={`${isMobile ? 'text-sm' : 'text-sm md:text-base'}`}>写日记</span>
                </button>
              )}

              {!isMobile && controlButtons}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
