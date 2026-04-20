import { useThemeContext } from './ThemeProvider';

const themeNames = {
  light: '日读',
  paper: '纸页',
  dark: '夜读',
};

const themeAccents = {
  light: '#3b82f6',
  paper: '#f59e0b',
  dark: '#60a5fa',
};

export function ThemeToggle() {
  const { currentTheme, toggleTheme } = useThemeContext();
  const nextThemeMode = (() => {
    if (currentTheme === 'light') return 'paper';
    if (currentTheme === 'paper') return 'dark';
    return 'light';
  })();
  const nextThemeName = themeNames[nextThemeMode];
  const themeAccent = themeAccents[currentTheme];

  return (
    <button
      onClick={toggleTheme}
      aria-label={`当前主题 ${themeNames[currentTheme]}，点击切换到 ${nextThemeName}`}
      aria-description="主题切换按钮，会在日读、纸页和夜读之间循环切换。"
      className="group relative flex items-center gap-1.5 rounded-xl px-2.5 py-2 transition-transform duration-200 hover:-translate-y-0.5 md:gap-2 md:rounded-2xl md:px-3"
      style={{
        backgroundColor: 'var(--color-surface)',
        color: 'var(--color-primary)',
        border: '1px solid var(--color-border)',
      }}
      title={`当前: ${themeNames[currentTheme]} (点击切换)`}
    >
      <span
        className="h-2 w-2 rounded-full transition-transform duration-300 group-hover:scale-110 md:h-2.5 md:w-2.5"
        style={{ backgroundColor: themeAccent }}
        aria-hidden="true"
      />
      <span className="hidden text-sm font-medium md:inline">{themeNames[currentTheme]}</span>

      {/* 主题指示器 */}
      <div className="absolute -right-1 -top-1 hidden h-2.5 w-2.5 rounded-full border-2 border-white md:block md:h-3 md:w-3">
        <div className="w-full h-full rounded-full" style={{ backgroundColor: themeAccent }} />
      </div>
    </button>
  );
}
