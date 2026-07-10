import { useEffect, useRef } from 'react';

type ModalStackRecord = {
  requestClose: () => void;
  /** 该记录对应的历史条目是否已被一次返回导航消费掉 */
  entryConsumed: boolean;
};

/** 标记弹窗历史条目，cleanup 回退前用它确认当前位置仍在弹窗条目上 */
const MODAL_HISTORY_MARKER = 'diaryModal';

let modalStack: ModalStackRecord[] = [];
let pendingConsumeCount = 0;
let popstateListenerAttached = false;

function handlePopState() {
  if (pendingConsumeCount > 0) {
    pendingConsumeCount -= 1;
    return;
  }

  const topRecord = modalStack[modalStack.length - 1];

  if (!topRecord) {
    return;
  }

  // 不在这里出栈：若弹窗拒绝关闭（如保存进行中），它必须继续留在栈顶，
  // 否则下一次返回会误关它下层的弹窗。真正关闭时由 effect cleanup 出栈。
  topRecord.entryConsumed = true;
  topRecord.requestClose();

  queueMicrotask(() => {
    if (!modalStack.includes(topRecord) || !topRecord.entryConsumed) {
      return;
    }

    // onClose 可能因提交中等原因拒绝关闭。此时原历史条目已被返回导航消费，
    // 必须补回占位，否则下一次系统返回会直接离开应用或跳过该弹窗。
    window.history.pushState({ [MODAL_HISTORY_MARKER]: true }, '');
    topRecord.entryConsumed = false;
  });
}

function ensurePopstateListener() {
  if (popstateListenerAttached || typeof window === 'undefined') {
    return;
  }

  window.addEventListener('popstate', handlePopState);
  popstateListenerAttached = true;
}

/**
 * 弹窗打开时压入一条同文档历史记录，让安卓返回键 / 浏览器返回
 * 优先关闭最顶层弹窗而不是退出应用；程序化关闭时消费掉这条记录。
 * 多个弹窗叠放时按“后开先关”的顺序逐层退出。
 */
export function useModalBackClose(isOpen: boolean, onClose?: () => void) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const isEngaged = isOpen && Boolean(onClose);

  useEffect(() => {
    if (!isEngaged || typeof window === 'undefined') {
      return;
    }

    ensurePopstateListener();

    const record: ModalStackRecord = {
      requestClose: () => onCloseRef.current?.(),
      entryConsumed: false,
    };

    modalStack = [...modalStack, record];
    window.history.pushState({ [MODAL_HISTORY_MARKER]: true }, '');

    return () => {
      modalStack = modalStack.filter((item) => item !== record);

      if (record.entryConsumed) {
        // 历史条目已随用户的返回导航一起消费，无需额外回退
        return;
      }

      const currentState = window.history.state as Record<string, unknown> | null;

      if (!currentState || currentState[MODAL_HISTORY_MARKER] !== true) {
        // 当前历史位置已不在弹窗条目上（多步跳转、刷新等），
        // 此时回退会把用户带离应用，宁可留下一条冗余条目
        return;
      }

      pendingConsumeCount += 1;
      window.history.back();
    };
  }, [isEngaged]);
}
