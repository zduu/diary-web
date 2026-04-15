import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import { AdminAuthProvider, useAdminAuth } from './components/AdminAuthContext';
import { ContentStatePanel } from './components/ContentStatePanel';
import { ThemeProvider, useThemeContext } from './components/ThemeProvider';
import { NotificationToast } from './components/NotificationToast';
import { buildFilterMeta } from './components/filters/filterEntryMeta';
import { ActiveBrowseSummary } from './components/app/ActiveBrowseSummary';
import { AppBrowsePanel } from './components/app/AppBrowsePanel';
import { AppHeader } from './components/app/AppHeader';
import { getQuietButtonStyle } from './components/app/appShellStyles';
import { useBrowseState } from './hooks/useBrowseState';
import { useDiary } from './hooks/useDiary';
import { useEntryEditorState } from './hooks/useEntryEditorState';
import { useInterfaceSettings } from './hooks/useInterfaceSettings';
import { useIsMobile } from './hooks/useIsMobile';
import { useNotificationState } from './hooks/useNotificationState';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { apiService } from './services/api';
import type { DiaryEntry } from './types/index.ts';
import { clearOfflineEntrySnapshot, writeOfflineEntrySnapshot } from './utils/offlineEntrySnapshot.ts';
import { debugError } from './utils/logger.ts';

const Timeline = lazy(() =>
  import('./components/Timeline').then((module) => ({ default: module.Timeline }))
);
const WelcomePage = lazy(() =>
  import('./components/WelcomePage').then((module) => ({ default: module.WelcomePage }))
);
const DiaryForm = lazy(() =>
  import('./components/DiaryForm').then((module) => ({ default: module.DiaryForm }))
);
const AdminPanel = lazy(() =>
  import('./components/AdminPanel').then((module) => ({ default: module.AdminPanel }))
);
const PasswordProtection = lazy(() =>
  import('./components/PasswordProtection').then((module) => ({ default: module.PasswordProtection }))
);
const ExportModal = lazy(() =>
  import('./components/ExportModal').then((module) => ({ default: module.ExportModal }))
);

function AppContent() {
  const { theme } = useThemeContext();
  const { isAdminAuthenticated, setIsAdminAuthenticated } = useAdminAuth();
  const isMobile = useIsMobile();
  const isOnline = useOnlineStatus();
  const {
    entries,
    loading,
    error,
    offlineSnapshotMeta,
    createEntry,
    updateEntry,
    deleteEntry,
    refreshEntries,
  } = useDiary();
  const {
    settings: interfaceSettings,
    loading: interfaceSettingsLoading,
    refreshSettings: refreshInterfaceSettings,
  } = useInterfaceSettings();
  const {
    closeForm,
    completeSave,
    editingEntry,
    highlightEntryId,
    isFormOpen,
    openEditEntry,
    openNewEntry,
  } = useEntryEditorState();
  const { hideNotification, notification, showNotification } = useNotificationState();
  const {
    accessibleEntries,
    activeBrowse,
    activeSearchQuery,
    displayEntries,
    handleClearActiveBrowsing,
    handleClearBrowseChip,
    handleClearQuickFilters,
    handleClearSearch,
    handleQuickFilterResults,
    handleSearchResults,
    isSearchPending,
    onQuickFilterSummaryChange,
    onSearchPendingChange,
    onSearchQueryChange,
    onSearchSummaryChange,
    quickFilterClearRequest,
    quickFilterResetSignal,
    searchClearRequest,
    searchResetSignal,
  } = useBrowseState(entries, isAdminAuthenticated);

  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showWelcomePage, setShowWelcomePage] = useState(true);
  const [showPasswordPage, setShowPasswordPage] = useState(false);
  const [showMainApp, setShowMainApp] = useState(false);
  const [isTransitioningToApp, setIsTransitioningToApp] = useState(false);
  const [passwordProtectionEnabled, setPasswordProtectionEnabled] = useState<boolean | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'card' | 'timeline' | 'archive'>('timeline');
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [dataMode, setDataMode] = useState<'local' | 'remote'>(() => apiService.getCurrentMode());
  const [isSwitchingDataMode, setIsSwitchingDataMode] = useState(false);

  const enterAppTimeoutRef = useRef<number | null>(null);
  const finishTransitionTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('diary_view_mode') as 'card' | 'timeline' | 'archive' | null;
    if (saved && (saved === 'card' || saved === 'timeline' || saved === 'archive')) {
      setViewMode(saved);
      return;
    }

    setViewMode('timeline');
    localStorage.setItem('diary_view_mode', 'timeline');
  }, []);

  useEffect(() => {
    if (!interfaceSettingsLoading && !interfaceSettings.archiveView.enabled && viewMode === 'archive') {
      setViewMode('card');
      localStorage.setItem('diary_view_mode', 'card');
    }
  }, [interfaceSettings.archiveView.enabled, interfaceSettingsLoading, viewMode]);

  useEffect(() => {
    let isCancelled = false;

    const unsubscribe = apiService.subscribeToSessionChanges((session) => {
      if (isCancelled) {
        return;
      }

      setIsAuthenticated(session.isAuthenticated);
      setIsAdminAuthenticated(session.isAdminAuthenticated);
      setSessionLoading(false);
    });

    const loadSession = async () => {
      try {
        const session = await apiService.getSession();
        if (isCancelled) {
          return;
        }

        setIsAuthenticated(session.isAuthenticated);
        setIsAdminAuthenticated(session.isAdminAuthenticated);
      } catch (sessionError) {
        if (isCancelled) {
          return;
        }

        debugError('获取会话状态失败:', sessionError);
        setIsAuthenticated(false);
        setIsAdminAuthenticated(false);
      } finally {
        if (!isCancelled) {
          setSessionLoading(false);
        }
      }
    };

    void loadSession();

    return () => {
      isCancelled = true;
      unsubscribe();
    };
  }, [setIsAdminAuthenticated]);

  useEffect(() => {
    if (interfaceSettingsLoading || sessionLoading) {
      return;
    }

    const isEnabled = interfaceSettings.passwordProtection.enabled;
    const welcomePageEnabled = interfaceSettings.welcomePage.enabled;

    setPasswordProtectionEnabled(isEnabled);

    if (!isEnabled) {
      setIsAuthenticated(true);
    }

    if (welcomePageEnabled) {
      setShowWelcomePage(true);
      setShowPasswordPage(false);
      setShowMainApp(false);
      return;
    }

    setShowWelcomePage(false);

    if (isEnabled && !isAuthenticated) {
      setShowPasswordPage(true);
      setShowMainApp(false);
      return;
    }

    setShowPasswordPage(false);
    setShowMainApp(true);
  }, [interfaceSettings, interfaceSettingsLoading, isAuthenticated, sessionLoading]);

  useEffect(() => {
    return () => {
      if (enterAppTimeoutRef.current !== null) {
        window.clearTimeout(enterAppTimeoutRef.current);
      }
      if (finishTransitionTimeoutRef.current !== null) {
        window.clearTimeout(finishTransitionTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isAdminAuthenticated) {
      clearOfflineEntrySnapshot();
      return;
    }

    if (loading || error) {
      return;
    }

    writeOfflineEntrySnapshot(accessibleEntries);
  }, [accessibleEntries, error, isAdminAuthenticated, loading]);

  const handleViewModeChange = (mode: 'card' | 'timeline' | 'archive') => {
    setViewMode(mode);
    localStorage.setItem('diary_view_mode', mode);
  };

  const handleSave = async (entryData: Omit<DiaryEntry, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      if (editingEntry) {
        await updateEntry(editingEntry.id!, entryData);
        showNotification('日记已保存', 'success');
        completeSave(editingEntry.id);
        return;
      }

      const createdEntry = await createEntry(entryData);
      showNotification('新日记已创建', 'success');
      completeSave(createdEntry.id);
    } catch (saveError) {
      showNotification(saveError instanceof Error ? saveError.message : '操作失败', 'error');
    }
  };

  const enterMainApp = () => {
    if (enterAppTimeoutRef.current !== null) {
      window.clearTimeout(enterAppTimeoutRef.current);
    }
    if (finishTransitionTimeoutRef.current !== null) {
      window.clearTimeout(finishTransitionTimeoutRef.current);
    }

    setIsTransitioningToApp(true);
    enterAppTimeoutRef.current = window.setTimeout(() => {
      setShowWelcomePage(false);
      setShowMainApp(true);
      enterAppTimeoutRef.current = null;

      finishTransitionTimeoutRef.current = window.setTimeout(() => {
        setIsTransitioningToApp(false);
        finishTransitionTimeoutRef.current = null;
      }, 700);
    }, 420);
  };

  const handleSessionChange = (session: { isAuthenticated: boolean; isAdminAuthenticated: boolean }) => {
    setIsAuthenticated(session.isAuthenticated);
    setIsAdminAuthenticated(session.isAdminAuthenticated);
  };

  const handleDataModeChange = async (nextMode: 'local' | 'remote') => {
    if (nextMode === dataMode || isSwitchingDataMode) {
      return;
    }

    setIsSwitchingDataMode(true);

    try {
      if (nextMode === 'local') {
        apiService.enableLocalMode();
      } else {
        apiService.enableRemoteMode();
      }

      setDataMode(apiService.getCurrentMode());

      await Promise.all([
        refreshEntries(),
        refreshInterfaceSettings(),
      ]);

      const session = await apiService.getSession();
      handleSessionChange(session);

      showNotification(nextMode === 'local' ? '已切换到本地离线模式' : '已切换到远程 Pages 模式', 'success');
    } catch (modeError) {
      showNotification(modeError instanceof Error ? modeError.message : '切换数据模式失败', 'error');
      setDataMode(apiService.getCurrentMode());
    } finally {
      setIsSwitchingDataMode(false);
    }
  };

  const accessibleEntriesCount = accessibleEntries.length;
  const filterMeta = useMemo(
    () => buildFilterMeta(entries, isAdminAuthenticated),
    [entries, isAdminAuthenticated]
  );
  const quietButtonStyle = getQuietButtonStyle(theme);
  const canExportCurrentResults =
    isAdminAuthenticated &&
    !interfaceSettingsLoading &&
    interfaceSettings.export.enabled &&
    displayEntries.length > 0;
  const suspenseFallback = (
    <ContentStatePanel
      icon="⌛"
      eyebrow="module loading"
      title="正在加载模块..."
      description="界面组件正在按需准备。"
      isMobile={isMobile}
      surface="muted"
      density="compact"
      align="left"
    />
  );
  const shellFallback = (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ backgroundColor: theme.colors.background }}>
      <div className="w-full max-w-md">
        <ContentStatePanel
          icon="⌛"
          eyebrow="app loading"
          title="正在准备界面..."
          description="欢迎页和主应用壳层正在加载。"
          isMobile={isMobile}
          density="compact"
        />
      </div>
    </div>
  );

  if (passwordProtectionEnabled === null || sessionLoading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center px-4"
        style={{ backgroundColor: theme.colors.background }}
      >
        <div className="w-full max-w-md">
          <ContentStatePanel
            icon={<RefreshCw className="h-6 w-6 animate-spin" />}
            eyebrow="session loading"
            title="正在整理日记空间..."
            description="会话和访问控制状态正在确认，稍后自动进入对应页面。"
            isMobile={isMobile}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <a href="#main-content" className="skip-link">
        跳到正文内容
      </a>

      {(showWelcomePage || showPasswordPage) && !showMainApp && (
        <Suspense fallback={shellFallback}>
          <WelcomePage
            hasPasswordProtection={passwordProtectionEnabled}
            isBackground={showPasswordPage}
            isTransitioningToApp={isTransitioningToApp}
            onEnterApp={() => {
              if (passwordProtectionEnabled && !isAuthenticated) {
                setShowPasswordPage(true);
                return;
              }

              enterMainApp();
            }}
          />
        </Suspense>
      )}

      {showPasswordPage && passwordProtectionEnabled && !isAuthenticated && !showMainApp && (
        <Suspense fallback={suspenseFallback}>
          <PasswordProtection
            passwordSettings={{ enabled: passwordProtectionEnabled }}
            onAuthenticated={() => {
              setIsAuthenticated(true);
              setShowPasswordPage(false);
              enterMainApp();
            }}
          />
        </Suspense>
      )}

      <div
        className={`app-transition ${showMainApp ? 'opacity-100' : 'pointer-events-none opacity-0'} ${
          isTransitioningToApp ? 'main-app-enter' : ''
        }`}
        style={{
          backgroundColor: theme.mode === 'dark' ? 'transparent' : theme.colors.background,
          transform: showMainApp ? 'scale(1)' : 'scale(0.95)',
          filter: showMainApp ? 'blur(0px) brightness(1)' : 'blur(3px) brightness(0.8)',
          transition: isTransitioningToApp
            ? 'all 1.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
            : 'all 0.3s ease',
          display: showMainApp ? 'block' : 'none',
          minHeight: '100vh',
        }}
      >
        <AppHeader
          isAdminAuthenticated={isAdminAuthenticated}
          isAdminPanelOpen={isAdminPanelOpen}
          loading={loading}
          onOpenAdminPanel={() => setIsAdminPanelOpen(true)}
          onOpenNewEntry={openNewEntry}
          onRefreshEntries={refreshEntries}
        />

        <main
          id="main-content"
          className="mx-auto min-h-screen max-w-6xl px-4 py-5 md:px-6 md:py-8"
          style={{ paddingBottom: isMobile ? 'calc(1.25rem + var(--safe-area-bottom))' : undefined }}
          aria-busy={loading || isSearchPending}
        >
          {error && (
            <ContentStatePanel
              icon="!"
              eyebrow="request error"
              title="日记内容加载失败"
              description={error}
              isMobile={isMobile}
              className="mb-6"
              action={(
                <button
                  type="button"
                  onClick={refreshEntries}
                  className="rounded-xl px-3 py-2 text-sm transition-transform duration-200 hover:-translate-y-0.5"
                  style={quietButtonStyle}
                >
                  重新获取内容
                </button>
              )}
            />
          )}

          {offlineSnapshotMeta.used && (
            <ContentStatePanel
              icon={<CloudOff className="h-5 w-5" />}
              eyebrow={isOnline ? 'offline snapshot' : 'offline reading'}
              title={isOnline ? '当前显示最近保存的离线快照' : '当前处于离线阅读模式'}
              description={
                offlineSnapshotMeta.savedAt
                  ? `最近一次可用公开内容保存于 ${new Date(offlineSnapshotMeta.savedAt).toLocaleString('zh-CN')}，恢复联网后刷新即可同步最新内容。`
                  : '最近一次公开内容已保存在本机，恢复联网后刷新即可同步最新内容。'
              }
              isMobile={isMobile}
              className="mb-6"
              surface="muted"
              density="compact"
              align="left"
            />
          )}

          {loading && entries.length === 0 ? (
            <ContentStatePanel
              icon={<RefreshCw className="h-7 w-7 animate-spin" />}
              eyebrow="content loading"
              title="正在加载日记内容..."
              description="会话、界面设置和条目数据正在同步，完成后会直接进入阅读区。"
              isMobile={isMobile}
            />
          ) : (
            <div className="space-y-6">
              <AppBrowsePanel
                entries={entries}
                filterMeta={filterMeta}
                viewMode={viewMode}
                dataMode={dataMode}
                activeBrowse={activeBrowse}
                accessibleEntriesCount={accessibleEntriesCount}
                displayEntriesCount={displayEntries.length}
                interfaceSettings={interfaceSettings}
                interfaceSettingsLoading={interfaceSettingsLoading}
                isAdminAuthenticated={isAdminAuthenticated}
                isSearchPending={isSearchPending}
                isSwitchingDataMode={isSwitchingDataMode}
                onClearActiveBrowsing={handleClearActiveBrowsing}
                onClearQuickFilters={handleClearQuickFilters}
                onClearSearch={handleClearSearch}
                onDataModeChange={handleDataModeChange}
                onOpenExportModal={() => setIsExportModalOpen(true)}
                onQuickFilterResults={handleQuickFilterResults}
                onQuickFilterSummaryChange={onQuickFilterSummaryChange}
                onSearchPendingChange={onSearchPendingChange}
                onSearchQueryChange={onSearchQueryChange}
                onSearchResults={handleSearchResults}
                onSearchSummaryChange={onSearchSummaryChange}
                onViewModeChange={handleViewModeChange}
                quickFilterClearRequest={quickFilterClearRequest}
                quickFilterResetSignal={quickFilterResetSignal}
                searchClearRequest={searchClearRequest}
                searchResetSignal={searchResetSignal}
              />

              <ActiveBrowseSummary
                activeBrowse={activeBrowse}
                canExport={canExportCurrentResults && Boolean(activeBrowse.mode)}
                isSearchPending={isSearchPending}
                onClearBrowseChip={handleClearBrowseChip}
                onOpenExportModal={() => setIsExportModalOpen(true)}
              />

              <div
                className="transition-all duration-200"
                style={{
                  opacity: isSearchPending ? 0.72 : 1,
                  transform: isSearchPending ? 'translateY(4px)' : 'translateY(0px)',
                }}
              >
                <Suspense fallback={suspenseFallback}>
                  <Timeline
                    entries={displayEntries}
                    onEdit={openEditEntry}
                    searchQuery={activeSearchQuery}
                    viewMode={viewMode}
                    highlightEntryId={highlightEntryId}
                    isPending={isSearchPending}
                    recommendationsEnabled={interfaceSettings.recommendations.enabled}
                  />
                </Suspense>
              </div>
            </div>
          )}
        </main>

        {isFormOpen && (
          <Suspense fallback={null}>
            <DiaryForm
              key={`diary-form-${editingEntry?.id || 'new'}-${isFormOpen}`}
              entry={editingEntry}
              onSave={handleSave}
              onCancel={closeForm}
              isOpen={isFormOpen}
            />
          </Suspense>
        )}

        {isAdminPanelOpen && (
          <Suspense fallback={null}>
            <AdminPanel
              isOpen={isAdminPanelOpen}
              onClose={() => setIsAdminPanelOpen(false)}
              entries={entries}
              onEntriesUpdate={refreshEntries}
              onSessionChange={handleSessionChange}
              onInterfaceSettingsChange={refreshInterfaceSettings}
              onDeleteEntry={deleteEntry}
              onEdit={openEditEntry}
            />
          </Suspense>
        )}

        {isExportModalOpen && (
          <Suspense fallback={null}>
            <ExportModal
              isOpen={isExportModalOpen}
              onClose={() => setIsExportModalOpen(false)}
              entries={displayEntries}
              exportType={activeBrowse.exportType}
            />
          </Suspense>
        )}

        {notification.visible && (
          <NotificationToast
            message={notification.message}
            type={notification.type}
            onClose={hideNotification}
          />
        )}
      </div>
    </>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AdminAuthProvider>
        <AppContent />
      </AdminAuthProvider>
    </ThemeProvider>
  );
}

export default App;
