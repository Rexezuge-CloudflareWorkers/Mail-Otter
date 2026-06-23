import { X } from 'lucide-react';
import type { IntegrationDeliveryLog } from '../../../components/types';
import { formatTimestamp } from '../../../components/utils';
import { ModalShell } from './ModalShell';

export function IntegrationDeliveryLogsModal({
  logs,
  loading,
  onClose,
}: {
  logs: IntegrationDeliveryLog[];
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <ModalShell onClose={onClose} widthClass="w-full max-w-2xl max-h-[82vh] overflow-hidden mx-4" ariaLabel="Integration Delivery History">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Delivery History</h2>
        <button
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors p-1 rounded-lg hover:bg-[var(--color-surface-3)]"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="overflow-y-auto p-5 space-y-2.5 max-h-[calc(82vh-4rem)]">
        {loading && logs.length === 0 && (
          <div className="text-center text-[var(--color-text-muted)] py-10 text-sm">Loading...</div>
        )}
        {!loading && logs.length === 0 && (
          <div className="text-center text-[var(--color-text-muted)] py-10 text-sm">No Delivery Logs Found.</div>
        )}
        {logs.map((log) => {
          const isSuccess = log.status === 'success';
          const badgeClass = isSuccess
            ? 'bg-green-100 text-green-700'
            : 'bg-red-100 text-red-700';
          return (
            <div key={log.logId} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-base)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                    {log.emailSubject ?? 'No Subject'}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    {formatTimestamp(log.createdAt)}
                    {log.httpStatus != null && (
                      <span className="ml-2">HTTP {log.httpStatus}</span>
                    )}
                  </p>
                  {log.errorMessage && (
                    <p className="mt-1.5 text-xs text-[var(--color-error-text)] font-mono truncate">
                      {log.errorMessage}
                    </p>
                  )}
                </div>
                <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${badgeClass}`}>
                  {isSuccess ? 'Success' : 'Failed'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </ModalShell>
  );
}
