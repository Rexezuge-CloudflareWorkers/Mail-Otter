import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

export function ModalShell({
  onClose,
  children,
  widthClass = 'w-80',
  ariaLabel,
}: {
  onClose: () => void;
  children: ReactNode;
  widthClass?: string;
  ariaLabel?: string;
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <div className="fixed inset-0 bg-black/60 animate-backdrop-in" />
      <div
        className={`relative bg-[var(--color-surface-1)] border border-[var(--color-border-muted)] rounded-2xl shadow-2xl animate-fade-in ${widthClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
