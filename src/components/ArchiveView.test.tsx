import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { AdminAuthProvider } from './AdminAuthContext';
import { ArchiveView } from './ArchiveView';
import { ThemeProvider } from './ThemeProvider';
import type { DiaryEntry } from '../types/index.ts';

function renderArchiveView(entries: DiaryEntry[]) {
  return render(
    <ThemeProvider>
      <AdminAuthProvider>
        <ArchiveView entries={entries} />
      </AdminAuthProvider>
    </ThemeProvider>
  );
}

describe('ArchiveView', () => {
  afterEach(() => {
    cleanup();
  });

  it('uses the displayed archive order for preview navigation', async () => {
    const user = userEvent.setup();
    const olderEntry: DiaryEntry = {
      id: 1,
      title: '较早归档',
      content: '旧记录',
      created_at: '2025-01-01T09:00:00.000Z',
    };
    const newerEntry: DiaryEntry = {
      id: 2,
      title: '较新归档',
      content: '新记录',
      created_at: '2026-04-14T09:00:00.000Z',
    };

    renderArchiveView([olderEntry, newerEntry]);

    await user.click(await screen.findByText('较新归档'));

    expect(await screen.findByText('日记预览')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('keeps previewing the same entry when archive order changes', async () => {
    const user = userEvent.setup();
    const firstEntry: DiaryEntry = {
      id: 10,
      title: '保持打开的归档',
      content: '归档正文一',
      created_at: '2026-04-14T09:00:00.000Z',
    };
    const secondEntry: DiaryEntry = {
      id: 11,
      title: '移动到前面的归档',
      content: '归档正文二',
      created_at: '2026-04-13T09:00:00.000Z',
    };
    const { rerender } = renderArchiveView([firstEntry, secondEntry]);

    await user.click(await screen.findByText('保持打开的归档'));

    rerender(
      <ThemeProvider>
        <AdminAuthProvider>
          <ArchiveView entries={[
            { ...firstEntry, created_at: '2026-04-12T09:00:00.000Z' },
            { ...secondEntry, created_at: '2026-04-15T09:00:00.000Z' },
          ]} />
        </AdminAuthProvider>
      </ThemeProvider>
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('保持打开的归档')).toBeInTheDocument();
    expect(within(dialog).getByText('2 / 2')).toBeInTheDocument();
    expect(within(dialog).queryByText('移动到前面的归档')).not.toBeInTheDocument();
  });

  it('renders legacy entries without ids', async () => {
    renderArchiveView([
      {
        title: '无 id 旧数据一',
        content: '旧记录',
        created_at: '2026-04-14T09:00:00.000Z',
      },
      {
        title: '无 id 旧数据二',
        content: '旧记录',
        created_at: '2026-04-14T08:00:00.000Z',
      },
    ]);

    expect(await screen.findByText('无 id 旧数据一')).toBeInTheDocument();
    expect(screen.getByText('无 id 旧数据二')).toBeInTheDocument();
  });

  it('renders archive DOM anchors only for valid persisted ids', async () => {
    renderArchiveView([
      {
        id: 12,
        title: '有效归档锚点',
        content: '归档记录',
        created_at: '2026-04-14T09:00:00.000Z',
      },
      {
        id: 0,
        title: '无效归档锚点',
        content: '归档记录',
        created_at: '2026-04-13T09:00:00.000Z',
      },
    ]);

    expect(await screen.findByText('有效归档锚点')).toBeInTheDocument();
    expect(screen.getByText('无效归档锚点')).toBeInTheDocument();
    expect(document.getElementById('entry-12')).not.toBeNull();
    expect(document.getElementById('entry-0')).toBeNull();
  });
});
