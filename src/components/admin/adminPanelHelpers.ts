import type { CSSProperties } from 'react';
import type { ThemeConfig } from '../../hooks/useTheme';

export function isUnauthorizedAdminPanelError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('需要管理员权限') || message.includes('访问被拒绝');
}

export function getAdminTextColor(theme: ThemeConfig, type: 'primary' | 'secondary' = 'primary') {
  if (theme.mode === 'dark') {
    return type === 'primary' ? '#f9fafb' : '#94a3b8';
  }

  return type === 'primary' ? theme.colors.text : theme.colors.textSecondary;
}

export function buildAdminPanelStyle(theme: ThemeConfig): CSSProperties {
  return {
    backgroundColor: theme.mode === 'dark' ? '#1f2937' : theme.colors.surface,
    border: `1px solid ${theme.colors.border}`,
    boxShadow: theme.mode === 'dark'
      ? '0 4px 12px rgba(0, 0, 0, 0.4)'
      : '0 4px 12px rgba(0, 0, 0, 0.05)',
    color: theme.mode === 'dark' ? '#f9fafb' : theme.colors.text,
  };
}
