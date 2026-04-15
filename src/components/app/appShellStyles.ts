import type { CSSProperties } from 'react';
import type { ThemeConfig } from '../../hooks/useTheme';

export function getShellSurfaceStyle(theme: ThemeConfig): CSSProperties {
  return {
    backgroundColor: theme.mode === 'dark' ? 'rgba(10, 18, 28, 0.58)' : theme.colors.surface,
    border: `1px solid ${theme.colors.border}`,
    boxShadow:
      theme.mode === 'dark'
        ? '0 28px 60px rgba(4, 10, 18, 0.28)'
        : '0 18px 42px rgba(15, 23, 42, 0.08)',
  };
}

export function getMutedSurfaceStyle(theme: ThemeConfig): CSSProperties {
  return {
    backgroundColor: theme.mode === 'dark' ? 'rgba(148, 163, 184, 0.08)' : 'rgba(255, 255, 255, 0.56)',
    border: `1px solid ${theme.colors.border}`,
  };
}

export function getInsetSurfaceStyle(theme: ThemeConfig): CSSProperties {
  return {
    background:
      theme.mode === 'dark'
        ? 'linear-gradient(180deg, rgba(148, 163, 184, 0.06), rgba(148, 163, 184, 0.02))'
        : 'linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.42))',
    border: `1px solid ${theme.colors.border}`,
  };
}

export function getQuietButtonStyle(theme: ThemeConfig): CSSProperties {
  return {
    backgroundColor: theme.mode === 'dark' ? 'rgba(148, 163, 184, 0.12)' : 'rgba(255, 255, 255, 0.72)',
    color: theme.colors.textSecondary,
    border: `1px solid ${theme.colors.border}`,
  };
}

export function getPrimaryButtonStyle(theme: ThemeConfig): CSSProperties {
  return {
    background: `linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.accent})`,
    color: 'white',
    boxShadow: '0 16px 36px rgba(37, 99, 235, 0.2)',
  };
}

export function getPendingPulseStyle(theme: ThemeConfig): CSSProperties {
  return {
    background: `linear-gradient(90deg, ${theme.colors.primary}, ${theme.colors.accent}, ${theme.colors.primary})`,
    backgroundSize: '200% 100%',
    animation: 'search-pulse 1.2s linear infinite',
  };
}
