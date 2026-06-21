import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';

export function ConfirmDeleteModal({
  displayName,
  onConfirm,
  onCancel,
}: {
  displayName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return createPortal(
    <div
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="Confirm Delete Mailbox"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="fixed inset-0 bg-black/60 animate-backdrop-in" onClick={onCancel} />
      <div className="relative bg-[var(--color-surface-1)] border border-[var(--color-border-muted)] rounded-2xl p-6 w-80 shadow-2xl animate-fade-in">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[var(--color-error-bg)] mb-4 mx-auto">
          <AlertTriangle className="h-5 w-5 text-[var(--color-error-text)]" />
        </div>
        <p className="text-sm text-[var(--color-text-secondary)] text-center mb-6">
          Delete <span className="font-medium text-[var(--color-text-primary)]">{displayName}</span>? This Cannot Be Undone.
        </p>
        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={(e) => { e.stopPropagation(); onCancel(); }}>
            Cancel
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            onClick={(e) => { e.stopPropagation(); onConfirm(); }}
          >
            Delete
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
