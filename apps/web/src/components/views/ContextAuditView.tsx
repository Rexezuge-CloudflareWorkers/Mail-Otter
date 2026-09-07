import { useTranslation } from 'react-i18next';
import type {
  ApplicationContextDeletionRun,
  ApplicationContextDocument,
  ApplicationContextDocumentStatus,
  ConnectedApplication,
} from '../../types';
import { formatTimestamp } from '../../lib/format';
import { ContextIndexBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardTitle } from '../ui/Card';
import { Select } from '../ui/Input';
import { FilterBar } from '../shared/FilterBar';
import { LoadMoreButton } from '../shared/LoadMoreButton';
import { MailboxSelect } from '../shared/MailboxSelect';
import { RefreshButton } from '../shared/RefreshButton';
import { ContextDocumentRow } from '../context/ContextDocumentRow';
import { ContextDeletionRunRow } from '../context/ContextDeletionRunRow';

export function ContextAuditView({
  applications,
  applicationId,
  setApplicationId,
  status,
  setStatus,
  documents,
  deletionRuns,
  documentsCursor,
  deletionRunsCursor,
  onRefresh,
  onLoadMoreDocuments,
  onLoadMoreDeletions,
  onOpenProviderDocument,
  onViewLogs,
  onToggleIndexing,
  onDeleteDocuments,
  busy,
}: {
  applications: ConnectedApplication[];
  applicationId: string;
  setApplicationId: (id: string) => void;
  status: ApplicationContextDocumentStatus | '';
  setStatus: (s: ApplicationContextDocumentStatus | '') => void;
  documents: ApplicationContextDocument[];
  deletionRuns: ApplicationContextDeletionRun[];
  documentsCursor?: string;
  deletionRunsCursor?: string;
  onRefresh: () => void;
  onLoadMoreDocuments: () => void;
  onLoadMoreDeletions: () => void;
  onOpenProviderDocument: (id: string) => void;
  onViewLogs: (id: string) => void;
  onToggleIndexing: (id: string, enabled: boolean) => void;
  onDeleteDocuments: (id: string) => void;
  busy: boolean;
}) {
  const { t, i18n } = useTranslation();
  const lng = i18n.resolvedLanguage;
  const selectedApplication = applications.find((a) => a.applicationId === applicationId);

  return (
    <main className="max-w-7xl mx-auto px-6 py-8 space-y-5 animate-fade-in-up">
      <FilterBar title={t('context.title', 'RAG Context')}>
        <MailboxSelect value={applicationId} onChange={setApplicationId} applications={applications} />
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as ApplicationContextDocumentStatus | '')}
          className="min-w-[130px]"
        >
          <option value="">{t('actions.allStatuses', 'All Statuses')}</option>
          <option value="active">{t('status.active', 'Active')}</option>
          <option value="deleted">{t('status.deleted', 'Deleted')}</option>
          <option value="error">{t('status.error', 'Error')}</option>
        </Select>
        <RefreshButton onRefresh={onRefresh} loading={busy} />
      </FilterBar>

      {selectedApplication && (
        <Card>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-base font-semibold text-[var(--color-text-primary)] truncate">
                  {selectedApplication.displayName}
                </h2>
                <ContextIndexBadge enabled={selectedApplication.contextIndexingEnabled} />
              </div>
              <div className="text-sm text-[var(--color-text-secondary)] mt-0.5">
                {t('context.docsSummary', '{{count}} Active Docs · Last Indexed {{date}}', { count: selectedApplication.contextDocumentCount || 0, date: formatTimestamp(selectedApplication.contextLastIndexedAt, lng) })}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onToggleIndexing(selectedApplication.applicationId, !selectedApplication.contextIndexingEnabled)}
                disabled={busy}
              >
                {selectedApplication.contextIndexingEnabled ? t('context.disableIndexing', 'Disable Indexing') : t('context.enableIndexing', 'Enable Indexing')}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => onDeleteDocuments(selectedApplication.applicationId)}
                disabled={busy || (selectedApplication.contextDocumentCount || 0) === 0}
              >
                {t('context.deleteDocuments', 'Delete Documents')}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-5">
        <div>
          <CardHeader className="mb-3 px-0">
            <CardTitle>{t('context.indexedDocuments', 'Indexed Documents')}</CardTitle>
            <span className="text-sm text-[var(--color-text-muted)]">{t('actions.loaded', '{{count}} Loaded', { count: documents.length })}</span>
          </CardHeader>
          <div className="space-y-2.5">
            {documents.map((doc) => (
              <ContextDocumentRow
                key={doc.contextDocumentId}
                document={doc}
                application={applications.find((a) => a.applicationId === doc.applicationId)}
                onOpenProviderDocument={onOpenProviderDocument}
                onViewLogs={onViewLogs}
              />
            ))}
            {documents.length === 0 && (
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-5 py-10 text-center text-sm text-[var(--color-text-muted)]">
                {t('context.noDocumentsFound', 'No Context Documents Found.')}
              </div>
            )}
          </div>
          {documentsCursor && (
            <LoadMoreButton onLoadMore={onLoadMoreDocuments} loading={busy} label={t('context.loadMoreDocuments', 'Load More Documents')} />
          )}
        </div>

        <div>
          <CardHeader className="mb-3 px-0">
            <CardTitle>{t('context.deletionHistory', 'Deletion History')}</CardTitle>
          </CardHeader>
          <div className="space-y-2.5">
            {deletionRuns.map((run) => (
              <ContextDeletionRunRow
                key={run.deletionRunId}
                run={run}
                application={applications.find((a) => a.applicationId === run.applicationId)}
              />
            ))}
            {deletionRuns.length === 0 && (
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-5 py-10 text-center text-sm text-[var(--color-text-muted)]">
                {t('context.noDeletionHistory', 'No Deletion History.')}
              </div>
            )}
          </div>
          {deletionRunsCursor && (
            <LoadMoreButton onLoadMore={onLoadMoreDeletions} loading={busy} />
          )}
        </div>
      </div>
    </main>
  );
}
