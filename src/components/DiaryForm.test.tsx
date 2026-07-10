import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiaryEntry } from '../types/index.ts';
import {
  MAX_ENTRY_CONTENT_LENGTH,
  MAX_ENTRY_MOOD_LENGTH,
  MAX_ENTRY_TAG_LENGTH,
  MAX_ENTRY_TAGS_COUNT,
  MAX_ENTRY_TITLE_LENGTH,
  MAX_ENTRY_WEATHER_LENGTH,
} from '../utils/entryTextValidation';
import { renderWithTheme } from '../test/renderWithTheme';
import { DiaryForm } from './DiaryForm';

vi.mock('./ImageUpload', () => ({
  ImageUpload: ({ images }: { images: string[] }) => (
    <div data-testid="image-upload-images">{images.join('|')}</div>
  ),
}));

vi.mock('./LocationPicker', () => ({
  LocationPicker: () => <div data-testid="location-picker" />,
}));

vi.mock('./MarkdownEditor', () => ({
  MarkdownEditor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea
      aria-label="markdown-editor"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

describe('DiaryForm', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('filters unsafe legacy image sources when editing and saving entries', async () => {
    const entry: DiaryEntry = {
      id: 1,
      title: '旧图片数据',
      content: '正文内容',
      content_type: 'plain',
      images: [
        'javascript:alert(1)',
        '/api/images/safe.png',
        'data:text/html;base64,PGgxPkJvb208L2gxPg==',
      ],
      created_at: '2026-04-12T10:00:00.000Z',
      updated_at: '2026-04-12T10:00:00.000Z',
    };
    const onSave = vi.fn(async () => {});

    renderWithTheme(
      <DiaryForm
        entry={entry}
        isOpen
        onSave={onSave}
        onCancel={vi.fn()}
      />
    );

    expect(await screen.findByTestId('image-upload-images')).toHaveTextContent('/api/images/safe.png');
    expect(screen.getByTestId('image-upload-images')).not.toHaveTextContent('javascript:alert(1)');

    fireEvent.click(screen.getByRole('button', { name: '保存日记' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        images: ['/api/images/safe.png'],
      }));
    });
  });

  it('sanitizes legacy tags and exposes shared input length limits', async () => {
    const validTags = Array.from({ length: MAX_ENTRY_TAGS_COUNT }, (_, index) => `tag-${index}`);
    const entry: DiaryEntry = {
      id: 2,
      title: '旧标签数据',
      content: '正文内容',
      content_type: 'plain',
      tags: [
        ...validTags,
        'x'.repeat(MAX_ENTRY_TAG_LENGTH + 1),
        'extra-tag',
      ],
      created_at: '2026-04-12T10:00:00.000Z',
      updated_at: '2026-04-12T10:00:00.000Z',
    };
    const onSave = vi.fn(async () => {});

    renderWithTheme(
      <DiaryForm
        entry={entry}
        isOpen
        onSave={onSave}
        onCancel={vi.fn()}
      />
    );

    const titleInput = screen.getByPlaceholderText('为这篇日记起个标题吧...');
    const tagInput = screen.getByPlaceholderText('添加标签...');
    expect(titleInput).toHaveAttribute('maxLength', String(MAX_ENTRY_TITLE_LENGTH));
    expect(tagInput).toHaveAttribute('maxLength', String(MAX_ENTRY_TAG_LENGTH));
    expect(screen.getByRole('button', { name: '添加' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '保存日记' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        tags: validTags,
      }));
    });
  });

  it('clamps legacy text fields when initializing and saving entries', async () => {
    const entry: DiaryEntry = {
      id: 3,
      title: 't'.repeat(MAX_ENTRY_TITLE_LENGTH + 5),
      content: 'c'.repeat(MAX_ENTRY_CONTENT_LENGTH + 5),
      content_type: 'plain',
      mood: 'm'.repeat(MAX_ENTRY_MOOD_LENGTH + 5),
      weather: 'w'.repeat(MAX_ENTRY_WEATHER_LENGTH + 5),
      created_at: '2026-04-12T10:00:00.000Z',
      updated_at: '2026-04-12T10:00:00.000Z',
    };
    const onSave = vi.fn(async () => {});

    renderWithTheme(
      <DiaryForm
        entry={entry}
        isOpen
        onSave={onSave}
        onCancel={vi.fn()}
      />
    );

    const titleInput = screen.getByPlaceholderText('为这篇日记起个标题吧...') as HTMLInputElement;
    const contentInput = screen.getByPlaceholderText('详细记录你的想法和感受...') as HTMLTextAreaElement;
    expect(titleInput.value).toHaveLength(MAX_ENTRY_TITLE_LENGTH);
    expect(contentInput.value).toHaveLength(MAX_ENTRY_CONTENT_LENGTH);

    fireEvent.click(screen.getByRole('button', { name: '保存日记' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        title: 't'.repeat(MAX_ENTRY_TITLE_LENGTH),
        content: 'c'.repeat(MAX_ENTRY_CONTENT_LENGTH),
        mood: 'm'.repeat(MAX_ENTRY_MOOD_LENGTH),
        weather: 'w'.repeat(MAX_ENTRY_WEATHER_LENGTH),
      }));
    });
  });
});
