import type { CSSProperties } from 'react';
import type { ThemeConfig } from '../../hooks/useTheme';

export function getShellSurfaceStyle(theme: ThemeConfig): CSSProperties {
  return {
    backgroundColor: theme.mode === 'dark' ? 'rgba(23, 33, 50, 0.72)' : theme.colors.surface,
    border: `1px solid ${theme.mode === 'dark' ? 'rgba(148, 163, 184, 0.16)' : theme.colors.border}`,
    boxShadow:
      theme.mode === 'dark'
        ? '0 24px 60px rgba(2, 6, 16, 0.5)'
        : '0 18px 42px rgba(15, 23, 42, 0.08)',
  };
}

export function getMutedSurfaceStyle(theme: ThemeConfig): CSSProperties {
  return {
    backgroundColor: theme.mode === 'dark' ? 'rgba(148, 163, 184, 0.1)' : 'rgba(255, 255, 255, 0.56)',
    border: `1px solid ${theme.mode === 'dark' ? 'rgba(148, 163, 184, 0.14)' : theme.colors.border}`,
  };
}

export function getInsetSurfaceStyle(theme: ThemeConfig): CSSProperties {
  return {
    background:
      theme.mode === 'dark'
        ? 'linear-gradient(180deg, rgba(30, 41, 59, 0.68), rgba(30, 41, 59, 0.4))'
        : 'linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.42))',
    border: `1px solid ${theme.mode === 'dark' ? 'rgba(148, 163, 184, 0.14)' : theme.colors.border}`,
  };
}

export function getQuietButtonStyle(theme: ThemeConfig): CSSProperties {
  return {
    backgroundColor: theme.mode === 'dark' ? 'rgba(148, 163, 184, 0.14)' : 'rgba(255, 255, 255, 0.72)',
    color: theme.colors.textSecondary,
    border: `1px solid ${theme.mode === 'dark' ? 'rgba(148, 163, 184, 0.16)' : theme.colors.border}`,
  };
}

export function getPrimaryButtonStyle(theme: ThemeConfig): CSSProperties {
  const glow = theme.mode === 'paper' ? 'rgba(194, 65, 12, 0.24)' : 'rgba(37, 99, 235, 0.22)';
  return {
    background: `linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.accent})`,
    color: 'white',
    boxShadow: `0 16px 36px ${glow}`,
  };
}

export function getPendingPulseStyle(theme: ThemeConfig): CSSProperties {
  return {
    background: `linear-gradient(90deg, ${theme.colors.primary}, ${theme.colors.accent}, ${theme.colors.primary})`,
    backgroundSize: '200% 100%',
    animation: 'search-pulse 1.2s linear infinite',
  };
}
