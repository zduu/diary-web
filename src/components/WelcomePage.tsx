import { type CSSProperties } from 'react';
import {
  BookOpen,
  Calendar,
  Cloud,
  Heart,
  Lock,
  MapPin,
  Palette,
  Sparkles,
} from 'lucide-react';
import { useThemeContext } from './ThemeProvider';
import { ThemeToggle } from './ThemeToggle';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  getInsetSurfaceStyle,
  getMutedSurfaceStyle,
  getPrimaryButtonStyle,
  getShellSurfaceStyle,
} from './app/appShellStyles';

interface WelcomePageProps {
  onEnterApp?: () => void;
  hasPasswordProtection?: boolean;
  isBackground?: boolean;
  isTransitioningToApp?: boolean;
}

const features = [
  {
    icon: BookOpen,
    title: '专注记录',
    description: '把日常、想法和片段写得更清楚，界面尽量少打断你。',
  },
  {
    icon: Heart,
    title: '情绪留痕',
    description: '心情、天气、标签和地点一起保存，回看时更有温度。',
  },
  {
    icon: Calendar,
    title: '时间回溯',
    description: '卡片、时间轴和归纳视图之间切换，翻阅成本更低。',
  },
  {
    icon: MapPin,
    title: '场景感',
    description: '位置和图片都能带回当时的环境，而不只是几行文字。',
  },
];

const highlights = [
  { label: '记录方式', value: 'Markdown + 图片' },
  { label: '浏览方式', value: '时间轴 / 归纳 / 卡片' },
  { label: '空间气质', value: '纸页、夜读' },
];

export function WelcomePage({
  onEnterApp,
  hasPasswordProtection,
  isBackground,
  isTransitioningToApp,
}: WelcomePageProps) {
  const { theme } = useThemeContext();
  const isMobile = useIsMobile();
  const visibleFeatures = isMobile ? features.slice(0, 2) : features;
  const visibleHighlights = isMobile ? highlights.slice(0, 2) : highlights;

  const panelStyle: CSSProperties = getShellSurfaceStyle(theme);
  const mutedPanelStyle: CSSProperties = getMutedSurfaceStyle(theme);
  const archivePanelStyle: CSSProperties = getInsetSurfaceStyle(theme);

  const titleStyle: CSSProperties = {
    color: theme.colors.text,
    letterSpacing: '-0.04em',
  };

  const subTextStyle: CSSProperties = {
    color: theme.colors.textSecondary,
  };

  const ctaStyle: CSSProperties = getPrimaryButtonStyle(theme);

  const opacity = isBackground ? 1 : isTransitioningToApp ? 0.3 : 1;
  const transform = isBackground ? 'scale(1)' : isTransitioningToApp ? 'scale(0.985)' : 'scale(1)';
  const filter = isBackground ? 'none' : isTransitioningToApp ? 'blur(2px)' : 'none';

  return (
    <div
      className={`welcome-page ${isBackground || isTransitioningToApp ? 'pointer-events-none' : ''}`}
      style={{
        minHeight: '100vh',
        backgroundColor: theme.colors.background,
        opacity,
        transform,
        filter,
        transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {!isMobile && <div className="subtle-grid" />}

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            theme.mode === 'dark'
              ? 'radial-gradient(circle at top left, rgba(59, 130, 246, 0.08), transparent 34%), radial-gradient(circle at bottom right, rgba(99, 102, 241, 0.06), transparent 28%)'
              : 'radial-gradient(circle at top left, rgba(59, 130, 246, 0.05), transparent 30%), radial-gradient(circle at bottom right, rgba(245, 158, 11, 0.05), transparent 26%)',
        }}
      />

      <div
        className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 md:px-6 md:py-8"
        style={{
          paddingTop: isMobile ? 'max(1rem, var(--safe-area-top))' : undefined,
          paddingBottom: isMobile ? 'calc(1rem + var(--safe-area-bottom))' : undefined,
        }}
      >
        <header className="welcome-panel mb-6 flex items-center justify-between rounded-3xl px-4 py-3 md:px-5" style={panelStyle}>
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-2xl"
              style={{
                backgroundColor: theme.colors.primary,
                color: '#fff',
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.25)',
              }}
            >
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: theme.colors.text }}>
                我的日记
              </div>
              <div className="text-xs" style={subTextStyle}>
                安静的记录入口
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <div
              className="hidden items-center gap-2 rounded-full px-3 py-1.5 text-xs md:flex md:text-sm"
              style={mutedPanelStyle}
            >
              {hasPasswordProtection ? <Lock className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              <span style={{ color: theme.colors.text }}>
                {hasPasswordProtection ? '已启用访问保护' : '直接进入'}
              </span>
            </div>
            <ThemeToggle />
          </div>
        </header>

        <main className="grid flex-1 gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="welcome-panel rounded-[2rem] p-6 md:p-8" style={panelStyle}>
            <div
              className="mb-5 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em]"
              style={{
                ...mutedPanelStyle,
                color: theme.colors.primary,
              }}
            >
              <Palette className="h-4 w-4" />
              diary archive room
            </div>

            <h1
              className={`${isMobile ? 'text-4xl' : 'text-6xl'} max-w-3xl font-semibold leading-[1.02]`}
              style={titleStyle}
            >
              把一天留住，
              <br />
              但不把界面做重。
            </h1>

            <p
              className={`${isMobile ? 'mt-4 text-[15px]' : 'mt-5 text-lg'} max-w-2xl leading-8`}
              style={subTextStyle}
            >
              {isMobile
                ? '先把入口收窄，再把阅读、记录和回看留给正文区域。'
                : '这里不是一个展示功能清单的首页，而是进入内容之前的一小段缓冲。它先把界面噪音压低，再把记录、检索、归档和回看这些真正有用的能力交给你。'}
            </p>

            <div className={`mt-6 grid gap-3 ${isMobile ? 'grid-cols-2' : 'sm:grid-cols-3'}`}>
              {visibleHighlights.map((item) => (
                <div key={item.label} className="rounded-2xl p-4" style={archivePanelStyle}>
                  <div className="mb-1 text-xs tracking-[0.14em]" style={subTextStyle}>
                    {item.label}
                  </div>
                  <div className="text-sm font-semibold md:text-base" style={{ color: theme.colors.text }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              {onEnterApp && (
                <button
                  onClick={onEnterApp}
                  disabled={isTransitioningToApp}
                  className="primary-button rounded-2xl px-5 py-3 text-sm font-semibold text-white transition-transform duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                  style={ctaStyle}
                >
                  {isTransitioningToApp
                    ? '正在进入...'
                    : hasPasswordProtection
                      ? '前往验证'
                      : '进入日记'}
                </button>
              )}

              <div className="text-sm" style={subTextStyle}>
                {hasPasswordProtection
                  ? '进入前先完成一次验证。'
                  : '进入后直接开始阅读和记录。'}
              </div>
            </div>
          </section>

          <section className="grid gap-5">
            <div className="welcome-panel rounded-[2rem] p-5 md:p-6" style={panelStyle}>
              <div className="mb-4 text-sm font-semibold uppercase tracking-[0.16em]" style={subTextStyle}>
                Key Pieces
              </div>
              <div className="grid gap-3">
                {visibleFeatures.map((feature) => (
                  <div key={feature.title} className="rounded-2xl p-4" style={archivePanelStyle}>
                    <div className="mb-3 flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-2xl"
                        style={{
                          backgroundColor: theme.mode === 'dark' ? '#374151' : '#eff6ff',
                          color: theme.mode === 'dark' ? '#f9fafb' : '#3b82f6',
                        }}
                      >
                        <feature.icon className="h-5 w-5" />
                      </div>
                      <div className="text-base font-semibold" style={{ color: theme.colors.text }}>
                        {feature.title}
                      </div>
                    </div>
                    <p className="text-sm leading-7" style={subTextStyle}>
                      {feature.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {!isMobile && (
            <div className="welcome-panel rounded-[2rem] p-5 md:p-6" style={panelStyle}>
              <div className="mb-4 flex items-center gap-2">
                <Cloud className="h-4 w-4" style={{ color: theme.colors.primary }} />
                <div className="text-sm font-semibold uppercase tracking-[0.16em]" style={subTextStyle}>
                  Reading Mood
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div className="rounded-2xl p-4" style={archivePanelStyle}>
                  <div className="mb-2 text-sm font-semibold" style={{ color: theme.colors.text }}>
                    更少装饰，更久耐看
                  </div>
                  <div className="text-sm leading-7" style={subTextStyle}>
                    阅读前看到的首先应该是秩序，而不是一堆强动效、强装饰和按钮竞争注意力。
                  </div>
                </div>
                <div className="rounded-2xl p-4" style={archivePanelStyle}>
                  <div className="mb-2 text-sm font-semibold" style={{ color: theme.colors.text }}>
                    仍然保留辨识度
                  </div>
                  <div className="text-sm leading-7" style={subTextStyle}>
                    浅色更像纸页，夜读主题保留雾面层次和安静氛围，但不再额外拆出一套旧深色皮肤。
                  </div>
                </div>
              </div>
            </div>
            )}
          </section>
        </main>

        <footer
          className={`mt-5 grid gap-3 rounded-[2rem] px-4 py-4 text-sm ${isMobile ? 'grid-cols-1' : 'md:grid-cols-3'}`}
          style={panelStyle}
        >
          <div style={subTextStyle}>写下当天，而不是管理复杂界面。</div>
          {!isMobile && <div style={subTextStyle}>真正重要的是内容、回看效率和稳定输入。</div>}
          {!isMobile && <div style={subTextStyle}>入口页退后一步，正文页就能更干净地站出来。</div>}
        </footer>
      </div>
    </div>
  );
}
