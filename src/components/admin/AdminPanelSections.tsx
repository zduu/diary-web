import type { ChangeEvent } from 'react';
import { InlineActionInput, PanelSurface } from './AdminPanelParts';
import type { ThemeConfig } from '../../hooks/useTheme';
import type { AdminAccessProfile } from '../../services/apiTypes.ts';
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
  isNativeApp: boolean;
  syncDescription: string;
  isSyncingToRemote: boolean;
  showAdminPasswordAction: boolean;
  onSyncToRemote: () => void;
  onExportEntries: () => void;
  onImportEntries: (event: ChangeEvent<HTMLInputElement>) => void;
  onRunR2SelfCheck: () => void;
  onTogglePasswordSettings: () => void;
  onToggleHiddenEntries: () => void;
  onToggleWelcomePage: () => void;
}

interface SyncSettingsSectionProps {
  theme: ThemeConfig;
  getTextColor: AdminTextColorGetter;
  accessProfile: AdminAccessProfile | null;
  isNativeApp: boolean;
  remoteSyncBaseUrl: string;
  remoteSyncToken: string;
  remoteAdminPassword: string;
  syncLocalEntriesOnBind: boolean;
  showRemoteBindingForm: boolean;
  isBindingRemote: boolean;
  onRemoteSyncBaseUrlChange: (value: string) => void;
  onRemoteSyncTokenChange: (value: string) => void;
  onRemoteAdminPasswordChange: (value: string) => void;
  onSyncLocalEntriesOnBindChange: (value: boolean) => void;
  onShowRemoteBindingForm: () => void;
  onHideRemoteBindingForm: () => void;
  onBindRemoteSubmit: () => void;
  onUnbindRemote: () => void;
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

interface RemoteBindingFormProps {
  theme: ThemeConfig;
  getTextColor: AdminTextColorGetter;
  remoteBound: boolean;
  remoteSyncBaseUrl: string;
  remoteSyncToken: string;
  remoteAdminPassword: string;
  syncLocalEntriesOnBind: boolean;
  isBindingRemote: boolean;
  onRemoteSyncBaseUrlChange: (value: string) => void;
  onRemoteSyncTokenChange: (value: string) => void;
  onRemoteAdminPasswordChange: (value: string) => void;
  onSyncLocalEntriesOnBindChange: (value: boolean) => void;
  onSubmit: () => void;
  onCancel?: () => void;
}

function SettingsActionCard({
  title,
  description,
  onClick,
  theme,
  children,
  asLabel = false,
}: SettingsActionCardProps) {
  const baseClassName = 'flex flex-col items-start gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-opacity-80 sm:flex-row sm:items-center';
  const commonProps = {
    className: baseClassName,
    style: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      color: theme.colors.text,
    },
  };

  if (asLabel) {
    return (
      <label {...commonProps} style={{ ...commonProps.style, cursor: 'pointer' }}>
        <div className="flex-1 text-left">
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
      <div className="flex-1 text-left">
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

function BindingStateBadge({
  theme,
  remoteBound,
}: {
  theme: ThemeConfig;
  remoteBound: boolean;
}) {
  return (
    <span
      className="inline-flex rounded-full px-2.5 py-1 text-xs font-medium"
      style={{
        backgroundColor: remoteBound 
          ? (theme.mode === 'dark' ? '#064e3b' : 'rgba(34, 197, 94, 0.14)')
          : (theme.mode === 'dark' ? '#374151' : 'rgba(148, 163, 184, 0.14)'),
        color: remoteBound 
          ? (theme.mode === 'dark' ? '#6ee7b7' : '#16a34a')
          : theme.colors.textSecondary,
      }}
    >
      {remoteBound ? '已绑定远程' : '未绑定远程'}
    </span>
  );
}

function RemoteBindingForm({
  theme,
  getTextColor,
  remoteBound,
  remoteSyncBaseUrl,
  remoteSyncToken,
  remoteAdminPassword,
  syncLocalEntriesOnBind,
  isBindingRemote,
  onRemoteSyncBaseUrlChange,
  onRemoteSyncTokenChange,
  onRemoteAdminPasswordChange,
  onSyncLocalEntriesOnBindChange,
  onSubmit,
  onCancel,
}: RemoteBindingFormProps) {
  const submitLabel = isBindingRemote
    ? (remoteBound ? '重新绑定中' : '绑定中')
    : (remoteBound ? '重新绑定并登录' : '绑定并登录');

  return (
    <div className="space-y-3 rounded-xl border p-4" style={{ borderColor: theme.colors.border }}>
      <div>
        <h4 className="font-medium" style={{ color: getTextColor('primary') }}>
          {remoteBound ? '重新绑定远程' : '绑定远程'}
        </h4>
        <p className="mt-1 text-sm" style={{ color: getTextColor('secondary') }}>
          绑定会校验线上地址、同步令牌和远程管理员密码。完成后，本机管理员登录将改为使用与远程一致的管理员密码。
        </p>
      </div>

      <div className="space-y-3">
        <input
          type="url"
          value={remoteSyncBaseUrl}
          onChange={(event) => onRemoteSyncBaseUrlChange(event.target.value)}
          placeholder="https://你的-pages-域名.pages.dev"
          className="w-full rounded-lg border px-3 py-2"
          style={{
            backgroundColor: theme.mode === 'dark' ? '#111827' : theme.colors.surface,
            borderColor: theme.colors.border,
            color: theme.colors.text,
          }}
        />
        <input
          type="password"
          value={remoteSyncToken}
          onChange={(event) => onRemoteSyncTokenChange(event.target.value)}
          placeholder="输入线上同步令牌"
          className="w-full rounded-lg border px-3 py-2"
          style={{
            backgroundColor: theme.mode === 'dark' ? '#111827' : theme.colors.surface,
            borderColor: theme.colors.border,
            color: theme.colors.text,
          }}
        />
        <input
          type="password"
          value={remoteAdminPassword}
          onChange={(event) => onRemoteAdminPasswordChange(event.target.value)}
          placeholder="输入远程管理员密码"
          className="w-full rounded-lg border px-3 py-2"
          style={{
            backgroundColor: theme.mode === 'dark' ? '#111827' : theme.colors.surface,
            borderColor: theme.colors.border,
            color: theme.colors.text,
          }}
        />
        <label
          className="flex items-start gap-3 rounded-lg border px-3 py-3 text-sm"
          style={{
            backgroundColor: theme.mode === 'dark' ? '#111827' : theme.colors.surface,
            borderColor: theme.colors.border,
            color: theme.colors.text,
          }}
        >
          <input
            type="checkbox"
            checked={syncLocalEntriesOnBind}
            onChange={(event) => onSyncLocalEntriesOnBindChange(event.target.checked)}
            className="mt-0.5 h-4 w-4"
            style={{ accentColor: theme.colors.primary }}
          />
          <span>
            {syncLocalEntriesOnBind ? '同步本地已有内容，并与远程内容合并后按时间刷新。' : '只保留远程内容，绑定完成后会用远程快照替换本地当前内容。'}
          </span>
        </label>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onSubmit}
          className="w-full rounded-lg px-4 py-2 font-medium text-white sm:w-auto"
          style={{ backgroundColor: theme.colors.primary }}
        >
          {submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-lg border px-4 py-2 font-medium sm:w-auto"
            style={{
              borderColor: theme.colors.border,
              color: getTextColor('primary'),
            }}
          >
            取消
          </button>
        )}
      </div>
    </div>
  );
}

export function SyncSettingsSection({
  theme,
  getTextColor,
  accessProfile,
  isNativeApp,
  remoteSyncBaseUrl,
  remoteSyncToken,
  remoteAdminPassword,
  syncLocalEntriesOnBind,
  showRemoteBindingForm,
  isBindingRemote,
  onRemoteSyncBaseUrlChange,
  onRemoteSyncTokenChange,
  onRemoteAdminPasswordChange,
  onSyncLocalEntriesOnBindChange,
  onShowRemoteBindingForm,
  onHideRemoteBindingForm,
  onBindRemoteSubmit,
  onUnbindRemote,
}: SyncSettingsSectionProps) {
  if (!isNativeApp || accessProfile?.mode !== 'local') {
    return null;
  }

  const remoteBound = accessProfile.remoteBound;
  const boundAddress = accessProfile.remoteSyncBaseUrl.trim();

  return (
    <PanelSurface theme={theme}>
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold" style={{ color: getTextColor('primary') }}>
                APK 远程绑定
              </h3>
              <p className="mt-1 text-sm" style={{ color: getTextColor('secondary') }}>
                绑定后，本机管理员入口会改为使用远程管理员密码；同步仍只在你手动触发时联网执行。
              </p>
            </div>
            <BindingStateBadge theme={theme} remoteBound={remoteBound} />
          </div>

          {boundAddress ? (
            <p className="text-sm" style={{ color: getTextColor('secondary') }}>
              当前远程：{boundAddress}
            </p>
          ) : (
            <p className="text-sm" style={{ color: getTextColor('secondary') }}>
              当前尚未填写远程地址。未绑定时，本机管理员面板保持免密进入。
            </p>
          )}
        </div>

        {showRemoteBindingForm ? (
          <RemoteBindingForm
            theme={theme}
            getTextColor={getTextColor}
            remoteBound={remoteBound}
            remoteSyncBaseUrl={remoteSyncBaseUrl}
            remoteSyncToken={remoteSyncToken}
            remoteAdminPassword={remoteAdminPassword}
            syncLocalEntriesOnBind={syncLocalEntriesOnBind}
            isBindingRemote={isBindingRemote}
            onRemoteSyncBaseUrlChange={onRemoteSyncBaseUrlChange}
            onRemoteSyncTokenChange={onRemoteSyncTokenChange}
            onRemoteAdminPasswordChange={onRemoteAdminPasswordChange}
            onSyncLocalEntriesOnBindChange={onSyncLocalEntriesOnBindChange}
            onSubmit={onBindRemoteSubmit}
            onCancel={onHideRemoteBindingForm}
          />
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onShowRemoteBindingForm}
              className="w-full rounded-lg px-4 py-2 font-medium text-white sm:w-auto"
              style={{ backgroundColor: theme.colors.primary }}
            >
              {remoteBound ? '重新绑定远程' : '开始远程绑定'}
            </button>
            {remoteBound && (
              <button
                type="button"
                onClick={onUnbindRemote}
                className="w-full rounded-lg border px-4 py-2 font-medium sm:w-auto"
                style={{
                  borderColor: theme.colors.border,
                  color: getTextColor('primary'),
                }}
              >
                解除远程绑定
              </button>
            )}
          </div>
        )}
      </div>
    </PanelSurface>
  );
}

export function PrimaryActionsSection({
  settings,
  theme,
  isNativeApp,
  syncDescription,
  isSyncingToRemote,
  showAdminPasswordAction,
  onSyncToRemote,
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

  if (isNativeApp) {
    actionCards.unshift({
      key: 'sync-remote',
      title: isSyncingToRemote ? '正在同步到云端' : '手动同步到云端',
      description: syncDescription,
      onClick: onSyncToRemote,
    });
  }

  if (showAdminPasswordAction) {
    actionCards.splice(isNativeApp ? 3 : 2, 0, {
      key: 'password',
      title: '密码设置',
      description: '修改管理密码',
      onClick: onTogglePasswordSettings,
    });
  }

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
