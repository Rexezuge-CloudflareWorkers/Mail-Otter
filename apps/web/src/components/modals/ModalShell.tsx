import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

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

export const WIDE_MODAL_CLASS = 'w-full max-w-2xl max-h-[82vh] overflow-hidden mx-4';

export function ModalHeader({
  title,
  onClose,
  actions,
}: {
  title: string;
  onClose: () => void;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
      <h2 className="text-base font-semibold text-[var(--color-text-primary)]">{title}</h2>
      <div className="flex items-center gap-2">
        {actions}
        <button
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors p-1 rounded-lg hover:bg-[var(--color-surface-3)]"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function ModalBody({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-y-auto p-5 space-y-2.5 max-h-[calc(82vh-4rem)]">{children}</div>
  );
}

export function ModalRow({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-base)] p-4">
      {children}
    </div>
  );
}

export function ModalEmpty({ message }: { message: string }) {
  return (
    <div className="text-center text-[var(--color-text-muted)] py-10 text-sm">{message}</div>
  );
}
