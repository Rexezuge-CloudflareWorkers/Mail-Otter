import type { ApplicationContextDeletionRun, ConnectedApplication } from '../../../components/types';
import { formatTimestamp } from '../../../components/utils';
import { DeletionStatusBadge } from '../ui/Badge';

export function ContextDeletionRunRow({
  run,
  application,
}: {
  run: ApplicationContextDeletionRun;
  application: ConnectedApplication | undefined;
}) {
  return (
    <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 min-w-0 animate-fade-in-up">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-[var(--color-text-primary)] truncate">
            {application?.displayName || run.applicationId}
          </div>
          <div className="text-sm text-[var(--color-text-secondary)] mt-0.5">
            {run.deletedVectorCount}/{run.requestedVectorCount} Vectors Deleted
          </div>
          <div className="text-xs text-[var(--color-text-muted)] mt-0.5">{formatTimestamp(run.createdAt)}</div>
        </div>
        <DeletionStatusBadge status={run.status} />
      </div>
      {run.mutationIds.length > 0 && (
        <div className="mt-3 text-xs text-[var(--color-text-muted)] break-words">
          Mutations: {run.mutationIds.join(', ')}
        </div>
      )}
      {run.errorMessage && (
        <div className="mt-2 text-sm text-[var(--color-error-text)] break-words">{run.errorMessage}</div>
      )}
    </article>
  );
}
