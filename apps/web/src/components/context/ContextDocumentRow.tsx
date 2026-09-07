import { ExternalLink, ScrollText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ApplicationContextDocument, ConnectedApplication } from '../../types';
import { formatTimestamp } from '../../lib/format';
import { providerLabels } from '../../lib/providers';
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
  const { t, i18n } = useTranslation();
  const lng = i18n.resolvedLanguage;
  const fp = (value?: string | null): string =>
    value ? value.slice(0, 16) : t('context.fingerprintNotAvailable', 'not available');
  return (
    <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 min-w-0 animate-fade-in-up">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-[var(--color-text-primary)] truncate">
            {t('context.documentTitle', 'Document {{fingerprint}}', { fingerprint: fp(document.sourceDocumentFingerprint) })}
          </div>
          <div className="text-sm text-[var(--color-text-secondary)] truncate mt-0.5">
            {t('context.documentMeta', '{{app}} · {{provider}} · {{count}} Chars', { app: application?.displayName || document.applicationId, provider: providerLabels[document.sourceProviderId], count: document.indexedTextChars })}
          </div>
          <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
            {t('context.documentTimestamps', 'Indexed {{indexed}} · Updated {{updated}}', { indexed: formatTimestamp(document.indexedAt, lng), updated: formatTimestamp(document.updatedAt, lng) })}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" size="sm" onClick={() => onViewLogs(document.contextDocumentId)}>
            <ScrollText className="h-3.5 w-3.5" />
            {t('context.logs', 'Logs')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onOpenProviderDocument(document.contextDocumentId)}
            disabled={document.status === 'deleted'}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t('context.open', 'Open')}
          </Button>
          <DocStatusBadge status={document.status} />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
        <AuditValue label={t('context.auditContent', 'Content')} value={fp(document.contentFingerprint)} />
        <AuditValue label={t('context.auditThread', 'Thread')} value={fp(document.sourceThreadFingerprint)} />
        <AuditValue label={t('context.auditTitle', 'Title')} value={fp(document.titleFingerprint)} />
        <AuditValue label={t('context.auditSender', 'Sender')} value={fp(document.senderFingerprint)} />
      </div>
      {document.lastError && (
        <div className="mt-3 text-sm text-[var(--color-error-text)] break-words">{document.lastError}</div>
      )}
    </article>
  );
}
