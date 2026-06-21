import { RefreshCw } from 'lucide-react';
import type {
  ApplicationContextDeletionRun,
  ApplicationContextDocument,
  ApplicationContextDocumentStatus,
  ConnectedApplication,
} from '../../../components/types';
import { formatTimestamp } from '../../../components/utils';
import { ContextIndexBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardTitle } from '../ui/Card';
import { Select } from '../ui/Input';
import { FilterBar } from '../shared/FilterBar';
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
  const selectedApplication = applications.find((a) => a.applicationId === applicationId);

  return (
    <main className="max-w-7xl mx-auto px-6 py-8 space-y-5 animate-fade-in-up">
      <FilterBar title="RAG Context">
        <Select value={applicationId} onChange={(e) => setApplicationId(e.target.value)} className="min-w-[180px]">
          <option value="">All Mailboxes</option>
          {applications.map((app) => (
            <option key={app.applicationId} value={app.applicationId}>{app.displayName}</option>
          ))}
        </Select>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as ApplicationContextDocumentStatus | '')}
          className="min-w-[130px]"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="deleted">Deleted</option>
          <option value="error">Error</option>
        </Select>
        <Button variant="secondary" size="sm" onClick={onRefresh} disabled={busy}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
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
                {selectedApplication.contextDocumentCount || 0} Active Docs · Last Indexed {formatTimestamp(selectedApplication.contextLastIndexedAt)}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onToggleIndexing(selectedApplication.applicationId, !selectedApplication.contextIndexingEnabled)}
                disabled={busy}
              >
                {selectedApplication.contextIndexingEnabled ? 'Disable Indexing' : 'Enable Indexing'}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => onDeleteDocuments(selectedApplication.applicationId)}
                disabled={busy || (selectedApplication.contextDocumentCount || 0) === 0}
              >
                Delete Documents
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-5">
        <div>
          <CardHeader className="mb-3 px-0">
            <CardTitle>Indexed Documents</CardTitle>
            <span className="text-sm text-[var(--color-text-muted)]">{documents.length} Loaded</span>
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
                No Context Documents Found.
              </div>
            )}
          </div>
          {documentsCursor && (
            <Button variant="secondary" size="sm" className="mt-3" onClick={onLoadMoreDocuments} disabled={busy}>
              Load More Documents
            </Button>
          )}
        </div>

        <div>
          <CardHeader className="mb-3 px-0">
            <CardTitle>Deletion History</CardTitle>
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
                No Deletion History.
              </div>
            )}
          </div>
          {deletionRunsCursor && (
            <Button variant="secondary" size="sm" className="mt-3" onClick={onLoadMoreDeletions} disabled={busy}>
              Load More
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}
