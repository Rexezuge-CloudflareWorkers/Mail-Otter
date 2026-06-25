import { X, RefreshCw } from 'lucide-react';
import type { ContextAuditLog } from '../../../components/types';
import { formatTimestamp } from '../../../components/utils';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import { ModalShell } from './ModalShell';

const auditEventLabels: Record<string, string> = {
  processing_started: 'Processing Started',
  context_indexed: 'Context Indexed',
  context_skipped: 'Context Skipped',
  embedding_generated: 'Embedding Generated',
  rag_queried: 'RAG Context Queried',
  summary_generated: 'Summary Generated',
  attachment_analyzed: 'Attachment Vision Analysis',
  summary_sent: 'Summary Email Sent',
  action_created: 'Action Created',
  action_executed: 'Action Executed',
  document_deleted: 'Document Deleted',
  error: 'Error',
};

export function AuditLogsModal({
  logs,
  cursor,
  loading,
  onClose,
  onLoadMore,
  onRefresh,
}: {
  logs: ContextAuditLog[];
  cursor?: string | null;
  loading: boolean;
  onClose: () => void;
  onLoadMore: () => void;
  onRefresh: () => void;
}) {
  return (
    <ModalShell onClose={onClose} widthClass="w-full max-w-2xl max-h-[82vh] overflow-hidden mx-4" ariaLabel="Document Audit Logs">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Document Audit Logs</h2>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" loading={loading} onClick={onRefresh}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <button
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors p-1 rounded-lg hover:bg-[var(--color-surface-3)]"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="overflow-y-auto p-5 space-y-2.5 max-h-[calc(82vh-4rem)]">
        {logs.length === 0 && !loading && (
          <div className="text-center text-[var(--color-text-muted)] py-10 text-sm">No Audit Logs Found For This Document.</div>
        )}
        {logs.map((log, index) => {
          const dotClass =
            log.severity === 'error'
              ? 'bg-[var(--color-error-text)]'
              : log.severity === 'warning'
                ? 'bg-[var(--color-warning-text)]'
                : 'bg-[var(--color-success-text)]';
          const attemptNumber = (log.eventData as { attempt?: number })?.attempt;
          return (
            <div key={log.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-base)] p-4">
              <div className="flex items-start gap-2.5">
                <span className={cn('inline-block w-2 h-2 rounded-full shrink-0 mt-1.5', dotClass)} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-[var(--color-text-primary)]">
                    {log.eventLabel || auditEventLabels[log.eventType] || log.eventType}
                    {attemptNumber != null && attemptNumber > 1 && (
                      <span className="ml-2 text-[var(--color-text-muted)] font-normal">(Attempt {attemptNumber})</span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)] mt-0.5 flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--color-surface-3)] text-[10px] font-medium">
                      #{logs.length - index}
                    </span>
                    {formatTimestamp(log.createdAt)}
                    <span className="px-1.5 py-0.5 rounded bg-[var(--color-surface-3)] text-[10px] uppercase tracking-wide">
                      {log.eventType}
                    </span>
                  </div>
                  {log.eventData != null && (
                    <div className="mt-2 text-xs text-[var(--color-text-muted)] font-mono bg-[var(--color-surface-base)] border border-[var(--color-border)] rounded-lg p-2 overflow-x-auto">
                      {JSON.stringify(log.eventData, null, 1)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {cursor && (
          <Button variant="secondary" className="w-full" loading={loading} onClick={onLoadMore}>
            Load More
          </Button>
        )}
      </div>
    </ModalShell>
  );
}
