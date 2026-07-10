import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEntryEditorState } from './useEntryEditorState';
import type { DiaryEntry } from '../types';

const firstEntry = createEntry(1, '第一篇');
const secondEntry = createEntry(2, '第二篇');
const legacyEntry: DiaryEntry = {
  title: '旧数据',
  content: 'content',
  content_type: 'markdown',
};

function createEntry(id: number, title: string): DiaryEntry {
  return {
    id,
    title,
    content: 'content',
    content_type: 'markdown',
    created_at: '2026-04-14T09:00:00.000Z',
    updated_at: '2026-04-14T09:00:00.000Z',
  };
}

function EntryEditorStateProbe() {
  const {
    closeForm,
    completeSave,
    editingEntry,
    highlightEntryId,
    isFormOpen,
    openEditEntry,
    openNewEntry,
  } = useEntryEditorState();

  return (
    <div>
      <div data-testid="form-state">{isFormOpen ? 'open' : 'closed'}</div>
      <div data-testid="editing-title">{editingEntry?.title ?? 'none'}</div>
      <div data-testid="highlight-id">{highlightEntryId ?? 'none'}</div>
      <button type="button" onClick={() => openEditEntry(firstEntry)}>edit first</button>
      <button type="button" onClick={() => openEditEntry(secondEntry)}>edit second</button>
      <button type="button" onClick={() => openEditEntry(legacyEntry)}>edit legacy</button>
      <button type="button" onClick={openNewEntry}>new entry</button>
      <button type="button" onClick={closeForm}>close</button>
      <button type="button" onClick={() => completeSave(42)}>save</button>
    </div>
  );
}

describe('useEntryEditorState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps the editing entry briefly after closing, then clears it', () => {
    render(<EntryEditorStateProbe />);

    fireEvent.click(screen.getByRole('button', { name: 'edit first' }));
    expect(screen.getByTestId('form-state')).toHaveTextContent('open');
    expect(screen.getByTestId('editing-title')).toHaveTextContent('第一篇');

    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(screen.getByTestId('form-state')).toHaveTextContent('closed');
    expect(screen.getByTestId('editing-title')).toHaveTextContent('第一篇');

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByTestId('editing-title')).toHaveTextContent('none');
  });

  it('cancels a pending editing reset when another editor opens', () => {
    render(<EntryEditorStateProbe />);

    fireEvent.click(screen.getByRole('button', { name: 'edit first' }));
    fireEvent.click(screen.getByRole('button', { name: 'close' }));

    act(() => {
      vi.advanceTimersByTime(50);
    });

    fireEvent.click(screen.getByRole('button', { name: 'edit second' }));

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByTestId('form-state')).toHaveTextContent('open');
    expect(screen.getByTestId('editing-title')).toHaveTextContent('第二篇');
  });

  it('does not open the editor for legacy entries without a persisted id', () => {
    render(<EntryEditorStateProbe />);

    fireEvent.click(screen.getByRole('button', { name: 'edit legacy' }));

    expect(screen.getByTestId('form-state')).toHaveTextContent('closed');
    expect(screen.getByTestId('editing-title')).toHaveTextContent('none');
  });

  it('clears the save highlight after the display window', () => {
    render(<EntryEditorStateProbe />);

    fireEvent.click(screen.getByRole('button', { name: 'save' }));

    expect(screen.getByTestId('highlight-id')).toHaveTextContent('42');

    act(() => {
      vi.advanceTimersByTime(2599);
    });

    expect(screen.getByTestId('highlight-id')).toHaveTextContent('42');

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.getByTestId('highlight-id')).toHaveTextContent('none');
  });

  it('clears pending timers on unmount', () => {
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');

    const { unmount } = render(<EntryEditorStateProbe />);
    fireEvent.click(screen.getByRole('button', { name: 'edit first' }));
    fireEvent.click(screen.getByRole('button', { name: 'save' }));

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalledTimes(2);
  });
});
