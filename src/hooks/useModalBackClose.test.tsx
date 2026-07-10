import { act, cleanup, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type UseModalBackClose = typeof import('./useModalBackClose.ts')['useModalBackClose'];

async function loadFreshHook(): Promise<UseModalBackClose> {
  vi.resetModules();
  const module = await import('./useModalBackClose.ts');
  return module.useModalBackClose;
}

function createProbe(useModalBackClose: UseModalBackClose) {
  return function Probe({ isOpen, onClose }: { isOpen: boolean; onClose?: () => void }) {
    useModalBackClose(isOpen, onClose);
    return null;
  };
}

function firePopState() {
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}

describe('useModalBackClose', () => {
  let pushStateSpy: ReturnType<typeof vi.spyOn>;
  let backSpy: ReturnType<typeof vi.spyOn>;
  let stateSpy: ReturnType<typeof vi.spyOn>;
  let mockedHistoryState: unknown;

  beforeEach(() => {
    mockedHistoryState = null;
    pushStateSpy = vi.spyOn(window.history, 'pushState').mockImplementation((state) => {
      mockedHistoryState = state;
    });
    backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    stateSpy = vi.spyOn(window.history, 'state', 'get').mockImplementation(() => mockedHistoryState);
  });

  afterEach(() => {
    cleanup();
    pushStateSpy.mockRestore();
    backSpy.mockRestore();
    stateSpy.mockRestore();
  });

  it('pushes one history entry when opened and closes on popstate without consuming extra entries', async () => {
    const useModalBackClose = await loadFreshHook();
    const Probe = createProbe(useModalBackClose);
    const onClose = vi.fn();

    const { rerender } = render(<Probe isOpen onClose={onClose} />);

    expect(pushStateSpy).toHaveBeenCalledTimes(1);

    firePopState();

    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<Probe isOpen={false} onClose={onClose} />);

    expect(backSpy).not.toHaveBeenCalled();
  });

  it('consumes its history entry on programmatic close and ignores the resulting popstate', async () => {
    const useModalBackClose = await loadFreshHook();
    const Probe = createProbe(useModalBackClose);
    const onClose = vi.fn();

    const { rerender } = render(<Probe isOpen onClose={onClose} />);

    rerender(<Probe isOpen={false} onClose={onClose} />);

    expect(backSpy).toHaveBeenCalledTimes(1);

    firePopState();

    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes stacked modals top-first, one per back navigation', async () => {
    const useModalBackClose = await loadFreshHook();
    const Probe = createProbe(useModalBackClose);
    const closeBottom = vi.fn();
    const closeTop = vi.fn();

    // 模拟真实弹窗：onClose 会翻转 isOpen，触发 effect cleanup 出栈
    function StackHarness() {
      const [bottomOpen, setBottomOpen] = useState(true);
      const [topOpen, setTopOpen] = useState(true);

      return (
        <>
          <Probe
            isOpen={bottomOpen}
            onClose={() => {
              closeBottom();
              setBottomOpen(false);
            }}
          />
          <Probe
            isOpen={topOpen}
            onClose={() => {
              closeTop();
              setTopOpen(false);
            }}
          />
        </>
      );
    }

    render(<StackHarness />);

    expect(pushStateSpy).toHaveBeenCalledTimes(2);

    firePopState();

    expect(closeTop).toHaveBeenCalledTimes(1);
    expect(closeBottom).not.toHaveBeenCalled();

    firePopState();

    expect(closeBottom).toHaveBeenCalledTimes(1);
    // 两次关闭都由返回导航发起，历史条目已被消费，不应再补 history.back()
    expect(backSpy).not.toHaveBeenCalled();
  });

  it('does not engage without an onClose handler', async () => {
    const useModalBackClose = await loadFreshHook();
    const Probe = createProbe(useModalBackClose);

    const { unmount } = render(<Probe isOpen />);

    expect(pushStateSpy).not.toHaveBeenCalled();

    unmount();

    expect(backSpy).not.toHaveBeenCalled();
  });

  it('keeps a refusing modal on top of the stack so back never skips to lower modals', async () => {
    const useModalBackClose = await loadFreshHook();
    const Probe = createProbe(useModalBackClose);
    const closeBottom = vi.fn();
    // 顶层弹窗拒绝关闭（例如保存进行中）：onClose 被调用但 isOpen 保持 true
    const refusingClose = vi.fn();

    render(
      <>
        <Probe isOpen onClose={closeBottom} />
        <Probe isOpen onClose={refusingClose} />
      </>
    );

    firePopState();

    await act(async () => {
      await Promise.resolve();
    });

    expect(refusingClose).toHaveBeenCalledTimes(1);
    expect(closeBottom).not.toHaveBeenCalled();
    expect(pushStateSpy).toHaveBeenCalledTimes(3);

    firePopState();

    await act(async () => {
      await Promise.resolve();
    });

    expect(refusingClose).toHaveBeenCalledTimes(2);
    expect(closeBottom).not.toHaveBeenCalled();
    expect(pushStateSpy).toHaveBeenCalledTimes(4);
  });

  it('keeps history bookkeeping consistent when a lower modal closes before the top one', async () => {
    const useModalBackClose = await loadFreshHook();
    const Probe = createProbe(useModalBackClose);
    const closeBottom = vi.fn();
    const closeTop = vi.fn();

    const { rerender } = render(
      <>
        <Probe isOpen onClose={closeBottom} />
        <Probe isOpen onClose={closeTop} />
      </>
    );

    rerender(
      <>
        <Probe isOpen={false} onClose={closeBottom} />
        <Probe isOpen onClose={closeTop} />
      </>
    );

    expect(backSpy).toHaveBeenCalledTimes(1);

    firePopState();

    expect(closeTop).not.toHaveBeenCalled();

    firePopState();

    expect(closeTop).toHaveBeenCalledTimes(1);
    expect(closeBottom).not.toHaveBeenCalled();
  });

  it('does not navigate back when history has already left the modal entries', async () => {
    const useModalBackClose = await loadFreshHook();
    const Probe = createProbe(useModalBackClose);
    const onClose = vi.fn();

    const { rerender } = render(<Probe isOpen onClose={onClose} />);

    // 模拟多步历史跳转：位置已经回到无标记的基础条目
    mockedHistoryState = null;

    rerender(<Probe isOpen={false} onClose={onClose} />);

    expect(backSpy).not.toHaveBeenCalled();
  });
});
