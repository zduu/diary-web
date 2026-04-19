import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiService } from '../services/api';
import { renderWithTheme } from '../test/renderWithTheme';
import { PasswordProtection } from './PasswordProtection';

describe('PasswordProtection', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    document.documentElement.className = '';
    document.body.className = '';
  });

  it('auto-authenticates when password protection is disabled', async () => {
    const onAuthenticated = vi.fn();

    renderWithTheme(
      <PasswordProtection
        onAuthenticated={onAuthenticated}
        passwordSettings={{ enabled: false }}
      />
    );

    await waitFor(() => {
      expect(onAuthenticated).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByPlaceholderText('请输入访问密码')).not.toBeInTheDocument();
  });

  it('submits the password and authenticates on success', async () => {
    const loginSpy = vi.spyOn(apiService, 'loginApp').mockResolvedValue({
      isAuthenticated: true,
      isAdminAuthenticated: false,
    });
    const onAuthenticated = vi.fn();
    const user = userEvent.setup();

    renderWithTheme(
      <PasswordProtection
        onAuthenticated={onAuthenticated}
        passwordSettings={{ enabled: true }}
      />
    );

    await user.type(screen.getByPlaceholderText('请输入访问密码'), 'reader-pass');
    await user.click(screen.getByRole('button', { name: '进入应用' }));

    await waitFor(() => {
      expect(loginSpy).toHaveBeenCalledWith('reader-pass');
      expect(onAuthenticated).toHaveBeenCalledTimes(1);
    });
  });

  it('shows the server error and clears the password on failure', async () => {
    vi.spyOn(apiService, 'loginApp').mockRejectedValue(new Error('访问密码错误'));
    const onAuthenticated = vi.fn();
    const user = userEvent.setup();

    renderWithTheme(
      <PasswordProtection
        onAuthenticated={onAuthenticated}
        passwordSettings={{ enabled: true }}
      />
    );

    const input = screen.getByPlaceholderText('请输入访问密码') as HTMLInputElement;
    await user.type(input, 'wrong-pass');
    await user.click(screen.getByRole('button', { name: '进入应用' }));

    expect(await screen.findByText('访问密码错误')).toBeInTheDocument();
    expect(input.value).toBe('');
    expect(onAuthenticated).not.toHaveBeenCalled();
  });
});
