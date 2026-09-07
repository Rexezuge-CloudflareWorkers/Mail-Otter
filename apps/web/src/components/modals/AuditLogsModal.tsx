import { useTranslation } from 'react-i18next';
import type { ContextAuditLog } from '../../types';
import { formatTimestamp } from '../../lib/format';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import { RefreshButton } from '../shared/RefreshButton';
import { ModalBody, ModalEmpty, ModalHeader, ModalRow, ModalShell, WIDE_MODAL_CLASS } from './ModalShell';

const auditEventLabelKeys: Record<string, string | undefined> = {
  processing_started: 'context.audit.processingStarted',
  context_indexed: 'context.audit.contextIndexed',
  context_skipped: 'context.audit.contextSkipped',
  embedding_generated: 'context.audit.embeddingGenerated',
  rag_queried: 'context.audit.ragQueried',
  summary_generated: 'context.audit.summaryGenerated',
  attachment_analyzed: 'context.audit.attachmentAnalyzed',
  summary_sent: 'context.audit.summarySent',
  action_created: 'context.audit.actionCreated',
  action_executed: 'context.audit.actionExecuted',
  document_deleted: 'context.audit.documentDeleted',
  error: 'context.audit.error',
};

const auditEventDefaults: Record<string, string> = {
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
  const { t, i18n } = useTranslation();
  const lng = i18n.resolvedLanguage;
  return (
    <ModalShell onClose={onClose} widthClass={WIDE_MODAL_CLASS} ariaLabel={t('context.auditLogs', 'Document Audit Logs')}>
      <ModalHeader
        title={t('context.auditLogs', 'Document Audit Logs')}
        onClose={onClose}
        actions={<RefreshButton onRefresh={onRefresh} loading={loading} />}
      />

      <ModalBody>
        {logs.length === 0 && !loading && (
          <ModalEmpty message={t('context.noAuditLogs', 'No Audit Logs Found For This Document.')} />
        )}
        {logs.map((log, index) => {
          const dotClass =
            log.severity === 'error'
              ? 'bg-[var(--color-error-text)]'
              : log.severity === 'warning'
                ? 'bg-[var(--color-warning-text)]'
                : 'bg-[var(--color-success-text)]';
          const attemptNumber = (log.eventData as { attempt?: number })?.attempt;
          const labelKey = auditEventLabelKeys[log.eventType];
          const eventLabel = log.eventLabel || (labelKey === undefined ? log.eventType : t(labelKey, auditEventDefaults[log.eventType] ?? log.eventType));
          return (
            <ModalRow key={log.id}>
              <div className="flex items-start gap-2.5">
                <span className={cn('inline-block w-2 h-2 rounded-full shrink-0 mt-1.5', dotClass)} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-[var(--color-text-primary)]">
                    {eventLabel}
                    {attemptNumber != null && attemptNumber > 1 && (
                      <span className="ml-2 text-[var(--color-text-muted)] font-normal">{t('context.attemptNumber', '(Attempt {{n}})', { n: attemptNumber })}</span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)] mt-0.5 flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--color-surface-3)] text-[10px] font-medium">
                      #{logs.length - index}
                    </span>
                    {formatTimestamp(log.createdAt, lng)}
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
            {t('common.loadMore', 'Load More')}
          </Button>
        )}
      </ModalBody>
    </ModalShell>
  );
}
