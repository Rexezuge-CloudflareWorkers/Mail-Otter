import { useTranslation } from 'react-i18next';
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
  const { t, i18n } = useTranslation();
  const lng = i18n.resolvedLanguage;
  return (
    <ModalShell onClose={onClose} widthClass={WIDE_MODAL_CLASS} ariaLabel={t('integrations.deliveryHistoryTitle', 'Integration Delivery History')}>
      <ModalHeader title={t('context.deliveryHistory', 'Delivery History')} onClose={onClose} />

      <ModalBody>
        {loading && logs.length === 0 && (
          <ModalEmpty message={t('common.loading', 'Loading…')} />
        )}
        {!loading && logs.length === 0 && (
          <ModalEmpty message={t('integrations.noDeliveryLogs', 'No Delivery Logs Found.')} />
        )}
        {logs.map((log) => {
          const isSuccess = log.status === 'success';
          return (
            <ModalRow key={log.logId}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                    {log.emailSubject ?? t('integrations.noSubject', 'No Subject')}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    {formatTimestamp(log.createdAt, lng)}
                    {log.httpStatus != null && (
                      <span className="ml-2">{t('integrations.httpStatus', 'HTTP {{status}}', { status: log.httpStatus })}</span>
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
