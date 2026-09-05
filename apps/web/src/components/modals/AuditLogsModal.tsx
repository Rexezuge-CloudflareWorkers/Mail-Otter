import type { ContextAuditLog } from '../../types';
import { formatTimestamp } from '../../lib/format';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import { RefreshButton } from '../shared/RefreshButton';
import { ModalBody, ModalEmpty, ModalHeader, ModalRow, ModalShell, WIDE_MODAL_CLASS } from './ModalShell';

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
    <ModalShell onClose={onClose} widthClass={WIDE_MODAL_CLASS} ariaLabel="Document Audit Logs">
      <ModalHeader
        title="Document Audit Logs"
        onClose={onClose}
        actions={<RefreshButton onRefresh={onRefresh} loading={loading} />}
      />

      <ModalBody>
        {logs.length === 0 && !loading && (
          <ModalEmpty message="No Audit Logs Found For This Document." />
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
            <ModalRow key={log.id}>
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
            </ModalRow>
          );
        })}
        {cursor && (
          <Button variant="secondary" className="w-full" loading={loading} onClick={onLoadMore}>
            Load More
          </Button>
        )}
      </ModalBody>
    </ModalShell>
  );
}
