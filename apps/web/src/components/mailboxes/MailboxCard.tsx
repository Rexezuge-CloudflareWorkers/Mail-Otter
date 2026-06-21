import type { ConnectedApplication } from '../../../components/types';
import { providerLabels } from '../../../components/utils';
import { ConnectionBadge, ContextIndexBadge } from '../ui/Badge';
import { cn } from '../../lib/utils';

export function MailboxCard({
  application,
  selected,
  onClick,
}: {
  application: ConnectedApplication;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-4 rounded-xl border transition-all duration-200',
        selected
          ? 'border-[var(--color-accent)] bg-[#0e2d22]'
          : 'border-[var(--color-border)] bg-[var(--color-surface-1)] hover:border-[var(--color-border-muted)] hover:bg-[var(--color-surface-2)]',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-[var(--color-text-primary)] truncate">{application.displayName}</div>
          <div className="text-sm text-[var(--color-text-secondary)] mt-0.5">
            {providerLabels[application.providerId]}
          </div>
          <div className="text-xs text-[var(--color-text-muted)] truncate mt-0.5">
            {application.providerEmail || 'Not Authorized'}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <ContextIndexBadge enabled={application.contextIndexingEnabled} />
            <span className="text-xs text-[var(--color-text-muted)]">{application.contextDocumentCount || 0} Docs</span>
          </div>
        </div>
        <ConnectionBadge status={application.status} />
      </div>
    </button>
  );
}
