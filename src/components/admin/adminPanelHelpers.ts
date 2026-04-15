import type { CSSProperties } from 'react';
import type { ThemeConfig } from '../../hooks/useTheme';

export function isUnauthorizedAdminPanelError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('需要管理员权限') || message.includes('访问被拒绝');
}

export function getAdminTextColor(theme: ThemeConfig, type: 'primary' | 'secondary' = 'primary') {
  if (theme.mode === 'dark') {
    return type === 'primary' ? '#f1f5f9' : 'rgba(241, 245, 249, 0.8)';
  }

  return type === 'primary' ? theme.colors.text : theme.colors.textSecondary;
}

export function buildAdminPanelStyle(theme: ThemeConfig): CSSProperties {
  return {
    backgroundColor: theme.mode === 'dark' ? 'rgba(15, 23, 42, 0.95)' : theme.colors.surface,
    border: theme.mode === 'dark' ? '1px solid rgba(99, 102, 241, 0.3)' : `1px solid ${theme.colors.border}`,
    backdropFilter: theme.mode === 'dark' ? 'blur(20px)' : 'none',
    boxShadow: theme.mode === 'dark'
      ? '0 8px 32px rgba(0, 0, 0, 0.3), 0 0 20px rgba(99, 102, 241, 0.2)'
      : '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    color: theme.mode === 'dark' ? '#f1f5f9' : theme.colors.text,
  };
}
