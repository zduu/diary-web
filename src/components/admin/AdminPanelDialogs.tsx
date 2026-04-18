import { useEffect, useRef, useState, type RefObject } from 'react';
import { ModalShell } from '../ModalShell';
import type { ThemeConfig } from '../../hooks/useTheme';
import type { ConfirmState } from './adminPanelTypes';

function buildConfirmCopy(confirmState: ConfirmState) {
  if (confirmState.type === 'logout') {
    return {
      title: '退出管理员登录',
      description: '退出后将返回访客状态，如需继续管理内容，需要重新输入管理员密码。',
      confirmLabel: '确认退出',
    };
  }

  return {
    title: '删除日记',
    description: `确定要删除日记“${confirmState.entryTitle}”吗？此操作不可恢复。`,
    confirmLabel: '确认删除',
  };
}

interface AdminConfirmDialogProps {
  confirmState: ConfirmState | null;
  confirmLoading: boolean;
  confirmButtonRef: RefObject<HTMLButtonElement>;
  theme: ThemeConfig;
  getTextColor: (type?: 'primary' | 'secondary') => string;
  onClose: () => void;
  onConfirm: () => void;
}

export function AdminConfirmDialog({
  confirmState,
  confirmLoading,
  confirmButtonRef,
  theme,
  getTextColor,
  onClose,
  onConfirm,
}: AdminConfirmDialogProps) {
  if (!confirmState) {
    return null;
  }

  const confirmCopy = buildConfirmCopy(confirmState);

  return (
    <ModalShell
      isOpen={true}
      onClose={onClose}
      ariaLabelledby="admin-confirm-title"
      initialFocusRef={confirmButtonRef}
      zIndex={100000}
      panelClassName="w-full max-w-md rounded-2xl"
      panelStyle={{
        backgroundColor: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
      }}
      backdropStyle={{ backgroundColor: 'rgba(0, 0, 0, 0.45)' }}
    >
      <div className="p-6">
        <h3 id="admin-confirm-title" className="text-lg font-semibold" style={{ color: getTextColor('primary') }}>
          {confirmCopy.title}
        </h3>
        <p className="mt-3 text-sm leading-6" style={{ color: getTextColor('secondary') }}>
          {confirmCopy.description}
        </p>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={confirmLoading}
            className="flex-1 rounded-lg border px-4 py-2 transition-colors disabled:opacity-50"
            style={{
              borderColor: theme.colors.border,
              color: getTextColor('primary'),
              backgroundColor: 'transparent',
            }}
          >
            取消
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            disabled={confirmLoading}
            className="flex-1 rounded-lg px-4 py-2 font-medium text-white transition-opacity disabled:opacity-50"
            style={{
              backgroundColor: confirmState.type === 'delete' ? '#dc2626' : theme.colors.primary,
            }}
          >
            {confirmLoading ? '处理中...' : confirmCopy.confirmLabel}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

interface AdminImportModeDialogProps {
  isOpen: boolean;
  importCount: number;
  existingCount: number;
  isSubmitting: boolean;
  theme: ThemeConfig;
  getTextColor: (type?: 'primary' | 'secondary') => string;
  onClose: () => void;
  onConfirm: (mode: 'merge' | 'overwrite') => void;
}

export function AdminImportModeDialog({
  isOpen,
  importCount,
  existingCount,
  isSubmitting,
  theme,
  getTextColor,
  onClose,
  onConfirm,
}: AdminImportModeDialogProps) {
  const [selectedMode, setSelectedMode] = useState<'merge' | 'overwrite'>('merge');
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedMode('merge');
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const mergeActive = selectedMode === 'merge';
  const overwriteActive = selectedMode === 'overwrite';

  return (
    <ModalShell
      isOpen={true}
      onClose={isSubmitting ? undefined : onClose}
      ariaLabelledby="admin-import-title"
      initialFocusRef={confirmButtonRef}
      zIndex={100001}
      panelClassName="w-full max-w-lg rounded-2xl"
      panelStyle={{
        backgroundColor: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
      }}
      backdropStyle={{ backgroundColor: 'rgba(0, 0, 0, 0.45)' }}
    >
      <div className="p-6">
        <h3 id="admin-import-title" className="text-lg font-semibold" style={{ color: getTextColor('primary') }}>
          选择导入模式
        </h3>
        <p className="mt-3 text-sm leading-6" style={{ color: getTextColor('secondary') }}>
          即将导入 {importCount} 条日记，当前已有 {existingCount} 条日记。
        </p>

        <div className="mt-5 space-y-3">
          <label
            className="block cursor-pointer rounded-xl border p-4 transition-colors"
            style={{
              borderColor: mergeActive ? theme.colors.primary : theme.colors.border,
              backgroundColor: mergeActive ? `${theme.colors.primary}14` : theme.colors.surface,
            }}
          >
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="admin-import-mode"
                value="merge"
                checked={mergeActive}
                disabled={isSubmitting}
                onChange={() => setSelectedMode('merge')}
                className="mt-1"
              />
              <div>
                <div className="font-medium" style={{ color: getTextColor('primary') }}>
                  合并导入
                </div>
                <div className="mt-1 text-sm leading-6" style={{ color: getTextColor('secondary') }}>
                  保留现有内容，再追加导入的 {importCount} 条日记。
                </div>
              </div>
            </div>
          </label>

          <label
            className="block cursor-pointer rounded-xl border p-4 transition-colors"
            style={{
              borderColor: overwriteActive ? '#dc2626' : theme.colors.border,
              backgroundColor: overwriteActive ? 'rgba(220, 38, 38, 0.08)' : theme.colors.surface,
            }}
          >
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="admin-import-mode"
                value="overwrite"
                checked={overwriteActive}
                disabled={isSubmitting}
                onChange={() => setSelectedMode('overwrite')}
                className="mt-1"
              />
              <div>
                <div className="font-medium" style={{ color: getTextColor('primary') }}>
                  覆盖导入
                </div>
                <div className="mt-1 text-sm leading-6" style={{ color: getTextColor('secondary') }}>
                  清空现有日记，只保留本次导入的 {importCount} 条内容。
                </div>
              </div>
            </div>
          </label>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 rounded-lg border px-4 py-2 transition-colors disabled:opacity-50"
            style={{
              borderColor: theme.colors.border,
              color: getTextColor('primary'),
              backgroundColor: 'transparent',
            }}
          >
            取消
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={() => onConfirm(selectedMode)}
            disabled={isSubmitting}
            className="flex-1 rounded-lg px-4 py-2 font-medium text-white transition-opacity disabled:opacity-50"
            style={{
              backgroundColor: selectedMode === 'overwrite' ? '#dc2626' : theme.colors.primary,
            }}
          >
            {isSubmitting ? '导入中...' : '确认导入'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
