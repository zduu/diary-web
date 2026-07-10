import { useEffect, useRef, useState } from 'react';
import type { DiaryEntry } from '../types/index.ts';
import { hasPersistedDiaryEntryId } from '../utils/diaryEntryIdentity.ts';

export function useEntryEditorState() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<DiaryEntry | undefined>();
  const [highlightEntryId, setHighlightEntryId] = useState<number | null>(null);
  const clearEditingEntryTimeoutRef = useRef<number | null>(null);
  const clearHighlightTimeoutRef = useRef<number | null>(null);

  const clearPendingEditingReset = () => {
    if (clearEditingEntryTimeoutRef.current !== null) {
      window.clearTimeout(clearEditingEntryTimeoutRef.current);
      clearEditingEntryTimeoutRef.current = null;
    }
  };

  const clearPendingHighlightReset = () => {
    if (clearHighlightTimeoutRef.current !== null) {
      window.clearTimeout(clearHighlightTimeoutRef.current);
      clearHighlightTimeoutRef.current = null;
    }
  };

  const highlightEntry = (entryId: number | undefined) => {
    if (!entryId) {
      return;
    }

    setHighlightEntryId(entryId);
    clearPendingHighlightReset();

    clearHighlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightEntryId(null);
      clearHighlightTimeoutRef.current = null;
    }, 2600);
  };

  const scheduleEditingEntryReset = () => {
    clearPendingEditingReset();

    clearEditingEntryTimeoutRef.current = window.setTimeout(() => {
      setEditingEntry(undefined);
      clearEditingEntryTimeoutRef.current = null;
    }, 100);
  };

  const openNewEntry = () => {
    clearPendingEditingReset();
    setEditingEntry(undefined);
    setIsFormOpen(true);
  };

  const openEditEntry = (entry: DiaryEntry) => {
    if (!hasPersistedDiaryEntryId(entry)) {
      return false;
    }

    clearPendingEditingReset();
    setEditingEntry(entry);
    setIsFormOpen(true);
    return true;
  };

  const closeForm = () => {
    setIsFormOpen(false);
    scheduleEditingEntryReset();
  };

  const completeSave = (entryId: number | undefined) => {
    highlightEntry(entryId);
    closeForm();
  };

  useEffect(() => () => {
    clearPendingEditingReset();
    clearPendingHighlightReset();
  }, []);

  return {
    closeForm,
    completeSave,
    editingEntry,
    highlightEntryId,
    isFormOpen,
    openEditEntry,
    openNewEntry,
  };
}
