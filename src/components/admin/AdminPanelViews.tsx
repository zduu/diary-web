import { AdminEntryListItem, IconTextInput } from './AdminPanelParts';
import {
  AdminPasswordSection,
  AppSecuritySection,
  InterfaceSettingsSection,
  PrimaryActionsSection,
} from './AdminPanelSections';
import type {
  AdminAuthenticatedViewProps,
  AdminEntriesSectionProps,
  AdminLoginViewProps,
  AdminPanelHeaderActionsProps,
} from './adminPanelTypes';

export function AdminLoginView({
  passwordInput,
  onPasswordInputChange,
  onSubmit,
  theme,
  getTextColor,
}: AdminLoginViewProps) {
  const isDarkLike = theme.mode === 'dark';

  return (
    <div className="max-w-md mx-auto">
      <div className="text-center mb-6">
        <div
          className="mx-auto mb-4 h-3 w-3 rounded-full"
          style={{ backgroundColor: theme.colors.primary }}
          aria-hidden="true"
        />
        <h3 className="text-lg font-semibold mb-2" style={{ color: getTextColor('primary') }}>
          管理员验证
        </h3>
        <p className="text-sm" style={{ color: getTextColor('secondary') }}>
          请输入管理员密码以访问管理功能
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div
          className="rounded-lg border p-1"
          style={{
            backgroundColor: isDarkLike ? 'rgba(15, 23, 42, 0.8)' : theme.colors.surface,
            borderColor: theme.mode === 'dark' ? 'rgba(99, 102, 241, 0.3)' : theme.colors.border,
          }}
        >
          <IconTextInput
            icon={null}
            theme={{
              ...theme,
              colors: {
                ...theme.colors,
                surface: 'transparent',
                border: 'transparent',
                text: getTextColor('primary'),
              },
            }}
            value={passwordInput}
            type="password"
            placeholder="输入管理员密码"
            fullWidth
            onValueChange={onPasswordInputChange}
            enterKeyHint="done"
            autoComplete="current-password"
            required
          />
        </div>
        <button
          type="submit"
          className="w-full py-3 rounded-lg font-medium transition-colors"
          style={{
            backgroundColor: theme.colors.primary,
            color: 'white',
          }}
        >
          验证
        </button>
      </form>
    </div>
  );
}

export function AdminEntriesSection({
  searchQuery,
  onSearchQueryChange,
  filteredEntries,
  entryTimestampLabels,
  theme,
  getTextColor,
  getOperationState,
  onEditEntry,
  onToggleVisibility,
  onDeleteEntry,
}: AdminEntriesSectionProps) {
  return (
    <div className="space-y-4">
      <IconTextInput
        icon={<span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: theme.colors.primary }} aria-hidden="true" />}
        theme={theme}
        value={searchQuery}
        placeholder="搜索日记内容..."
        onValueChange={onSearchQueryChange}
        enterKeyHint="search"
        autoComplete="off"
      />

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {filteredEntries.map((entry) => (
          <AdminEntryListItem
            key={entry.id}
            entry={entry}
            theme={theme}
            getTextColor={getTextColor}
            operationState={getOperationState(entry.id!)}
            timestampLabel={entryTimestampLabels[entry.id!] || ''}
            onEdit={onEditEntry ? () => onEditEntry(entry) : undefined}
            onToggleVisibility={() => onToggleVisibility(entry.id!)}
            onDelete={() => onDeleteEntry(entry.id!)}
          />
        ))}

        {filteredEntries.length === 0 && (
          <div className="text-center py-8" style={{ color: getTextColor('secondary') }}>
            {searchQuery ? '没有找到匹配的日记' : '暂无日记'}
          </div>
        )}
      </div>
    </div>
  );
}

export function AdminPanelHeaderActions({
  isAuthenticated,
  onLogout,
}: AdminPanelHeaderActionsProps) {
  if (!isAuthenticated) {
    return null;
  }

  return (
    <button
      onClick={onLogout}
      className="rounded-lg px-3 py-1 text-sm transition-colors hover:bg-opacity-80"
      style={{
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        color: '#ef4444',
        border: '1px solid rgba(239, 68, 68, 0.3)',
      }}
    >
      退出登录
    </button>
  );
}

export function AdminAuthenticatedView({
  theme,
  getTextColor,
  getOperationState,
  settingsState,
  entriesState,
  actions,
}: AdminAuthenticatedViewProps) {
  const {
    settings,
    showPasswordSettings,
    passwordSettings,
    showAppPasswordSettings,
    newAppPassword,
    newPassword,
    interfaceSettings,
  } = settingsState;
  const { searchQuery, filteredEntries, entryTimestampLabels } = entriesState;
  const {
    onExportEntries,
    onImportEntries,
    onRunR2SelfCheck,
    onTogglePasswordSettings,
    onToggleHiddenEntries,
    onToggleWelcomePage,
    onToggleAppPasswordProtection,
    onToggleAppPasswordSettings,
    onNewAppPasswordChange,
    onAppPasswordChange,
    onToggleInterfaceSetting,
    onNewPasswordChange,
    onPasswordChange,
    onSearchQueryChange,
    onEditEntry,
    onToggleVisibility,
    onDeleteEntry,
  } = actions;

  return (
    <div className="space-y-6">
      <PrimaryActionsSection
        settings={settings}
        theme={theme}
        onExportEntries={onExportEntries}
        onImportEntries={onImportEntries}
        onRunR2SelfCheck={onRunR2SelfCheck}
        onTogglePasswordSettings={onTogglePasswordSettings}
        onToggleHiddenEntries={onToggleHiddenEntries}
        onToggleWelcomePage={onToggleWelcomePage}
      />

      <AppSecuritySection
        theme={theme}
        getTextColor={getTextColor}
        currentPasswordSettings={passwordSettings}
        showAppPasswordSettings={showAppPasswordSettings}
        newAppPassword={newAppPassword}
        onToggleAppPasswordProtection={onToggleAppPasswordProtection}
        onToggleAppPasswordSettings={onToggleAppPasswordSettings}
        onNewAppPasswordChange={onNewAppPasswordChange}
        onAppPasswordChange={onAppPasswordChange}
      />

      <InterfaceSettingsSection
        theme={theme}
        getTextColor={getTextColor}
        interfaceSettings={interfaceSettings}
        onToggleInterfaceSetting={onToggleInterfaceSetting}
      />

      <AdminPasswordSection
        visible={showPasswordSettings}
        theme={theme}
        getTextColor={getTextColor}
        newPassword={newPassword}
        onNewPasswordChange={onNewPasswordChange}
        onPasswordChange={onPasswordChange}
      />

      <AdminEntriesSection
        searchQuery={searchQuery}
        onSearchQueryChange={onSearchQueryChange}
        filteredEntries={filteredEntries}
        entryTimestampLabels={entryTimestampLabels}
        theme={theme}
        getTextColor={getTextColor}
        getOperationState={getOperationState}
        onEditEntry={onEditEntry}
        onToggleVisibility={onToggleVisibility}
        onDeleteEntry={onDeleteEntry}
      />
    </div>
  );
}
