import type { Dispatch, SetStateAction } from 'react';
import type { DiaryEntry } from '../../types/index.ts';
import type { ConfirmState, OperationState } from './adminPanelTypes';
import { apiService } from '../../services/api';
import { debugError, debugLog } from '../../utils/logger.ts';

interface UseAdminPanelEntryActionsOptions {
  confirmState: ConfirmState | null;
  entries: DiaryEntry[];
  onClose: () => void;
  onDeleteEntry?: (entryId: number) => Promise<void>;
  onEntriesUpdate: () => void | Promise<void>;
  onLogoutConfirmed: () => void;
  requestDeleteConfirm: (entryId: number, entryTitle: string) => void;
  clearConfirmState: () => void;
  setConfirmLoading: Dispatch<SetStateAction<boolean>>;
  setOperationState: (entryId: number, state: OperationState) => void;
  showOperationFeedback: (message: string, isError?: boolean) => void;
  handleAdminOperationError: (error: unknown, fallbackMessage: string) => void;
}

export function useAdminPanelEntryActions({
  confirmState,
  entries,
  onClose,
  onDeleteEntry,
  onEntriesUpdate,
  onLogoutConfirmed,
  requestDeleteConfirm,
  clearConfirmState,
  setConfirmLoading,
  setOperationState,
  showOperationFeedback,
  handleAdminOperationError,
}: UseAdminPanelEntryActionsOptions) {
  const getEntryOrReport = (entryId: number): DiaryEntry | null => {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) {
      showOperationFeedback('日记信息异常，请刷新页面', true);
      return null;
    }

    return entry;
  };

  const runEntryOperation = async (
    entryId: number,
    state: Exclude<OperationState, 'idle'>,
    action: () => Promise<void>
  ) => {
    setOperationState(entryId, state);

    try {
      await action();
    } finally {
      setOperationState(entryId, 'idle');
    }
  };

  const toggleEntryVisibility = async (entryId: number) => {
    const entry = getEntryOrReport(entryId);
    if (!entry) {
      return;
    }

    const isCurrentlyHidden = entry.hidden;

    try {
      await runEntryOperation(entryId, isCurrentlyHidden ? 'showing' : 'hiding', async () => {
        debugLog(`切换隐藏状态: ID ${entryId}, 当前状态: ${isCurrentlyHidden ? '隐藏' : '显示'}`);
        await apiService.toggleEntryVisibility(entryId);
        await onEntriesUpdate();
      });
      showOperationFeedback(isCurrentlyHidden ? '日记已显示' : '日记已隐藏');
    } catch (error) {
      debugError('切换隐藏状态失败:', error);
      handleAdminOperationError(error, '切换隐藏状态失败');
    }
  };

  const handleDeleteEntry = (entryId: number) => {
    const entry = getEntryOrReport(entryId);
    if (!entry) {
      return;
    }

    requestDeleteConfirm(entryId, entry.title || '无标题');
  };

  const confirmDeleteEntry = async (entryId: number) => {
    if (!getEntryOrReport(entryId)) {
      return;
    }

    try {
      await runEntryOperation(entryId, 'deleting', async () => {
        if (onDeleteEntry) {
          await onDeleteEntry(entryId);
          return;
        }

        await apiService.deleteEntry(entryId);
        await onEntriesUpdate();
      });
      showOperationFeedback('日记删除成功');
    } catch (error) {
      handleAdminOperationError(error, '删除失败');
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmState) {
      return;
    }

    setConfirmLoading(true);

    try {
      if (confirmState.type === 'logout') {
        await apiService.logout();
        onLogoutConfirmed();
        clearConfirmState();
        onClose();
        return;
      }

      await confirmDeleteEntry(confirmState.entryId);
      clearConfirmState();
    } finally {
      setConfirmLoading(false);
    }
  };

  return {
    handleConfirmAction,
    handleDeleteEntry,
    toggleEntryVisibility,
  };
}
