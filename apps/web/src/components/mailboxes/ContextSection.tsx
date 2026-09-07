import { useTranslation } from 'react-i18next';
import type { ConnectedApplication } from '../../types';
import { formatTimestamp } from '../../lib/format';
import { Button } from '../ui/Button';
import { Metric } from '../shared/Metric';
import { CollapsibleSection } from '../shared/CollapsibleSection';
import { useMailboxCallbacks } from '../../contexts/MailboxCallbacksContext';
import { useCurrentUserData } from '../../contexts/UserContext';

export function ContextSection({ application }: { application: ConnectedApplication }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.resolvedLanguage;
  const user = useCurrentUserData();
  const { busy, onUpdateContextIndexing, onUpdateRagRetrieval, onUpdateAttachmentVisionEnabled, onUpdateMaxContextDocuments, onOpenContextAudit, onDeleteContextDocuments, onDismissContextError } = useMailboxCallbacks();

  return (
    <CollapsibleSection title={t('context.title', 'RAG Context')}>
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <label className="inline-flex items-center gap-2.5 text-sm text-[var(--color-text-secondary)] cursor-pointer">
          <input
            type="checkbox"
            checked={application.contextIndexingEnabled}
            onChange={(e) => onUpdateContextIndexing(application.applicationId, e.target.checked)}
            disabled={busy}
            className="h-4 w-4 accent-[var(--color-accent)] rounded"
          />
          {t('context.indexNewEmails', 'Index New Emails')}
        </label>
        <label className="inline-flex items-center gap-2.5 text-sm text-[var(--color-text-secondary)] cursor-pointer">
          <input
            type="checkbox"
            checked={application.ragRetrievalEnabled}
            onChange={(e) => onUpdateRagRetrieval(application.applicationId, e.target.checked)}
            disabled={busy}
            className="h-4 w-4 accent-[var(--color-accent)] rounded"
          />
          {t('context.retrieveForSummaries', 'Retrieve Context For Summaries')}
        </label>
        <label className="inline-flex items-center gap-2.5 text-sm text-[var(--color-text-secondary)] cursor-pointer">
          <input
            type="checkbox"
            checked={application.attachmentVisionEnabled}
            onChange={(e) => onUpdateAttachmentVisionEnabled(application.applicationId, e.target.checked)}
            disabled={busy}
            className="h-4 w-4 accent-[var(--color-accent)] rounded"
          />
          {t('context.analyzeImageAttachments', 'Analyze Image Attachments')}
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
          {t('context.maxDocs', 'Max Docs')}
          <input
            type="number"
            min={1}
            max={user.limits.maxContextDocumentsPerApplication}
            placeholder={t('context.maxDocsDefault', 'Default ({{max}})', { max: user.limits.maxContextDocumentsPerApplication })}
            value={application.maxContextDocuments ?? ''}
            onChange={(e) => {
              const val = e.target.value === '' ? null : Number(e.target.value);
              onUpdateMaxContextDocuments(application.applicationId, val);
            }}
            disabled={busy}
            className="w-28 px-2 py-1 rounded-lg bg-[var(--color-surface-base)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-sm focus:outline-none focus:border-[var(--color-accent)]"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Metric label={t('context.indexedDocs', 'Indexed Docs')} value={String(application.contextDocumentCount || 0)} />
        <Metric label={t('context.lastIndexed', 'Last Indexed')} value={formatTimestamp(application.contextLastIndexedAt, lng)} />
        <Metric label={t('context.lastDeletion', 'Last Deletion')} value={formatTimestamp(application.contextLastDeleteAcceptedAt, lng)} />
        <Metric
          label={t('context.contextError', 'Context Error')}
          value={application.contextLastError || t('common.none', 'None')}
          tone={application.contextLastError ? 'error' : 'muted'}
          subtitle={application.contextLastError ? formatTimestamp(application.contextLastErrorAt, lng) : undefined}
          onDismiss={application.contextLastError ? () => onDismissContextError(application.applicationId) : undefined}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => onOpenContextAudit(application.applicationId)}>
          {t('context.viewRagContext', 'View RAG Context')}
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={() => onDeleteContextDocuments(application.applicationId)}
          disabled={busy || (application.contextDocumentCount || 0) === 0}
        >
          {t('context.deleteIndexedDocuments', 'Delete Indexed Documents')}
        </Button>
      </div>
    </CollapsibleSection>
  );
}
