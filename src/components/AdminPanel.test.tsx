import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminAuthProvider } from './AdminAuthContext';
import { AdminPanel } from './AdminPanel';
import { AdminEntriesSection, formatAdminSyncDescription } from './admin/AdminPanelViews';
import { ThemeProvider } from './ThemeProvider';
import type { ThemeConfig } from '../hooks/useTheme';
import { apiService } from '../services/api';
import * as adminSettingsStore from './admin/adminSettingsStore';
import * as adminPanelActions from './admin/adminPanelActions';

function renderWithProviders(ui: ReactElement) {
  return render(
    <ThemeProvider>
      <AdminAuthProvider>{ui}</AdminAuthProvider>
    </ThemeProvider>
  );
}

const defaultLoadedSettings: Awaited<ReturnType<typeof adminSettingsStore.loadAdminPanelSettings>> = {
  settings: {
    passwordProtection: false,
    adminPasswordConfigured: true,
    showHiddenEntries: false,
    welcomePageEnabled: true,
  },
  passwordSettings: {
    enabled: false,
    configured: true,
  },
  interfaceSettings: {
    readingDesk: {
      enabled: true,
    },
    quickFilters: {
      enabled: true,
    },
    export: {
      enabled: true,
    },
    archiveView: {
      enabled: true,
    },
    recommendations: {
      enabled: true,
    },
    browseStatus: {
      enabled: true,
    },
    deviceStatus: {
      enabled: true,
    },
  },
};

const sampleEntry = {
  id: 1,
  title: '测试日记',
  content: '这是一条用于后台测试的日记内容',
  content_type: 'markdown' as const,
  mood: 'happy',
  weather: 'sunny',
  tags: ['测试'],
  images: [],
  hidden: false,
  created_at: '2026-04-12T10:00:00.000Z',
  updated_at: '2026-04-12T10:00:00.000Z',
};

const testTheme: ThemeConfig = {
  mode: 'light',
  colors: {
    primary: '#3b82f6',
    secondary: '#64748b',
    background: '#f9fafb',
    surface: '#ffffff',
    text: '#111827',
    textSecondary: '#64748b',
    border: '#e5e7eb',
    accent: '#6366f1',
  },
  effects: {
    blur: 'backdrop-blur-sm',
    shadow: 'shadow-md',
    gradient: 'bg-white',
  },
};

const syncedStatus = {
  totalEntries: 0,
  visibleEntries: 0,
  pendingCreates: 0,
  pendingUpdates: 0,
  pendingDeletes: 0,
  conflicts: 0,
  totalPending: 0,
  lastSyncedAt: '2026-04-18T11:00:00.000Z',
};

async function fillAdminPassword(user: ReturnType<typeof userEvent.setup>, password: string) {
  const input = await screen.findByPlaceholderText('输入管理员密码');
  await user.type(input, password);
  return input as HTMLInputElement;
}

describe('AdminPanel', () => {
  beforeEach(() => {
    vi.spyOn(apiService, 'getAdminAccessProfile').mockResolvedValue({
      mode: 'remote',
      requiresPassword: true,
      remoteBound: false,
      remoteSyncConfigured: false,
      remoteSyncBaseUrl: '',
    });
    vi.spyOn(apiService, 'getRemoteBindingDefaults').mockResolvedValue({
      baseUrl: '',
      syncToken: '',
    });
    vi.spyOn(apiService, 'isNativeApp').mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    document.documentElement.className = '';
    document.body.className = '';
    vi.restoreAllMocks();
  });

  it('formats sync status descriptions without leaking invalid dates', () => {
    expect(formatAdminSyncDescription(null, false)).toBe('正在读取本地同步状态。');
    expect(formatAdminSyncDescription(syncedStatus, true)).toBe('正在把本地改动推送到云端，请稍候。');
    expect(formatAdminSyncDescription({
      ...syncedStatus,
      pendingCreates: 1,
      pendingUpdates: 2,
      pendingDeletes: 3,
      conflicts: 1,
      totalPending: 6,
    }, false)).toBe('待同步 6 条，新增 1 / 更新 2 / 删除 3 / 冲突 1');
    expect(formatAdminSyncDescription(syncedStatus, false)).toMatch(/^当前无待同步内容，上次同步于 /);
    expect(formatAdminSyncDescription({
      ...syncedStatus,
      lastSyncedAt: 'not-a-date',
    }, false)).toBe('当前无待同步内容，上次同步于 未知时间');
    expect(formatAdminSyncDescription({
      ...syncedStatus,
      lastSyncedAt: null,
    }, false)).toBe('当前无待同步内容，还没有执行过云端同步。');
  });

  it('logs in successfully and switches to the admin view', async () => {
    vi.spyOn(apiService, 'loginAdmin').mockResolvedValue({
      isAuthenticated: true,
      isAdminAuthenticated: true,
    });
    const loadSettingsSpy = vi
      .spyOn(adminSettingsStore, 'loadAdminPanelSettings')
      .mockResolvedValue(defaultLoadedSettings);
    const onSessionChange = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <AdminPanel
        isOpen={true}
        onClose={vi.fn()}
        entries={[]}
        onEntriesUpdate={vi.fn()}
        onSessionChange={onSessionChange}
      />
    );

    await fillAdminPassword(user, 'admin-pass');
    await user.click(screen.getByRole('button', { name: '验证' }));

    await waitFor(() => {
      expect(apiService.loginAdmin).toHaveBeenCalledWith('admin-pass');
      expect(onSessionChange).toHaveBeenCalledWith({
        isAuthenticated: true,
        isAdminAuthenticated: true,
      });
      expect(loadSettingsSpy).toHaveBeenCalled();
    });

    expect(await screen.findByRole('button', { name: '退出登录' })).toBeInTheDocument();
    expect(screen.getByText('暂无日记')).toBeInTheDocument();
  });

  it('disables id-based entry actions for legacy entries without ids', () => {
    const onToggleVisibility = vi.fn();
    const onDeleteEntry = vi.fn();

    render(
      <AdminEntriesSection
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        filteredEntries={[
          {
            title: '无 id 后台记录',
            content: '旧数据仍应可展示',
            created_at: 'not-a-date',
          },
        ]}
        entryTimestampLabels={{ 'index-0': '未知时间' }}
        theme={testTheme}
        getTextColor={(type) => (type === 'primary' ? testTheme.colors.text : testTheme.colors.textSecondary)}
        getOperationState={() => 'idle'}
        onEditEntry={vi.fn()}
        onToggleVisibility={onToggleVisibility}
        onDeleteEntry={onDeleteEntry}
      />
    );

    expect(screen.getByText('无 id 后台记录')).toBeInTheDocument();
    expect(screen.queryByTitle('编辑日记')).not.toBeInTheDocument();
    expect(screen.getByTitle('缺少日记 ID，无法切换显示状态')).toBeDisabled();
    expect(screen.getByTitle('缺少日记 ID，无法删除')).toBeDisabled();

    fireEvent.click(screen.getByTitle('缺少日记 ID，无法切换显示状态'));
    fireEvent.click(screen.getByTitle('缺少日记 ID，无法删除'));

    expect(onToggleVisibility).not.toHaveBeenCalled();
    expect(onDeleteEntry).not.toHaveBeenCalled();
  });

  it('shows an error notification when login fails', async () => {
    vi.spyOn(apiService, 'loginAdmin').mockRejectedValue(new Error('管理员密码错误'));
    const user = userEvent.setup();

    renderWithProviders(
      <AdminPanel
        isOpen={true}
        onClose={vi.fn()}
        entries={[]}
        onEntriesUpdate={vi.fn()}
      />
    );

    const input = await fillAdminPassword(user, 'wrong-pass');
    await user.click(screen.getByRole('button', { name: '验证' }));

    expect(await screen.findByText('管理员密码错误')).toBeInTheDocument();
    expect(input.value).toBe('');
    expect(screen.queryByRole('button', { name: '退出登录' })).not.toBeInTheDocument();
  });

  it('confirms logout and returns to the login view', async () => {
    vi.spyOn(apiService, 'loginAdmin').mockResolvedValue({
      isAuthenticated: true,
      isAdminAuthenticated: true,
    });
    vi.spyOn(apiService, 'logout').mockResolvedValue();
    vi.spyOn(adminSettingsStore, 'loadAdminPanelSettings').mockResolvedValue(defaultLoadedSettings);
    const onClose = vi.fn();
    const onSessionChange = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <AdminPanel
        isOpen={true}
        onClose={onClose}
        entries={[]}
        onEntriesUpdate={vi.fn()}
        onSessionChange={onSessionChange}
      />
    );

    await fillAdminPassword(user, 'admin-pass');
    await user.click(screen.getByRole('button', { name: '验证' }));
    expect(await screen.findByRole('button', { name: '退出登录' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '退出登录' }));
    expect(await screen.findByText('退出管理员登录')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '确认退出' }));

    await waitFor(() => {
      expect(apiService.logout).toHaveBeenCalledTimes(1);
      expect(onSessionChange).toHaveBeenCalledWith({
        isAuthenticated: false,
        isAdminAuthenticated: false,
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByPlaceholderText('输入管理员密码')).toBeInTheDocument();
  });

  it('shows an error notification when confirmed logout fails', async () => {
    vi.spyOn(apiService, 'loginAdmin').mockResolvedValue({
      isAuthenticated: true,
      isAdminAuthenticated: true,
    });
    vi.spyOn(apiService, 'logout').mockRejectedValue(new Error('退出登录失败'));
    vi.spyOn(adminSettingsStore, 'loadAdminPanelSettings').mockResolvedValue(defaultLoadedSettings);
    const onClose = vi.fn();
    const onSessionChange = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <AdminPanel
        isOpen={true}
        onClose={onClose}
        entries={[]}
        onEntriesUpdate={vi.fn()}
        onSessionChange={onSessionChange}
      />
    );

    await fillAdminPassword(user, 'admin-pass');
    await user.click(screen.getByRole('button', { name: '验证' }));
    expect(await screen.findByRole('button', { name: '退出登录' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '退出登录' }));
    await user.click(await screen.findByRole('button', { name: '确认退出' }));

    expect(await screen.findByText('退出登录失败')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('退出管理员登录')).toBeInTheDocument();
  });

  it('toggles entry visibility and refreshes the admin list', async () => {
    vi.spyOn(apiService, 'loginAdmin').mockResolvedValue({
      isAuthenticated: true,
      isAdminAuthenticated: true,
    });
    vi.spyOn(apiService, 'toggleEntryVisibility').mockResolvedValue({
      ...sampleEntry,
      hidden: true,
    });
    vi.spyOn(adminSettingsStore, 'loadAdminPanelSettings').mockResolvedValue(defaultLoadedSettings);
    const onEntriesUpdate = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <AdminPanel
        isOpen={true}
        onClose={vi.fn()}
        entries={[sampleEntry]}
        onEntriesUpdate={onEntriesUpdate}
      />
    );

    await fillAdminPassword(user, 'admin-pass');
    await user.click(screen.getByRole('button', { name: '验证' }));
    expect(await screen.findByRole('button', { name: '退出登录' })).toBeInTheDocument();

    await user.click(screen.getByTitle('隐藏日记'));

    await waitFor(() => {
      expect(apiService.toggleEntryVisibility).toHaveBeenCalledWith(1);
      expect(onEntriesUpdate).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText('日记已隐藏')).toBeInTheDocument();
  });

  it('toggles app password protection and refreshes interface settings', async () => {
    vi.spyOn(apiService, 'loginAdmin').mockResolvedValue({
      isAuthenticated: true,
      isAdminAuthenticated: true,
    });
    vi.spyOn(adminSettingsStore, 'loadAdminPanelSettings').mockResolvedValue(defaultLoadedSettings);
    const persistPasswordSettingsSpy = vi
      .spyOn(adminSettingsStore, 'persistPasswordSettings')
      .mockResolvedValue();
    const onInterfaceSettingsChange = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <AdminPanel
        isOpen={true}
        onClose={vi.fn()}
        entries={[]}
        onEntriesUpdate={vi.fn()}
        onInterfaceSettingsChange={onInterfaceSettingsChange}
      />
    );

    await fillAdminPassword(user, 'admin-pass');
    await user.click(screen.getByRole('button', { name: '验证' }));
    expect(await screen.findByRole('button', { name: '退出登录' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /开启访问密码/ }));

    await waitFor(() => {
      expect(persistPasswordSettingsSpy).toHaveBeenCalledWith({
        enabled: true,
        configured: true,
      });
      expect(onInterfaceSettingsChange).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText('应用密码保护已开启！')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /关闭访问密码/ })).toBeInTheDocument();
  });

  it('shows an error notification when welcome page setting fails to save', async () => {
    vi.spyOn(apiService, 'loginAdmin').mockResolvedValue({
      isAuthenticated: true,
      isAdminAuthenticated: true,
    });
    vi.spyOn(adminSettingsStore, 'loadAdminPanelSettings').mockResolvedValue(defaultLoadedSettings);
    vi.spyOn(adminSettingsStore, 'persistAdminSettings').mockRejectedValue(new Error('保存欢迎页设置失败'));
    const user = userEvent.setup();

    renderWithProviders(
      <AdminPanel
        isOpen={true}
        onClose={vi.fn()}
        entries={[]}
        onEntriesUpdate={vi.fn()}
      />
    );

    await fillAdminPassword(user, 'admin-pass');
    await user.click(screen.getByRole('button', { name: '验证' }));
    expect(await screen.findByRole('button', { name: '退出登录' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /禁用欢迎页面/ }));

    expect(await screen.findByText('保存欢迎页设置失败')).toBeInTheDocument();
  });

  it('shows an error notification when exporting entries fails', async () => {
    vi.spyOn(apiService, 'loginAdmin').mockResolvedValue({
      isAuthenticated: true,
      isAdminAuthenticated: true,
    });
    vi.spyOn(adminSettingsStore, 'loadAdminPanelSettings').mockResolvedValue(defaultLoadedSettings);
    vi.spyOn(adminPanelActions, 'exportEntriesToJson').mockImplementation(() => {
      throw new Error('导出文件失败');
    });
    const user = userEvent.setup();

    renderWithProviders(
      <AdminPanel
        isOpen={true}
        onClose={vi.fn()}
        entries={[sampleEntry]}
        onEntriesUpdate={vi.fn()}
      />
    );

    await fillAdminPassword(user, 'admin-pass');
    await user.click(screen.getByRole('button', { name: '验证' }));
    expect(await screen.findByRole('button', { name: '退出登录' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /导出数据/ }));

    expect(await screen.findByText('导出文件失败')).toBeInTheDocument();
  });

  it('shows the import mode dialog inside the admin panel and refreshes after import', async () => {
    vi.spyOn(apiService, 'loginAdmin').mockResolvedValue({
      isAuthenticated: true,
      isAdminAuthenticated: true,
    });
    vi.spyOn(adminSettingsStore, 'loadAdminPanelSettings').mockResolvedValue(defaultLoadedSettings);
    vi.spyOn(adminPanelActions, 'parseEntriesBackup').mockResolvedValue([
      {
        title: '导入的日记',
        content: '导入内容',
      },
    ]);
    vi.spyOn(apiService, 'batchImportEntries').mockResolvedValue([]);
    const onEntriesUpdate = vi.fn(async () => {});
    const user = userEvent.setup();

    renderWithProviders(
      <AdminPanel
        isOpen={true}
        onClose={vi.fn()}
        entries={[sampleEntry]}
        onEntriesUpdate={onEntriesUpdate}
      />
    );

    await fillAdminPassword(user, 'admin-pass');
    await user.click(screen.getByRole('button', { name: '验证' }));
    expect(await screen.findByRole('button', { name: '退出登录' })).toBeInTheDocument();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();

    fireEvent.change(fileInput!, {
      target: {
        files: [new File(['{}'], 'backup.json', { type: 'application/json' })],
      },
    });

    expect(await screen.findByText('选择导入模式')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '确认导入' }));

    await waitFor(() => {
      expect(apiService.batchImportEntries).toHaveBeenCalledWith([
        {
          title: '导入的日记',
          content: '导入内容',
        },
      ], { overwrite: false });
      expect(onEntriesUpdate).toHaveBeenCalledTimes(1);
    });

    await screen.findByText('合并导入成功！已导入 1 条日记。');
    expect(screen.queryByText('选择导入模式')).not.toBeInTheDocument();
  });

  it('imports embedded backup images without calling the upload endpoint', async () => {
    vi.spyOn(apiService, 'loginAdmin').mockResolvedValue({
      isAuthenticated: true,
      isAdminAuthenticated: true,
    });
    vi.spyOn(adminSettingsStore, 'loadAdminPanelSettings').mockResolvedValue(defaultLoadedSettings);
    vi.spyOn(adminPanelActions, 'parseEntriesBackup').mockResolvedValue([
      {
        title: '带图片的导入日记',
        content: '导入内容',
        images: ['data:image/png;base64,aGVsbG8='],
      },
    ]);
    vi.spyOn(apiService, 'batchImportEntries').mockResolvedValue([]);
    const uploadImageSpy = vi.spyOn(apiService, 'uploadImage');
    const onEntriesUpdate = vi.fn(async () => {});
    const user = userEvent.setup();

    renderWithProviders(
      <AdminPanel
        isOpen={true}
        onClose={vi.fn()}
        entries={[sampleEntry]}
        onEntriesUpdate={onEntriesUpdate}
      />
    );

    await fillAdminPassword(user, 'admin-pass');
    await user.click(screen.getByRole('button', { name: '验证' }));
    expect(await screen.findByRole('button', { name: '退出登录' })).toBeInTheDocument();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();

    fireEvent.change(fileInput!, {
      target: {
        files: [new File(['{}'], 'backup.json', { type: 'application/json' })],
      },
    });

    expect(await screen.findByText('选择导入模式')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '确认导入' }));

    await waitFor(() => {
      expect(uploadImageSpy).not.toHaveBeenCalled();
      expect(apiService.batchImportEntries).toHaveBeenCalledWith([
        {
          title: '带图片的导入日记',
          content: '导入内容',
          images: ['data:image/png;base64,aGVsbG8='],
        },
      ], { overwrite: false });
      expect(onEntriesUpdate).toHaveBeenCalledTimes(1);
    });
  });

  it('allows local devices to enter admin without a password before binding', async () => {
    vi.spyOn(apiService, 'getAdminAccessProfile').mockResolvedValue({
      mode: 'local',
      requiresPassword: false,
      remoteBound: false,
      remoteSyncConfigured: false,
      remoteSyncBaseUrl: '',
    });
    vi.spyOn(apiService, 'loginAdmin').mockResolvedValue({
      isAuthenticated: true,
      isAdminAuthenticated: true,
    });
    vi.spyOn(adminSettingsStore, 'loadAdminPanelSettings').mockResolvedValue(defaultLoadedSettings);
    const onSessionChange = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <AdminPanel
        isOpen={true}
        onClose={vi.fn()}
        entries={[]}
        onEntriesUpdate={vi.fn()}
        onSessionChange={onSessionChange}
      />
    );

    await user.click(await screen.findByRole('button', { name: '直接进入本地管理' }));

    await waitFor(() => {
      expect(apiService.loginAdmin).toHaveBeenCalledWith('');
      expect(onSessionChange).toHaveBeenCalledWith({
        isAuthenticated: true,
        isAdminAuthenticated: true,
      });
    });
  });

  it('supports rebinding remote admin credentials from the login view', async () => {
    vi.spyOn(apiService, 'isNativeApp').mockReturnValue(true);
    vi.spyOn(apiService, 'getAdminAccessProfile').mockResolvedValue({
      mode: 'local',
      requiresPassword: true,
      remoteBound: true,
      remoteSyncConfigured: true,
      remoteSyncBaseUrl: 'https://diary.example.com',
    });
    vi.spyOn(apiService, 'getRemoteBindingDefaults').mockResolvedValue({
      baseUrl: 'https://diary.example.com',
      syncToken: 'saved-sync-token',
    });
    vi.spyOn(apiService, 'bindRemoteAdmin').mockResolvedValue();
    vi.spyOn(apiService, 'getLocalSyncStatus').mockResolvedValue({
      totalEntries: 0,
      visibleEntries: 0,
      pendingCreates: 0,
      pendingUpdates: 0,
      pendingDeletes: 0,
      conflicts: 0,
      totalPending: 0,
      lastSyncedAt: null,
    });
    vi.spyOn(apiService, 'getRemoteSyncConfig').mockResolvedValue({
      baseUrl: 'https://diary.example.com',
      syncToken: 'saved-sync-token',
    });
    vi.spyOn(adminSettingsStore, 'loadAdminPanelSettings').mockResolvedValue(defaultLoadedSettings);
    const onSessionChange = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <AdminPanel
        isOpen={true}
        onClose={vi.fn()}
        entries={[]}
        onEntriesUpdate={vi.fn()}
        onSessionChange={onSessionChange}
      />
    );

    await user.click(await screen.findByRole('button', { name: '重新绑定远程' }));
    await user.type(screen.getByPlaceholderText('输入远程管理员密码'), 'remote-admin-pass');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: '重新绑定并登录' }));

    await waitFor(() => {
      expect(apiService.bindRemoteAdmin).toHaveBeenCalledWith({
        baseUrl: 'https://diary.example.com',
        syncToken: 'saved-sync-token',
        adminPassword: 'remote-admin-pass',
        syncLocalEntries: true,
      });
      expect(onSessionChange).toHaveBeenCalledWith({
        isAuthenticated: true,
        isAdminAuthenticated: true,
      });
    });
  });

  it('does not show apk remote binding actions on web admin panel', async () => {
    vi.spyOn(apiService, 'getAdminAccessProfile').mockResolvedValue({
      mode: 'local',
      requiresPassword: false,
      remoteBound: false,
      remoteSyncConfigured: false,
      remoteSyncBaseUrl: '',
    });
    const user = userEvent.setup();

    renderWithProviders(
      <AdminPanel
        isOpen={true}
        onClose={vi.fn()}
        entries={[]}
        onEntriesUpdate={vi.fn()}
      />
    );

    expect(await screen.findByRole('button', { name: '直接进入本地管理' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '绑定远程' })).not.toBeInTheDocument();
    expect(screen.queryByText('APK 远程绑定')).not.toBeInTheDocument();
    expect(screen.queryByText('手动同步到云端')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '直接进入本地管理' }));
  });
});
