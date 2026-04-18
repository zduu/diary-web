import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminAuthProvider } from './AdminAuthContext';
import { AdminPanel } from './AdminPanel';
import { ThemeProvider } from './ThemeProvider';
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

describe('AdminPanel', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    document.body.className = '';
    vi.restoreAllMocks();
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

    await user.type(screen.getByPlaceholderText('输入管理员密码'), 'admin-pass');
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

    const input = screen.getByPlaceholderText('输入管理员密码') as HTMLInputElement;
    await user.type(input, 'wrong-pass');
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

    await user.type(screen.getByPlaceholderText('输入管理员密码'), 'admin-pass');
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

    await user.type(screen.getByPlaceholderText('输入管理员密码'), 'admin-pass');
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

    await user.type(screen.getByPlaceholderText('输入管理员密码'), 'admin-pass');
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

    await user.type(screen.getByPlaceholderText('输入管理员密码'), 'admin-pass');
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
});
