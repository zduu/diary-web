import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useIsMobile } from '../hooks/useIsMobile';
import { useModalBackClose } from '../hooks/useModalBackClose';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    return element.getAttribute('aria-hidden') !== 'true' && (element.offsetParent !== null || element === document.activeElement);
  });
}

interface ModalShellProps {
  isOpen: boolean;
  onClose?: () => void;
  zIndex?: number;
  padding?: string;
  backdropClassName?: string;
  backdropStyle?: CSSProperties;
  panelClassName?: string;
  panelStyle?: CSSProperties;
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
  ariaLabel?: string;
  ariaLabelledby?: string;
  initialFocusRef?: React.RefObject<HTMLElement>;
  children: ReactNode;
}

export function ModalShell({
  isOpen,
  onClose,
  zIndex = 50,
  padding = '16px',
  backdropClassName = '',
  backdropStyle,
  panelClassName = '',
  panelStyle,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  ariaLabel,
  ariaLabelledby,
  initialFocusRef,
  children,
}: ModalShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const isMobile = useIsMobile();

  useModalBackClose(isOpen, onClose);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusTarget = initialFocusRef?.current ?? panelRef.current;
    focusTarget?.focus();

    return () => {
      previousFocusRef.current?.focus();
    };
  }, [initialFocusRef, isOpen]);

  useEffect(() => {
    if (!isOpen || !closeOnEscape || !onClose) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const panel = panelRef.current;
      if (!panel) {
        return;
      }

      const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const focusInsidePanel = activeElement ? panel.contains(activeElement) || activeElement === panel : false;

      if (event.key === 'Escape' && focusInsidePanel) {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !focusInsidePanel) {
        return;
      }

      const focusableElements = getFocusableElements(panel);

      if (focusableElements.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && (activeElement === firstElement || activeElement === panel)) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeOnEscape, isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div
      className={`fixed inset-0 flex items-center justify-center ${backdropClassName}`.trim()}
      style={{
        zIndex,
        padding: isMobile
          ? `max(12px, var(--safe-area-top)) max(12px, var(--safe-area-right)) max(12px, var(--safe-area-bottom)) max(12px, var(--safe-area-left))`
          : padding,
        boxSizing: 'border-box',
        ...backdropStyle,
      }}
      onClick={(event) => {
        if (closeOnBackdropClick && onClose && event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        tabIndex={-1}
        className={panelClassName}
        style={panelStyle}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
