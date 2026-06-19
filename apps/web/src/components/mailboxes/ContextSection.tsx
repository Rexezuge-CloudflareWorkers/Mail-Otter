import type { ConnectedApplication, CurrentUser } from '../../../components/types';
import { formatTimestamp } from '../../../components/utils';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardTitle } from '../ui/Card';
import { Metric } from '../shared/Metric';

export function ContextSection({
  application,
  user,
  busy,
  onUpdateContextIndexing,
  onUpdateMaxContextDocuments,
  onOpenContextAudit,
  onDeleteContextDocuments,
}: {
  application: ConnectedApplication;
  user: CurrentUser;
  busy: boolean;
  onUpdateContextIndexing: (enabled: boolean) => void;
  onUpdateMaxContextDocuments: (max: number | null) => void;
  onOpenContextAudit: () => void;
  onDeleteContextDocuments: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>RAG Context</CardTitle>
        <div className="flex flex-wrap items-center gap-4">
          <label className="inline-flex items-center gap-2.5 text-sm text-[var(--color-text-secondary)] cursor-pointer">
            <input
              type="checkbox"
              checked={application.contextIndexingEnabled}
              onChange={(e) => onUpdateContextIndexing(e.target.checked)}
              disabled={busy}
              className="h-4 w-4 accent-[var(--color-accent)] rounded"
            />
            Store documents
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
            Max docs
            <input
              type="number"
              min={1}
              max={user.limits.maxContextDocumentsPerApplication}
              placeholder={`Default (${user.limits.maxContextDocumentsPerApplication})`}
              value={application.maxContextDocuments ?? ''}
              onChange={(e) => {
                const val = e.target.value === '' ? null : Number(e.target.value);
                onUpdateMaxContextDocuments(val);
              }}
              disabled={busy}
              className="w-28 px-2 py-1 rounded-lg bg-[var(--color-surface-base)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[var(--color-accent)]"
            />
          </label>
        </div>
      </CardHeader>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Metric label="Indexed docs" value={String(application.contextDocumentCount || 0)} />
        <Metric label="Last indexed" value={formatTimestamp(application.contextLastIndexedAt)} />
        <Metric label="Last deletion" value={formatTimestamp(application.contextLastDeleteAcceptedAt)} />
        <Metric
          label="Context error"
          value={application.contextLastError || 'None'}
          tone={application.contextLastError ? 'error' : 'muted'}
          subtitle={application.contextLastError ? formatTimestamp(application.contextLastErrorAt) : undefined}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={onOpenContextAudit}>
          View RAG Context
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={onDeleteContextDocuments}
          disabled={busy || (application.contextDocumentCount || 0) === 0}
        >
          Delete Indexed Documents
        </Button>
      </div>
    </Card>
  );
}
