import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { useThemeContext } from './ThemeProvider';
import { apiService } from '../services/api';

interface PasswordProtectionProps {
  onAuthenticated: () => void;
}

interface PasswordSettings {
  enabled: boolean;
  password: string;
}



export function PasswordProtection({ onAuthenticated }: PasswordProtectionProps) {
  const { theme } = useThemeContext();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [passwordSettings, setPasswordSettings] = useState<PasswordSettings>({
    enabled: false,
    password: 'diary123'
  });



  // 从后端加载密码设置
  const loadPasswordSettings = async () => {
    try {
      const settings = await apiService.getAllSettings();
      const newPasswordSettings = {
        enabled: settings.app_password_enabled === 'true',
        password: settings.app_password || 'diary123'
      };
      setPasswordSettings(newPasswordSettings);



      // 如果没有启用密码保护，直接通过验证
      if (!newPasswordSettings.enabled) {
        onAuthenticated();
      }
    } catch (error) {
      console.error('加载密码设置失败:', error);
      // 如果后端加载失败，尝试从localStorage加载
      const localSettings = localStorage.getItem('diary-password-settings');
      if (localSettings) {
        try {
          const parsed = JSON.parse(localSettings);
          setPasswordSettings(parsed);
          if (!parsed.enabled) {
            onAuthenticated();
          }
        } catch (parseError) {
          console.error('解析本地密码设置失败:', parseError);
          // 解析失败时使用默认设置（启用密码保护）
          setPasswordSettings({
            enabled: true,
            password: 'diary123'
          });
        }
      } else {
        // 没有本地设置时使用默认设置（启用密码保护）
        setPasswordSettings({
          enabled: true,
          password: 'diary123'
        });
      }
    }
  };

  // 组件挂载时加载设置
  useEffect(() => {
    loadPasswordSettings();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // 模拟验证延迟
    await new Promise(resolve => setTimeout(resolve, 500));

    if (password === passwordSettings.password) {
      // 记录已通过验证的状态，刷新后免输密码
      try {
        localStorage.setItem('diary-app-authenticated', 'true');
      } catch {}
      onAuthenticated();
    } else {
      setError('密码错误，请重试');
      setPassword('');
    }

    setIsLoading(false);
  };

  // 如果密码保护未启用，不显示此组件
  if (!passwordSettings.enabled) {
    return null;
  }

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        backgroundColor: 'transparent', // 完全透明，让欢迎页面作为背景
        backdropFilter: 'blur(2px) brightness(0.8)', // 轻微模糊和降低亮度，但保持透明
        boxSizing: 'border-box'
      }}
    >
      {/* 轻微的遮罩以提高密码框的可读性 */}
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.1)',
          backdropFilter: 'blur(1px)'
        }}
      />
      
      <div
        className={`w-full max-w-lg mx-4 sm:mx-6 md:mx-8 lg:max-w-xl xl:max-w-xl rounded-xl p-6 sm:p-8 md:p-10 ${theme.effects.blur} relative z-10`}
        style={{
          backgroundColor: theme.mode === 'glass' ? undefined : theme.colors.surface,
          border: theme.mode === 'glass' ? undefined : `1px solid ${theme.colors.border}`,
        }}
      >
        <div className="text-center mb-8">
          <div
            className="w-16 h-16 sm:w-18 sm:h-18 md:w-20 md:h-20 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6"
            style={{
              backgroundColor: theme.mode === 'glass' 
                ? 'rgba(255, 255, 255, 0.2)' 
                : `${theme.colors.primary}20`
            }}
          >
            <Lock
              className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10"
              style={{ 
                color: theme.mode === 'glass' ? 'white' : theme.colors.primary 
              }} 
            />
          </div>
          <h2
            className="text-xl sm:text-2xl md:text-3xl font-bold mb-2 sm:mb-3"
            style={{ 
              color: theme.mode === 'glass' ? 'white' : theme.colors.text,
              textShadow: theme.mode === 'glass' ? '0 2px 4px rgba(0, 0, 0, 0.3)' : 'none'
            }}
          >
            访问验证
          </h2>
          <p
            className="text-sm sm:text-base"
            style={{ 
              color: theme.mode === 'glass' ? 'rgba(255, 255, 255, 0.8)' : theme.colors.textSecondary,
              textShadow: theme.mode === 'glass' ? '0 1px 2px rgba(0, 0, 0, 0.3)' : 'none'
            }}
          >
            请输入密码以访问日记应用
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入访问密码"
              className="w-full px-4 py-3 pr-12 sm:px-6 sm:py-4 sm:pr-14 rounded-lg border focus:outline-none focus:ring-2 transition-all text-base sm:text-lg"
              style={{
                backgroundColor: theme.mode === 'glass' 
                  ? 'rgba(255, 255, 255, 0.1)' 
                  : theme.colors.surface,
                borderColor: error 
                  ? '#ef4444' 
                  : (theme.mode === 'glass' ? 'rgba(255, 255, 255, 0.3)' : theme.colors.border),
                color: theme.mode === 'glass' ? 'white' : theme.colors.text,
              }}
              required
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 sm:right-4 top-1/2 transform -translate-y-1/2 p-1 rounded"
              style={{
                color: theme.mode === 'glass' ? 'rgba(255, 255, 255, 0.7)' : theme.colors.textSecondary
              }}
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
            className="w-full py-3 sm:py-4 rounded-lg font-medium text-base sm:text-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: theme.mode === 'glass'
                ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.9) 0%, rgba(139, 92, 246, 0.9) 100%)'
                : theme.colors.primary,
              color: 'white',
              border: theme.mode === 'glass' ? '1px solid rgba(255, 255, 255, 0.3)' : 'none',
              backdropFilter: theme.mode === 'glass' ? 'blur(10px)' : 'none',
              boxShadow: theme.mode === 'glass'
                ? '0 8px 32px rgba(168, 85, 247, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                : undefined,
              textShadow: theme.mode === 'glass' ? '0 1px 2px rgba(0, 0, 0, 0.3)' : 'none'
            }}
          >
            {isLoading ? '验证中...' : '进入应用'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p 
            className="text-xs"
            style={{ 
              color: theme.mode === 'glass' ? 'rgba(255, 255, 255, 0.6)' : theme.colors.textSecondary,
              textShadow: theme.mode === 'glass' ? '0 1px 2px rgba(0, 0, 0, 0.3)' : 'none'
            }}
          >
            密码保护可在管理员面板中关闭
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
