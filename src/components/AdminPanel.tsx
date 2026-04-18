import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { NotificationToast } from './NotificationToast';
import { AdminConfirmDialog, AdminImportModeDialog } from './admin/AdminPanelDialogs';
import {
  persistAdminSettings,
  persistFeatureToggle,
  persistPasswordSettings,
} from './admin/adminSettingsStore';
import { interfaceFeatureSchema } from './admin/adminPanelSettingsSchema';
import {
  buildAdminPanelStyle,
  getAdminTextColor,
  isUnauthorizedAdminPanelError,
} from './admin/adminPanelHelpers';
import { useAdminPanelFeedback } from './admin/adminPanelState';
import { useAdminPanelEntryActions } from './admin/useAdminPanelEntryActions';
import { useAdminPanelSettings } from './admin/useAdminPanelSettings';
import {
  AdminAuthenticatedView,
  AdminLoginView,
  AdminPanelHeaderActions,
} from './admin/AdminPanelViews';
import type {
  AdminPanelProps,
  AdminSettings,
  InterfaceFeatureKey,
  PasswordSettings,
} from './admin/adminPanelTypes';
import { ModalHeader } from './ModalHeader';
import { ModalShell } from './ModalShell';
import { useThemeContext } from './ThemeProvider';
import { useAdminAuth } from './AdminAuthContext';
import { apiService } from '../services/api';
import { getSmartTimeDisplay } from '../utils/timeUtils.ts';
import { debugError, debugLog } from '../utils/logger.ts';

function buildFeatureToggleSuccessMessage(label: string, enabled: boolean) {
  return `${label}已${enabled ? '开启' : '关闭'}！`;
}

function resetFileInput(input: HTMLInputElement | null) {
  if (input) {
    input.value = '';
  }
}

export function AdminPanel({
  isOpen,
  onClose,
  entries,
  onEntriesUpdate,
  onSessionChange,
  onInterfaceSettingsChange,
  onDeleteEntry,
  onEdit,
}: AdminPanelProps) {
  const { theme } = useThemeContext();
  const { isAdminAuthenticated, setIsAdminAuthenticated } = useAdminAuth();
  const [isAuthenticated, setIsAuthenticated] = useState(isAdminAuthenticated);
  const [passwordInput, setPasswordInput] = useState('');
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const {
    clearConfirmState,
    closeConfirmDialog,
    confirmLoading,
    confirmState,
    getOperationState,
    hideNotification,
    notification,
    requestDeleteConfirm,
    requestLogoutConfirm,
    setConfirmLoading,
    setOperationState,
    showOperationFeedback,
  } = useAdminPanelFeedback();
  const syncSessionState = (authenticated: boolean) => {
    setIsAuthenticated(authenticated);
    setIsAdminAuthenticated(authenticated);
    onSessionChange?.({
      isAuthenticated: authenticated,
      isAdminAuthenticated: authenticated,
    });
  };
  const {
    closeAppPasswordSettings,
    closePasswordSettings,
    loadSettings,
    setNewAppPassword,
    setNewPassword,
    settingsState,
    toggleAppPasswordSettings,
    togglePasswordSettings,
    updateInterfaceSetting,
    updatePasswordSettings,
    updateSettings,
  } = useAdminPanelSettings({
    isAuthenticated,
    isOpen,
    onUnauthorized: () => syncSessionState(false),
  });
  const {
    settings,
    showPasswordSettings,
    passwordSettings,
    showAppPasswordSettings,
    newAppPassword,
    newPassword,
    interfaceSettings,
  } = settingsState;

  const handleAdminOperationError = (error: unknown, fallbackMessage: string) => {
    if (isUnauthorizedAdminPanelError(error)) {
      syncSessionState(false);
    }

    showOperationFeedback(error instanceof Error ? error.message : fallbackMessage, true);
  };

  // 获取适配暗色主题的文本颜色
  const getTextColor = (type: 'primary' | 'secondary' = 'primary') => {
    return getAdminTextColor(theme, type);
  };

  useEffect(() => {
    setIsAuthenticated(isAdminAuthenticated);
  }, [isAdminAuthenticated]);

  const [searchQuery, setSearchQuery] = useState('');
  const [pendingImportEntries, setPendingImportEntries] = useState<typeof entries | null>(null);
  const [isImportSubmitting, setIsImportSubmitting] = useState(false);
  const {
    handleConfirmAction,
    handleDeleteEntry,
    toggleEntryVisibility,
  } = useAdminPanelEntryActions({
    confirmState,
    entries,
    onClose,
    onDeleteEntry,
    onEntriesUpdate,
    onLogoutConfirmed: () => syncSessionState(false),
    clearConfirmState,
    requestDeleteConfirm,
    setConfirmLoading,
    setOperationState,
    showOperationFeedback,
    handleAdminOperationError,
  });

  // 保存设置到数据库
  const saveSettings = async (newSettings: AdminSettings) => {
    try {
      await persistAdminSettings(newSettings);
      updateSettings(() => newSettings);
      await onInterfaceSettingsChange?.();
      debugLog('设置已保存到数据库');
    } catch (error) {
      debugError('保存设置失败:', error);
      handleAdminOperationError(error, '保存设置失败');
      throw error;
    }
  };

  // 验证密码
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiService.loginAdmin(passwordInput);
      syncSessionState(true);
      setPasswordInput('');
      await loadSettings();
    } catch (error) {
      handleAdminOperationError(error, '管理员登录失败');
      setPasswordInput('');
    }
  };

  // 退出管理员登录
  const handleLogout = () => {
    requestLogoutConfirm();
  };

  // 导出所有日记
  const handleExportEntries = async () => {
    const { exportEntriesToJson } = await import('./admin/adminPanelActions');
    exportEntriesToJson(entries);
  };

  const handleRunR2SelfCheck = async () => {
    try {
      const result = await apiService.runR2SelfCheck();
      if (!result.bucketBindingPresent) {
        showOperationFeedback(`R2 自检结果：未绑定 IMAGES_BUCKET。${result.message}`, true);
        return;
      }

      if (result.canWrite && result.canRead && result.canDelete && result.readBackMatches) {
        showOperationFeedback(`R2 自检通过：绑定正常，前缀 ${result.keyPrefix} 可写入、读取并删除。`);
        return;
      }

      showOperationFeedback(`R2 自检异常：${result.message}`, true);
    } catch (error) {
      handleAdminOperationError(error, 'R2 自检失败');
    }
  };

  // 导入日记
  const handleImportEntries = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const { parseEntriesBackup } = await import('./admin/adminPanelActions');
      const importedEntries = await parseEntriesBackup(file);
      setPendingImportEntries(importedEntries);
    } catch (error) {
      handleAdminOperationError(error, error instanceof Error ? error.message : '文件解析失败！请检查文件格式。');
    } finally {
      resetFileInput(input);
    }
  };

  const handleCloseImportDialog = () => {
    if (isImportSubmitting) {
      return;
    }

    setPendingImportEntries(null);
  };

  const handleConfirmImport = async (importMode: 'merge' | 'overwrite') => {
    if (!pendingImportEntries) {
      return;
    }

    setIsImportSubmitting(true);

    try {
      await apiService.batchImportEntries(pendingImportEntries, { overwrite: importMode === 'overwrite' });
      await onEntriesUpdate();
      setSearchQuery('');
      setPendingImportEntries(null);

      const modeText = importMode === 'overwrite' ? '覆盖导入' : '合并导入';
      showOperationFeedback(`${modeText}成功！已导入 ${pendingImportEntries.length} 条日记。`);
    } catch (error) {
      handleAdminOperationError(error, error instanceof Error ? error.message : '导入失败');
    } finally {
      setIsImportSubmitting(false);
    }
  };

  const deferredSearchQuery = useDeferredValue(searchQuery);

  // 更改管理员密码
  const handlePasswordChange = async () => {
    if (newPassword.length < 6) {
      showOperationFeedback('密码长度至少6位！', true);
      return;
    }

    try {
      await apiService.setSetting('admin_password', newPassword);
      updateSettings((previous) => ({ ...previous, adminPasswordConfigured: true }));
      setNewPassword('');
      closePasswordSettings();
      showOperationFeedback('密码修改成功！');
    } catch (error) {
      handleAdminOperationError(error, '密码修改失败');
    }
  };

  // 保存应用密码设置
  const savePasswordSettings = async (passwordSettings: PasswordSettings) => {
    try {
      await persistPasswordSettings(passwordSettings);
      updateSettings((previous) => ({ ...previous, passwordProtection: passwordSettings.enabled }));
      updatePasswordSettings(() => passwordSettings);
      await onInterfaceSettingsChange?.();

      debugLog('应用密码设置已保存到数据库');
    } catch (error) {
      debugError('保存应用密码设置失败:', error);
      throw error;
    }
  };

  const toggleFeatureSetting = async (key: InterfaceFeatureKey) => {
    const currentSettings = interfaceSettings[key];
    const { apiKey, successLabel } = interfaceFeatureSchema[key];

    try {
      const nextSettings = { ...currentSettings, enabled: !currentSettings.enabled };
      await persistFeatureToggle(apiKey, nextSettings.enabled);
      updateInterfaceSetting(key, () => nextSettings);
      await onInterfaceSettingsChange?.();
      showOperationFeedback(buildFeatureToggleSuccessMessage(successLabel, nextSettings.enabled));
    } catch (error) {
      handleAdminOperationError(error, '设置修改失败');
    }
  };

  // 切换应用密码保护
  const toggleAppPasswordProtection = async () => {
    try {
      const newSettings = { ...passwordSettings, enabled: !passwordSettings.enabled };
      await savePasswordSettings(newSettings);
      showOperationFeedback(`应用密码保护已${newSettings.enabled ? '开启' : '关闭'}！`);
    } catch (error) {
      handleAdminOperationError(error, '设置修改失败');
    }
  };

  // 更改应用密码
  const handleAppPasswordChange = async () => {
    if (newAppPassword.length < 6) {
      showOperationFeedback('密码长度至少6位！', true);
      return;
    }

    try {
      await apiService.setSetting('app_password', newAppPassword);
      updatePasswordSettings((previous) => ({ ...previous, configured: true }));
      setNewAppPassword('');
      closeAppPasswordSettings();
      showOperationFeedback('应用密码修改成功！');
    } catch (error) {
      handleAdminOperationError(error, '应用密码修改失败');
    }
  };

  const handleToggleHiddenEntries = () => {
    updateSettings((previous) => ({
      ...previous,
      showHiddenEntries: !previous.showHiddenEntries,
    }));
  };

  const handleToggleWelcomePage = async () => {
    const newSettings = { ...settings, welcomePageEnabled: !settings.welcomePageEnabled };
    await saveSettings(newSettings);
  };

  // 过滤日记（包括隐藏的）
  const filteredEntries = useMemo(() => {
    const normalizedQuery = deferredSearchQuery.trim().toLowerCase();

    return entries.filter((entry) => {
      const matchesSearch = !normalizedQuery ||
        entry.title?.toLowerCase().includes(normalizedQuery) ||
        entry.content.toLowerCase().includes(normalizedQuery);

      if (settings.showHiddenEntries) {
        return matchesSearch;
      }

      return matchesSearch && !entry.hidden;
    });
  }, [deferredSearchQuery, entries, settings.showHiddenEntries]);
  const entryTimestampLabels = useMemo(
    () => Object.fromEntries(entries.map((entry) => [entry.id ?? -1, getSmartTimeDisplay(entry.created_at!).tooltip])),
    [entries]
  );
  const handleEditEntry = onEdit ? (entry: typeof entries[number]) => {
    onEdit(entry);
    onClose();
  } : undefined;
  const authenticatedViewSettings = {
    settings,
    showPasswordSettings,
    passwordSettings,
    showAppPasswordSettings,
    newAppPassword,
    newPassword,
    interfaceSettings,
  };
  const authenticatedViewEntries = {
    searchQuery,
    filteredEntries,
    entryTimestampLabels,
  };
  const authenticatedViewActions = {
    onExportEntries: () => {
      void handleExportEntries();
    },
    onImportEntries: handleImportEntries,
    onRunR2SelfCheck: () => {
      void handleRunR2SelfCheck();
    },
    onTogglePasswordSettings: togglePasswordSettings,
    onToggleHiddenEntries: handleToggleHiddenEntries,
    onToggleWelcomePage: () => {
      void handleToggleWelcomePage();
    },
    onToggleAppPasswordProtection: toggleAppPasswordProtection,
    onToggleAppPasswordSettings: toggleAppPasswordSettings,
    onNewAppPasswordChange: setNewAppPassword,
    onAppPasswordChange: handleAppPasswordChange,
    onToggleInterfaceSetting: (key: InterfaceFeatureKey) => {
      void toggleFeatureSetting(key);
    },
    onNewPasswordChange: setNewPassword,
    onPasswordChange: handlePasswordChange,
    onSearchQueryChange: setSearchQuery,
    onEditEntry: handleEditEntry,
    onToggleVisibility: toggleEntryVisibility,
    onDeleteEntry: handleDeleteEntry,
  };

  if (!isOpen) return null;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      ariaLabelledby="admin-panel-title"
      zIndex={99999}
      padding="16px"
      backdropStyle={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      panelClassName="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-xl"
      panelStyle={buildAdminPanelStyle(theme)}
    >
      <ModalHeader
        titleId="admin-panel-title"
        title="管理员面板"
        onClose={onClose}
        icon={<span className="h-3 w-3 rounded-full" style={{ backgroundColor: theme.colors.primary }} aria-hidden="true" />}
        actions={<AdminPanelHeaderActions isAuthenticated={isAuthenticated} onLogout={handleLogout} />}
        padded="lg"
      />

      <div className="p-6">
        {!isAuthenticated ? (
          <AdminLoginView
            passwordInput={passwordInput}
            onPasswordInputChange={setPasswordInput}
            onSubmit={handlePasswordSubmit}
            theme={theme}
            getTextColor={getTextColor}
          />
        ) : (
          <AdminAuthenticatedView
            theme={theme}
            getTextColor={getTextColor}
            getOperationState={getOperationState}
            settingsState={authenticatedViewSettings}
            entriesState={authenticatedViewEntries}
            actions={authenticatedViewActions}
          />
        )}
      </div>

      {/* 通知组件 */}
      {notification.visible && (
        <NotificationToast
          message={notification.message}
          type={notification.type}
          onClose={hideNotification}
        />
      )}

      <AdminConfirmDialog
        confirmState={confirmState}
        confirmLoading={confirmLoading}
        confirmButtonRef={confirmButtonRef}
        theme={theme}
        getTextColor={getTextColor}
        onClose={closeConfirmDialog}
        onConfirm={handleConfirmAction}
      />

      <AdminImportModeDialog
        isOpen={Boolean(pendingImportEntries)}
        importCount={pendingImportEntries?.length ?? 0}
        existingCount={entries.length}
        isSubmitting={isImportSubmitting}
        theme={theme}
        getTextColor={getTextColor}
        onClose={handleCloseImportDialog}
        onConfirm={handleConfirmImport}
      />
    </ModalShell>
  );
}
