import type { ChangeEvent } from 'react';
import { InlineActionInput, PanelSurface } from './AdminPanelParts';
import type { ThemeConfig } from '../../hooks/useTheme';
import type {
  AdminSettings,
  AdminInterfaceSettings,
  AdminTextColorGetter,
  InterfaceFeatureKey,
  PasswordSettings,
} from './adminPanelTypes';
import { interfaceFeatureSchema } from './adminPanelSettingsSchema';

interface SettingsActionCardProps {
  title: string;
  description: string;
  onClick?: () => void;
  theme: ThemeConfig;
  children?: React.ReactNode;
  asLabel?: boolean;
}

interface SettingsActionCardConfig {
  key: string;
  title: string;
  description: string;
  onClick?: () => void;
  children?: React.ReactNode;
  asLabel?: boolean;
}

interface PrimaryActionsSectionProps {
  settings: AdminSettings;
  theme: ThemeConfig;
  onExportEntries: () => void;
  onImportEntries: (event: ChangeEvent<HTMLInputElement>) => void;
  onRunR2SelfCheck: () => void;
  onTogglePasswordSettings: () => void;
  onToggleHiddenEntries: () => void;
  onToggleWelcomePage: () => void;
}

interface AppSecuritySectionProps {
  theme: ThemeConfig;
  getTextColor: AdminTextColorGetter;
  currentPasswordSettings: PasswordSettings;
  showAppPasswordSettings: boolean;
  newAppPassword: string;
  onToggleAppPasswordProtection: () => void;
  onToggleAppPasswordSettings: () => void;
  onNewAppPasswordChange: (value: string) => void;
  onAppPasswordChange: () => void;
}

interface InterfaceSettingsSectionProps {
  theme: ThemeConfig;
  getTextColor: AdminTextColorGetter;
  interfaceSettings: AdminInterfaceSettings;
  onToggleInterfaceSetting: (key: InterfaceFeatureKey) => void;
}

interface AdminPasswordSectionProps {
  visible: boolean;
  theme: ThemeConfig;
  getTextColor: AdminTextColorGetter;
  newPassword: string;
  onNewPasswordChange: (value: string) => void;
  onPasswordChange: () => void;
}

interface PasswordInputPanelProps {
  theme: ThemeConfig;
  getTextColor: AdminTextColorGetter;
  title: string;
  value: string;
  placeholder: string;
  footerText?: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
}

function SettingsActionCard({
  title,
  description,
  onClick,
  theme,
  children,
  asLabel = false,
}: SettingsActionCardProps) {
  const commonProps = {
    className: 'flex items-center gap-3 p-4 rounded-lg border transition-colors hover:bg-opacity-80',
    style: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      color: theme.colors.text,
    },
  };

  if (asLabel) {
    return (
      <label {...commonProps} style={{ ...commonProps.style, cursor: 'pointer' }}>
        <div className="text-left">
          <div className="font-medium">{title}</div>
          <div className="text-sm" style={{ color: theme.colors.textSecondary }}>
            {description}
          </div>
        </div>
        {children}
      </label>
    );
  }

  return (
    <button type="button" onClick={onClick} {...commonProps}>
      <div className="text-left">
        <div className="font-medium">{title}</div>
        <div className="text-sm" style={{ color: theme.colors.textSecondary }}>
          {description}
        </div>
      </div>
      {children}
    </button>
  );
}

function SettingsActionGrid({
  cards,
  theme,
  className,
}: {
  cards: SettingsActionCardConfig[];
  theme: ThemeConfig;
  className: string;
}) {
  return (
    <div className={className}>
      {cards.map((card) => (
        <SettingsActionCard
          key={card.key}
          title={card.title}
          description={card.description}
          onClick={card.onClick}
          theme={theme}
          asLabel={card.asLabel}
        >
          {card.children}
        </SettingsActionCard>
      ))}
    </div>
  );
}

function PasswordInputPanel({
  theme,
  getTextColor,
  title,
  value,
  placeholder,
  footerText,
  onValueChange,
  onSubmit,
}: PasswordInputPanelProps) {
  return (
    <PanelSurface theme={theme}>
      <h4 className="mb-3 font-medium" style={{ color: getTextColor('primary') }}>
        {title}
      </h4>
      <InlineActionInput
        theme={theme}
        type="password"
        value={value}
        placeholder={placeholder}
        buttonLabel="确认修改"
        onValueChange={onValueChange}
        onSubmit={onSubmit}
      />
      {footerText && (
        <p className="mt-2 text-xs" style={{ color: getTextColor('secondary') }}>
          {footerText}
        </p>
      )}
    </PanelSurface>
  );
}

export function PrimaryActionsSection({
  settings,
  theme,
  onExportEntries,
  onImportEntries,
  onRunR2SelfCheck,
  onTogglePasswordSettings,
  onToggleHiddenEntries,
  onToggleWelcomePage,
}: PrimaryActionsSectionProps) {
  const actionCards: SettingsActionCardConfig[] = [
    {
      key: 'export',
      title: '导出数据',
      description: '备份所有日记',
      onClick: onExportEntries,
    },
    {
      key: 'import',
      title: '导入数据',
      description: '恢复备份文件',
      asLabel: true,
      children: (
        <input
          type="file"
          accept=".json"
          onChange={onImportEntries}
          className="hidden"
        />
      ),
    },
    {
      key: 'password',
      title: '密码设置',
      description: '修改管理密码',
      onClick: onTogglePasswordSettings,
    },
    {
      key: 'r2-self-check',
      title: 'R2 自检',
      description: '检查绑定、写入、读取与删除',
      onClick: onRunR2SelfCheck,
    },
    {
      key: 'hidden',
      title: `${settings.showHiddenEntries ? '隐藏' : '显示'}隐藏内容`,
      description: '切换隐藏内容',
      onClick: onToggleHiddenEntries,
    },
    {
      key: 'welcome',
      title: `${settings.welcomePageEnabled ? '禁用' : '启用'}欢迎页面`,
      description: '控制应用启动时是否显示欢迎页面',
      onClick: onToggleWelcomePage,
    },
  ];

  return (
    <SettingsActionGrid
      cards={actionCards}
      theme={theme}
      className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
    />
  );
}

export function AppSecuritySection({
  theme,
  getTextColor,
  currentPasswordSettings,
  showAppPasswordSettings,
  newAppPassword,
  onToggleAppPasswordProtection,
  onToggleAppPasswordSettings,
  onNewAppPasswordChange,
  onAppPasswordChange,
}: AppSecuritySectionProps) {
  const securityCards: SettingsActionCardConfig[] = [
    {
      key: 'toggle-protection',
      title: `${currentPasswordSettings.enabled ? '关闭' : '开启'}访问密码`,
      description: currentPasswordSettings.enabled ? '允许无密码访问' : '需要密码才能访问应用',
      onClick: onToggleAppPasswordProtection,
    },
    {
      key: 'change-password',
      title: '应用密码设置',
      description: '修改应用访问密码',
      onClick: onToggleAppPasswordSettings,
    },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold" style={{ color: getTextColor('primary') }}>
        应用安全设置
      </h3>

      <SettingsActionGrid
        cards={securityCards}
        theme={theme}
        className="grid grid-cols-1 gap-4 md:grid-cols-3"
      />

      {showAppPasswordSettings && (
        <PasswordInputPanel
          theme={theme}
          getTextColor={getTextColor}
          title="修改应用访问密码"
          value={newAppPassword}
          placeholder="输入新的应用密码（至少6位）"
          footerText={currentPasswordSettings.configured ? '当前已配置访问密码。' : '当前还没有配置访问密码。'}
          onValueChange={onNewAppPasswordChange}
          onSubmit={onAppPasswordChange}
        />
      )}
    </div>
  );
}

export function InterfaceSettingsSection({
  theme,
  getTextColor,
  interfaceSettings,
  onToggleInterfaceSetting,
}: InterfaceSettingsSectionProps) {
  const interfaceCards: SettingsActionCardConfig[] = (Object.entries(interfaceFeatureSchema) as Array<
    [InterfaceFeatureKey, typeof interfaceFeatureSchema[InterfaceFeatureKey]]
  >).map(([key, config]) => ({
    key,
    title: `${interfaceSettings[key].enabled ? '关闭' : '开启'}${config.title}`,
    description: interfaceSettings[key].enabled ? config.enabledDescription : config.disabledDescription,
    onClick: () => onToggleInterfaceSetting(key),
  }));

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold" style={{ color: getTextColor('primary') }}>
        界面设置
      </h3>

      <SettingsActionGrid
        cards={interfaceCards}
        theme={theme}
        className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
      />
    </div>
  );
}

export function AdminPasswordSection({
  visible,
  theme,
  getTextColor,
  newPassword,
  onNewPasswordChange,
  onPasswordChange,
}: AdminPasswordSectionProps) {
  if (!visible) {
    return null;
  }

  return (
    <PasswordInputPanel
      theme={theme}
      getTextColor={getTextColor}
      title="修改管理员密码"
      value={newPassword}
      placeholder="输入新密码（至少6位）"
      onValueChange={onNewPasswordChange}
      onSubmit={onPasswordChange}
    />
  );
}
