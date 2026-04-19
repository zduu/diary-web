import { useState, useEffect } from 'react';

export type ThemeMode = 'light' | 'dark';

export interface ThemeConfig {
  mode: ThemeMode;
  colors: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    accent: string;
  };
  effects: {
    blur: string;
    shadow: string;
    gradient: string;
  };
}

const themes: Record<ThemeMode, ThemeConfig> = {
  light: {
    mode: 'light',
    colors: {
      primary: '#1d4ed8',
      secondary: '#6b7280',
      background: '#f3eee2',
      surface: '#fffdf7',
      text: '#1f2937',
      textSecondary: '#6b7280',
      border: '#d9cfbf',
      accent: '#c2410c',
    },
    effects: {
      blur: 'backdrop-blur-sm',
      shadow: 'shadow-xl',
      gradient: 'bg-gradient-to-br from-stone-50 to-amber-50',
    },
  },
  dark: {
    mode: 'dark',
    colors: {
      primary: '#a5d8ff',
      secondary: '#cbd5e1',
      background: 'transparent',
      surface: 'rgba(10, 18, 28, 0.72)',
      text: '#f8fbff',
      textSecondary: 'rgba(226, 232, 240, 0.84)',
      border: 'rgba(148, 163, 184, 0.24)',
      accent: '#7dd3fc',
    },
    effects: {
      blur: 'backdrop-blur-2xl',
      shadow: 'glass-shadow',
      gradient: 'glass-gradient',
    },
  },
};

function normalizeThemeMode(savedValue: string | null): ThemeMode {
  if (savedValue === 'dark' || savedValue === 'glass') {
    return 'dark';
  }

  return 'light';
}

export function useTheme() {
  const [currentTheme, setCurrentTheme] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('diary-theme');
      return normalizeThemeMode(saved);
    }
    return 'light';
  });

  const theme = themes[currentTheme];

  const applyTheme = (mode: ThemeMode) => {
    const root = document.documentElement;
    const themeConfig = themes[mode];

    Object.entries(themeConfig.colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value);
    });

    root.classList.remove('theme-light', 'theme-dark');
    document.body.classList.remove('theme-light', 'theme-dark');

    const themeClass = `theme-${mode}`;
    root.classList.add(themeClass);
    document.body.classList.add(themeClass);
    root.style.colorScheme = mode;

    const themeColor = mode === 'dark' ? '#0a121c' : '#f3eee2';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor);
  };

  const setTheme = (mode: ThemeMode) => {
    setCurrentTheme(mode);
    localStorage.setItem('diary-theme', mode);
    applyTheme(mode);
  };

  useEffect(() => {
    applyTheme(currentTheme);
  }, [currentTheme]);

  const toggleTheme = () => {
    const modes: ThemeMode[] = ['light', 'dark'];
    const currentIndex = modes.indexOf(currentTheme);
    const nextIndex = (currentIndex + 1) % modes.length;
    setTheme(modes[nextIndex]);
  };

  return {
    theme,
    currentTheme,
    setTheme,
    toggleTheme,
    themes,
  };
}
