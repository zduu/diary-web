import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminAuthProvider } from './AdminAuthContext';
import { EntryPreviewModal } from './EntryPreviewModal';
import { ThemeProvider } from './ThemeProvider';
import type { DiaryEntry } from '../types/index.ts';

function renderPreview(entry: DiaryEntry, currentIndex: number, onEdit?: (entry: DiaryEntry) => void) {
  return render(
    <ThemeProvider>
      <AdminAuthProvider>
        <EntryPreviewModal
          entry={entry}
          isOpen
          onClose={vi.fn()}
          onEdit={onEdit}
          currentIndex={currentIndex}
          totalCount={2}
        />
      </AdminAuthProvider>
    </ThemeProvider>
  );
}

describe('EntryPreviewModal', () => {
  afterEach(() => {
    cleanup();
  });

  it('resets the active image when switching between entries without ids', () => {
    const firstEntry: DiaryEntry = {
      title: '第一条无 id',
      content: '第一条内容',
      images: ['https://example.com/first-1.jpg', 'https://example.com/first-2.jpg'],
      created_at: '2026-04-14T09:00:00.000Z',
    };
    const secondEntry: DiaryEntry = {
      title: '第二条无 id',
      content: '第二条内容',
      images: ['https://example.com/second-1.jpg', 'https://example.com/second-2.jpg'],
      created_at: '2026-04-15T09:00:00.000Z',
    };

    const { rerender } = renderPreview(firstEntry, 0);

    fireEvent.click(screen.getByAltText('缩略图 2'));
    expect(screen.getByAltText('预览图片 2')).toHaveAttribute('src', 'https://example.com/first-2.jpg');

    rerender(
      <ThemeProvider>
        <AdminAuthProvider>
          <EntryPreviewModal
            entry={secondEntry}
            isOpen
            onClose={vi.fn()}
            currentIndex={1}
            totalCount={2}
          />
        </AdminAuthProvider>
      </ThemeProvider>
    );

    expect(screen.getByAltText('预览图片 1')).toHaveAttribute('src', 'https://example.com/second-1.jpg');
  });

  it('does not show the edit button for legacy entries without persisted ids', () => {
    const onEdit = vi.fn();

    renderPreview({
      title: '无 id 旧数据',
      content: '旧数据内容',
      created_at: '2026-04-14T09:00:00.000Z',
    }, 0, onEdit);

    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument();
  });

  it('filters unsafe entry images before rendering the preview gallery', () => {
    renderPreview({
      title: '含异常图片',
      content: '预览内容',
      images: [
        'javascript:alert(1)',
        'https://example.com/safe.jpg',
      ],
      created_at: '2026-04-14T09:00:00.000Z',
    }, 0);

    expect(screen.getByAltText('预览图片 1')).toHaveAttribute('src', 'https://example.com/safe.jpg');
    expect(screen.queryByAltText('缩略图 2')).not.toBeInTheDocument();
  });
});
