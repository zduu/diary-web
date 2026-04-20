import React, { useState, useEffect, useRef } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { ModalShell } from './ModalShell';
import { useThemeContext } from './ThemeProvider';
import { apiService } from '../services/api';

interface PasswordProtectionProps {
  onAuthenticated: () => void;
  passwordSettings: PasswordSettings;
}

interface PasswordSettings {
  enabled: boolean;
}



export function PasswordProtection({ onAuthenticated, passwordSettings }: PasswordProtectionProps) {
  const { theme } = useThemeContext();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const isMountedRef = useRef(true);

  const safeSetError = (nextError: string) => {
    if (!isMountedRef.current) {
      return;
    }

    setError(nextError);
  };

  const safeSetPassword = (nextPassword: string) => {
    if (!isMountedRef.current) {
      return;
    }

    setPassword(nextPassword);
  };

  const safeSetIsLoading = (nextLoading: boolean) => {
    if (!isMountedRef.current) {
      return;
    }

    setIsLoading(nextLoading);
  };
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!passwordSettings.enabled) {
      onAuthenticated();
    }
  }, [onAuthenticated, passwordSettings.enabled]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    safeSetIsLoading(true);
    safeSetError('');

    try {
      await apiService.loginApp(password);
      onAuthenticated();
    } catch (error) {
      safeSetError(error instanceof Error ? error.message : '验证失败，请重试');
      safeSetPassword('');
    } finally {
      safeSetIsLoading(false);
    }
  };

  // 如果密码保护未启用，不显示此组件
  if (!passwordSettings.enabled) {
    return null;
  }

  const shellStyle = {
    backgroundColor: theme.mode === 'dark' ? '#1f2937' : theme.colors.surface,
    border: `1px solid ${theme.colors.border}`,
    boxShadow:
      theme.mode === 'dark'
        ? '0 4px 12px rgba(0, 0, 0, 0.4)'
        : '0 4px 12px rgba(0, 0, 0, 0.1)',
  };

  const fieldStyle = {
    backgroundColor: theme.mode === 'dark' ? '#111827' : '#f9fafb',
    border: `1px solid ${theme.colors.border}`,
    color: theme.colors.text,
  };

  return (
    <ModalShell
      isOpen={passwordSettings.enabled}
      zIndex={9999}
      closeOnBackdropClick={false}
      backdropStyle={{
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
      }}
      panelClassName={`relative z-10 mx-4 w-full max-w-xl rounded-[2rem] p-6 sm:mx-6 sm:p-8 md:mx-8 md:p-10`}
      panelStyle={shellStyle}
    >
      <div className="relative z-10">
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs uppercase tracking-[0.18em]"
            style={{
              backgroundColor: theme.mode === 'dark' ? '#374151' : '#f3f4f6',
              border: `1px solid ${theme.colors.border}`,
              color: theme.colors.primary,
            }}
          >
            <Lock className="h-3.5 w-3.5" />
            Archive Access
          </div>

          <div
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl sm:h-18 sm:w-18 md:h-20 md:w-20"
            style={{
              backgroundColor: theme.colors.primary,
              color: '#ffffff',
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.25)',
            }}
          >
            <Lock className="h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10" />
          </div>

          <h2
            className="mb-2 text-xl font-semibold tracking-[-0.04em] sm:text-2xl md:text-3xl"
            style={{ color: theme.colors.text }}
          >
            进入日记前，先确认是你。
          </h2>
          <p
            className="text-sm sm:text-base"
            style={{ color: theme.colors.textSecondary }}
          >
            这一步只负责验证访问权限，不会打断后续的阅读与记录。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              autoComplete="current-password"
              enterKeyHint="done"
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入访问密码"
              className="w-full rounded-2xl border px-4 py-3 pr-12 text-base outline-none transition-all sm:px-6 sm:py-4 sm:pr-14 sm:text-lg"
              style={{
                ...fieldStyle,
                borderColor: error ? '#ef4444' : theme.colors.border,
              }}
              required
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 sm:right-4 top-1/2 transform -translate-y-1/2 p-1 rounded"
              style={{ color: theme.colors.textSecondary }}
            >
              {showPassword ? <EyeOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Eye className="w-5 h-5 sm:w-6 sm:h-6" />}
            </button>
          </div>

          {error && (
            <div 
              className="text-sm text-center p-3 rounded-lg"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.3)'
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !password.trim()}
            className="primary-button w-full rounded-2xl py-3 text-base font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 sm:py-4 sm:text-lg"
            style={{
              backgroundColor: theme.colors.primary,
              color: 'white',
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.25)',
            }}
          >
            {isLoading ? '验证中...' : '进入应用'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-xs leading-6" style={{ color: theme.colors.textSecondary }}>
            密码保护可在管理员面板中关闭。验证通过后会由服务端会话保持登录状态。
          </p>
        </div>
      </div>
    </ModalShell>
  );
}
