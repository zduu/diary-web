import { AdminEntryListItem, IconTextInput } from './AdminPanelParts';
import {
  AdminPasswordSection,
  AppSecuritySection,
  InterfaceSettingsSection,
  PrimaryActionsSection,
  SyncSettingsSection,
} from './AdminPanelSections';
import type {
  AdminAuthenticatedViewProps,
  AdminEntriesSectionProps,
  AdminLoginViewProps,
  AdminPanelHeaderActionsProps,
} from './adminPanelTypes';

export function AdminLoginView({
  accessProfile,
  isNativeApp,
  isLoadingAccessProfile,
  showRemoteBindingForm,
  remoteSyncBaseUrl,
  remoteSyncToken,
  remoteAdminPassword,
  syncLocalEntriesOnBind,
  isBindingRemote,
  passwordInput,
  onPasswordInputChange,
  onSubmit,
  onEnterWithoutPassword,
  onShowRemoteBindingForm,
  onHideRemoteBindingForm,
  onRemoteSyncBaseUrlChange,
  onRemoteSyncTokenChange,
  onRemoteAdminPasswordChange,
  onSyncLocalEntriesOnBindChange,
  onBindRemoteSubmit,
  theme,
  getTextColor,
}: AdminLoginViewProps) {
  const isDarkLike = theme.mode === 'dark';
  const isLocalMode = accessProfile?.mode === 'local';
  const canUseRemoteBinding = isNativeApp && isLocalMode;
  const requiresPassword = accessProfile?.requiresPassword ?? true;
  const remoteBound = accessProfile?.remoteBound ?? false;

  if (isLoadingAccessProfile) {
    return (
      <div className="mx-auto max-w-md text-center py-8" style={{ color: getTextColor('secondary') }}>
        正在读取管理员入口状态...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
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
          {showRemoteBindingForm
            ? '先完成远程绑定，再用与远程一致的管理员密码进入本机管理面板'
            : isLocalMode && !requiresPassword
              ? canUseRemoteBinding
                ? '当前设备未绑定远程，可直接进入本地管理。完成远程绑定后，会改为使用远程管理员密码。'
                : '当前环境未绑定远程，可直接进入本地管理。'
              : remoteBound
                ? '当前设备已绑定远程，请输入与线上一致的管理员密码。若线上已改密，可直接重新绑定。'
                : '请输入管理员密码以访问管理功能'}
        </p>
      </div>

      {canUseRemoteBinding && showRemoteBindingForm ? (
        <div
          className="space-y-3 rounded-xl border p-4"
          style={{
            backgroundColor: isDarkLike ? '#1f2937' : theme.colors.surface,
            borderColor: theme.colors.border,
          }}
        >
          <input
            type="url"
            value={remoteSyncBaseUrl}
            onChange={(event) => onRemoteSyncBaseUrlChange(event.target.value)}
            placeholder="https://你的-pages-域名.pages.dev"
            className="w-full rounded-lg border px-4 py-3"
            style={{
              backgroundColor: 'transparent',
              borderColor: theme.colors.border,
              color: getTextColor('primary'),
            }}
          />
          <input
            type="password"
            value={remoteSyncToken}
            onChange={(event) => onRemoteSyncTokenChange(event.target.value)}
            placeholder="输入线上同步令牌"
            className="w-full rounded-lg border px-4 py-3"
            style={{
              backgroundColor: 'transparent',
              borderColor: theme.colors.border,
              color: getTextColor('primary'),
            }}
          />
          <input
            type="password"
            value={remoteAdminPassword}
            onChange={(event) => onRemoteAdminPasswordChange(event.target.value)}
            placeholder="输入远程管理员密码"
            className="w-full rounded-lg border px-4 py-3"
            style={{
              backgroundColor: 'transparent',
              borderColor: theme.colors.border,
              color: getTextColor('primary'),
            }}
          />
          <label
            className="flex items-start gap-3 rounded-lg border px-3 py-3 text-sm"
            style={{
              borderColor: theme.colors.border,
              color: getTextColor('primary'),
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
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onBindRemoteSubmit}
              className="w-full rounded-lg py-3 font-medium transition-colors sm:w-auto sm:px-5"
              style={{
                backgroundColor: theme.colors.primary,
                color: 'white',
              }}
            >
              {isBindingRemote ? (remoteBound ? '重新绑定中' : '绑定中') : (remoteBound ? '重新绑定并登录' : '绑定并登录')}
            </button>
            <button
              type="button"
              onClick={onHideRemoteBindingForm}
              className="w-full rounded-lg border py-3 font-medium sm:w-auto sm:px-5"
              style={{
                borderColor: theme.colors.border,
                color: getTextColor('primary'),
              }}
            >
              返回
            </button>
          </div>
        </div>
      ) : isLocalMode && !requiresPassword ? (
        <div className="space-y-3">
          <button
            type="button"
            onClick={onEnterWithoutPassword}
            className="w-full rounded-lg py-3 font-medium transition-colors"
            style={{
              backgroundColor: theme.colors.primary,
              color: 'white',
            }}
          >
            直接进入本地管理
          </button>
          {canUseRemoteBinding && (
            <button
              type="button"
              onClick={onShowRemoteBindingForm}
              className="w-full rounded-lg border py-3 font-medium"
              style={{
                borderColor: theme.colors.border,
                color: getTextColor('primary'),
              }}
            >
              绑定远程
            </button>
          )}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div
            className="rounded-lg border p-1"
            style={{
              backgroundColor: isDarkLike ? '#1f2937' : theme.colors.surface,
              borderColor: theme.colors.border,
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
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="submit"
              className="w-full rounded-lg py-3 font-medium transition-colors sm:w-auto sm:flex-1"
              style={{
                backgroundColor: theme.colors.primary,
                color: 'white',
              }}
            >
              验证
            </button>
            {canUseRemoteBinding && (
              <button
                type="button"
                onClick={onShowRemoteBindingForm}
                className="w-full rounded-lg border py-3 font-medium sm:w-auto"
                style={{
                  borderColor: theme.colors.border,
                  color: getTextColor('primary'),
                }}
              >
                {remoteBound ? '重新绑定远程' : '绑定远程'}
              </button>
            )}
          </div>
        </form>
      )}
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
        border: '1px solid rgba(239, 68, 68, 0.2)',
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
    accessProfile,
    isNativeApp,
    syncStatus,
    isSyncingToRemote,
    showRemoteBindingForm,
    remoteSyncBaseUrl,
    remoteSyncToken,
    remoteAdminPassword,
    syncLocalEntriesOnBind,
    isBindingRemote,
  } = settingsState;
  const { searchQuery, filteredEntries, entryTimestampLabels } = entriesState;
  const {
    onRemoteSyncBaseUrlChange,
    onRemoteSyncTokenChange,
    onRemoteAdminPasswordChange,
    onSyncLocalEntriesOnBindChange,
    onShowRemoteBindingForm,
    onHideRemoteBindingForm,
    onBindRemoteSubmit,
    onUnbindRemote,
    onSyncToRemote,
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
      <SyncSettingsSection
        theme={theme}
        getTextColor={getTextColor}
        accessProfile={accessProfile}
        isNativeApp={isNativeApp}
        remoteSyncBaseUrl={remoteSyncBaseUrl}
        remoteSyncToken={remoteSyncToken}
        remoteAdminPassword={remoteAdminPassword}
        syncLocalEntriesOnBind={syncLocalEntriesOnBind}
        showRemoteBindingForm={showRemoteBindingForm}
        isBindingRemote={isBindingRemote}
        onRemoteSyncBaseUrlChange={onRemoteSyncBaseUrlChange}
        onRemoteSyncTokenChange={onRemoteSyncTokenChange}
        onRemoteAdminPasswordChange={onRemoteAdminPasswordChange}
        onSyncLocalEntriesOnBindChange={onSyncLocalEntriesOnBindChange}
        onShowRemoteBindingForm={onShowRemoteBindingForm}
        onHideRemoteBindingForm={onHideRemoteBindingForm}
        onBindRemoteSubmit={onBindRemoteSubmit}
        onUnbindRemote={onUnbindRemote}
      />

      <PrimaryActionsSection
        settings={settings}
        theme={theme}
        isNativeApp={isNativeApp}
        syncDescription={
          isSyncingToRemote
            ? '正在把本地改动推送到云端，请稍候。'
            : syncStatus == null
              ? '正在读取本地同步状态。'
              : syncStatus.totalPending > 0
                ? `待同步 ${syncStatus.totalPending} 条，新增 ${syncStatus.pendingCreates} / 更新 ${syncStatus.pendingUpdates} / 删除 ${syncStatus.pendingDeletes}${syncStatus.conflicts > 0 ? ` / 冲突 ${syncStatus.conflicts}` : ''}`
                : syncStatus.lastSyncedAt
                  ? `当前无待同步内容，上次同步于 ${new Date(syncStatus.lastSyncedAt).toLocaleString('zh-CN')}`
                  : '当前无待同步内容，还没有执行过云端同步。'
        }
        isSyncingToRemote={isSyncingToRemote}
        showAdminPasswordAction={accessProfile?.mode !== 'local'}
        onSyncToRemote={onSyncToRemote}
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

      {accessProfile?.mode !== 'local' && (
        <AdminPasswordSection
          visible={showPasswordSettings}
          theme={theme}
          getTextColor={getTextColor}
          newPassword={newPassword}
          onNewPasswordChange={onNewPasswordChange}
          onPasswordChange={onPasswordChange}
        />
      )}

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
