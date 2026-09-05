import type { IntegrationDeliveryLog } from '../../types';
import { formatTimestamp } from '../../lib/format';
import { DeliveryStatusBadge } from '../ui/Badge';
import { ModalBody, ModalEmpty, ModalHeader, ModalRow, ModalShell, WIDE_MODAL_CLASS } from './ModalShell';

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
    <ModalShell onClose={onClose} widthClass={WIDE_MODAL_CLASS} ariaLabel="Integration Delivery History">
      <ModalHeader title="Delivery History" onClose={onClose} />

      <ModalBody>
        {loading && logs.length === 0 && (
          <ModalEmpty message="Loading..." />
        )}
        {!loading && logs.length === 0 && (
          <ModalEmpty message="No Delivery Logs Found." />
        )}
        {logs.map((log) => {
          const isSuccess = log.status === 'success';
          return (
            <ModalRow key={log.logId}>
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
                <DeliveryStatusBadge status={isSuccess ? 'success' : 'failure'} />
              </div>
            </ModalRow>
          );
        })}
      </ModalBody>
    </ModalShell>
  );
}
