import { ExternalLink, ScrollText } from 'lucide-react';
import type { ApplicationContextDocument, ConnectedApplication } from '../../../components/types';
import { formatTimestamp, providerLabels } from '../../../components/utils';
import { DocStatusBadge } from '../ui/Badge';
import { Button } from '../ui/Button';

function AuditValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[var(--color-surface-base)] border border-[var(--color-border)] p-2.5 min-w-0">
      <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">{label}</div>
      <div className="mt-1 font-mono text-xs text-[var(--color-text-secondary)] break-all">{value}</div>
    </div>
  );
}

function formatFingerprint(value?: string | null): string {
  return value ? value.slice(0, 16) : 'not available';
}

export function ContextDocumentRow({
  document,
  application,
  onOpenProviderDocument,
  onViewLogs,
}: {
  document: ApplicationContextDocument;
  application: ConnectedApplication | undefined;
  onOpenProviderDocument: (id: string) => void;
  onViewLogs: (id: string) => void;
}) {
  return (
    <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 min-w-0 animate-fade-in-up">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-[var(--color-text-primary)] truncate">
            Document {formatFingerprint(document.sourceDocumentFingerprint)}
          </div>
          <div className="text-sm text-[var(--color-text-secondary)] truncate mt-0.5">
            {application?.displayName || document.applicationId} · {providerLabels[document.sourceProviderId]} · {document.indexedTextChars} Chars
          </div>
          <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
            Indexed {formatTimestamp(document.indexedAt)} · Updated {formatTimestamp(document.updatedAt)}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" size="sm" onClick={() => onViewLogs(document.contextDocumentId)}>
            <ScrollText className="h-3.5 w-3.5" />
            Logs
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onOpenProviderDocument(document.contextDocumentId)}
            disabled={document.status === 'deleted'}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open
          </Button>
          <DocStatusBadge status={document.status} />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
        <AuditValue label="Content" value={formatFingerprint(document.contentFingerprint)} />
        <AuditValue label="Thread" value={formatFingerprint(document.sourceThreadFingerprint)} />
        <AuditValue label="Title" value={formatFingerprint(document.titleFingerprint)} />
        <AuditValue label="Sender" value={formatFingerprint(document.senderFingerprint)} />
      </div>
      {document.lastError && (
        <div className="mt-3 text-sm text-[var(--color-error-text)] break-words">{document.lastError}</div>
      )}
    </article>
  );
}
