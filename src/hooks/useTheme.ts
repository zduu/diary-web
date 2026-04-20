import { useState, useEffect } from 'react';

export type ThemeMode = 'light' | 'paper' | 'dark';

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
      primary: '#3b82f6',
      secondary: '#64748b',
      background: '#f9fafb',
      surface: '#ffffff',
      text: '#111827',
      textSecondary: '#64748b',
      border: '#e5e7eb',
      accent: '#6366f1',
    },
    effects: {
      blur: 'backdrop-blur-sm',
      shadow: 'shadow-md',
      gradient: 'bg-white',
    },
  },
  paper: {
    mode: 'paper',
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
      shadow: 'shadow-lg',
      gradient: 'bg-gradient-to-br from-stone-50 to-amber-50',
    },
  },
  dark: {
    mode: 'dark',
    colors: {
      primary: '#60a5fa',
      secondary: '#94a3b8',
      background: '#111827',
      surface: '#1f2937',
      text: '#f9fafb',
      textSecondary: '#94a3b8',
      border: '#374151',
      accent: '#818cf8',
    },
    effects: {
      blur: 'backdrop-blur-xl',
      shadow: 'shadow-xl',
      gradient: 'bg-gray-800',
    },
  },
};

function normalizeThemeMode(savedValue: string | null): ThemeMode {
  if (savedValue === 'dark') {
    return 'dark';
  }
  if (savedValue === 'paper') {
    return 'paper';
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

    root.classList.remove('theme-light', 'theme-paper', 'theme-dark');
    document.body.classList.remove('theme-light', 'theme-paper', 'theme-dark');

    const themeClass = `theme-${mode}`;
    root.classList.add(themeClass);
    document.body.classList.add(themeClass);
    root.style.colorScheme = mode === 'dark' ? 'dark' : 'light';

    const themeColor = mode === 'dark' ? '#111827' : mode === 'paper' ? '#f3eee2' : '#f9fafb';
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
    const modes: ThemeMode[] = ['light', 'paper', 'dark'];
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
