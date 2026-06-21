import { AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';
import { ModalShell } from './ModalShell';

export function ConfirmDeleteModal({
  displayName,
  onConfirm,
  onCancel,
}: {
  displayName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ModalShell onClose={onCancel} widthClass="w-80" ariaLabel="Confirm Delete Mailbox">
      <div className="p-6">
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
          <Button variant="danger" className="flex-1" onClick={(e) => { e.stopPropagation(); onConfirm(); }}>
            Delete
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
