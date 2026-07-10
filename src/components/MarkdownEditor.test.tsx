import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithTheme } from '../test/renderWithTheme';
import { MarkdownEditor } from './MarkdownEditor';

describe('MarkdownEditor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('clears pending selection restore timers on unmount', () => {
    const onChange = vi.fn();

    const { unmount } = renderWithTheme(
      <MarkdownEditor value="hello" onChange={onChange} />
    );

    const editor = screen.getByLabelText('日记内容编辑器') as HTMLTextAreaElement;
    editor.setSelectionRange(0, editor.value.length);
    const timerCountBeforeInsert = vi.getTimerCount();

    fireEvent.click(screen.getByRole('button', { name: 'B' }));

    expect(onChange).toHaveBeenCalledWith('**hello**');
    expect(vi.getTimerCount()).toBeGreaterThan(timerCountBeforeInsert);

    unmount();

    expect(vi.getTimerCount()).toBe(timerCountBeforeInsert);
  });

  it('limits typed and inserted content when maxLength is provided', () => {
    const onChange = vi.fn();

    renderWithTheme(
      <MarkdownEditor value="hello" onChange={onChange} maxLength={7} />
    );

    const editor = screen.getByLabelText('日记内容编辑器') as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: 'hello world' } });
    expect(onChange).toHaveBeenLastCalledWith('hello w');

    editor.setSelectionRange(0, editor.value.length);
    fireEvent.click(screen.getByRole('button', { name: 'B' }));
    expect(onChange).toHaveBeenLastCalledWith('**hello');
  });
});
