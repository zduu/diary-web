import { useState, useEffect, useRef } from 'react';
import type { DiaryEntry } from '../types/index.ts';
import { apiService } from '../services/api';
import { readOfflineEntrySnapshot } from '../utils/offlineEntrySnapshot.ts';
import { debugWarn } from '../utils/logger.ts';
import { sortDiaryEntriesByTime } from '../utils/entryTime.ts';

export function useDiary() {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offlineSnapshotMeta, setOfflineSnapshotMeta] = useState<{ used: boolean; savedAt: string | null }>({
    used: false,
    savedAt: null,
  });
  const isMountedRef = useRef(true);
  const loadRequestIdRef = useRef(0);
  const mutationVersionRef = useRef(0);
  const entriesRef = useRef<DiaryEntry[]>([]);

  const safeSetEntries = (updater: DiaryEntry[] | ((prev: DiaryEntry[]) => DiaryEntry[])) => {
    if (!isMountedRef.current) {
      return;
    }

    setEntries((prev) => {
      const nextEntries = typeof updater === 'function' ? updater(prev) : updater;
      const sortedEntries = sortDiaryEntriesByTime(nextEntries);
      entriesRef.current = sortedEntries;
      return sortedEntries;
    });
  };

  const safeSetLoading = (nextLoading: boolean) => {
    if (!isMountedRef.current) {
      return;
    }

    setLoading(nextLoading);
  };

  const safeSetError = (nextError: string | null) => {
    if (!isMountedRef.current) {
      return;
    }

    setError(nextError);
  };

  const safeSetOfflineSnapshotMeta = (nextMeta: { used: boolean; savedAt: string | null }) => {
    if (!isMountedRef.current) {
      return;
    }

    setOfflineSnapshotMeta(nextMeta);
  };

  const loadEntries = async ({ silent = false }: { silent?: boolean } = {}) => {
    const requestId = ++loadRequestIdRef.current;
    const mutationVersionAtStart = mutationVersionRef.current;

    try {
      if (!silent) {
        safeSetLoading(true);
      }
      safeSetError(null);
      const data = await apiService.getAllEntries();

      if (requestId !== loadRequestIdRef.current || mutationVersionAtStart !== mutationVersionRef.current) {
        return;
      }

      safeSetEntries(data);
      safeSetOfflineSnapshotMeta({ used: false, savedAt: null });
    } catch (err) {
      if (requestId !== loadRequestIdRef.current) {
        return;
      }

      if (!silent && entriesRef.current.length === 0) {
        const snapshot = readOfflineEntrySnapshot();
        if (snapshot) {
          safeSetEntries(snapshot.entries);
          safeSetError(null);
          safeSetOfflineSnapshotMeta({ used: true, savedAt: snapshot.savedAt });
          return;
        }
      }

      safeSetOfflineSnapshotMeta({ used: false, savedAt: null });
      safeSetError(err instanceof Error ? err.message : '加载失败');
    } finally {
      if (!silent && requestId === loadRequestIdRef.current) {
        safeSetLoading(false);
      }
    }
  };

  const refreshEntries = () => loadEntries();

  const createEntry = async (entry: Omit<DiaryEntry, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const newEntry = await apiService.createEntry(entry);
      mutationVersionRef.current += 1;
      safeSetEntries((prev) => [newEntry, ...prev.filter((current) => current.id !== newEntry.id)]);
      return newEntry;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : '创建失败');
    }
  };

  const updateEntry = async (id: number, entry: Partial<DiaryEntry>) => {
    try {
      const updatedEntry = await apiService.updateEntry(id, entry);
      mutationVersionRef.current += 1;
      safeSetEntries((prev) => prev.map((current) => current.id === id ? updatedEntry : current));
      return updatedEntry;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : '更新失败');
    }
  };

  const deleteEntry = async (id: number) => {
    try {
      // 先乐观更新UI
      mutationVersionRef.current += 1;
      safeSetEntries((prev) => prev.filter((entry) => entry.id !== id));

      await apiService.deleteEntry(id);

      // 后台同步一次远端状态，避免阻塞当前交互。
      void loadEntries({ silent: true }).catch((reloadError) => {
        debugWarn('重新加载数据失败，但删除操作可能已成功:', reloadError);
      });

    } catch (err) {
      // 如果删除失败，重新加载数据以恢复正确状态
      await loadEntries();
      throw new Error(err instanceof Error ? err.message : '删除失败');
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    loadEntries();

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return {
    entries,
    loading,
    error,
    offlineSnapshotMeta,
    createEntry,
    updateEntry,
    deleteEntry,
    refreshEntries,
  };
}
