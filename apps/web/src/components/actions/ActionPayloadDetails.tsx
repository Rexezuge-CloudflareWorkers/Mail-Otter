import { useTranslation } from 'react-i18next';
import type { EmailAction } from '../../types';

export function ActionPayloadDetails({ action }: { action: EmailAction }) {
  const { t } = useTranslation();
  const { payload } = action;

  const cardClass = 'rounded-xl bg-[var(--color-surface-base)] border border-[var(--color-border)] p-3.5 text-sm text-[var(--color-text-secondary)]';
  const titleClass = 'font-medium text-[var(--color-text-primary)] mb-1.5';

  if (payload.type === 'calendar.add_event') {
    return (
      <div className={cardClass}>
        <div className={titleClass}>{t('actionTypes.calendar.add_event', 'Calendar Event')}</div>
        <div>{payload.eventTitle || action.title}</div>
        <div>{payload.startTime || ''} {t('actions.dateRangeTo', 'to')} {payload.endTime || ''}{payload.timeZone ? ` (${payload.timeZone})` : ''}</div>
        {payload.location ? <div>{payload.location}</div> : null}
      </div>
    );
  }
  if (payload.type === 'email.draft_reply') {
    return (
      <div className={cardClass}>
        <div className={titleClass}>{t('actions.draftReplyTitle', 'Draft Reply')}</div>
        <pre className="whitespace-pre-wrap font-sans">{payload.draftBody || ''}</pre>
      </div>
    );
  }
  if (payload.type === 'external.open_link') {
    return (
      <div className={cardClass}>
        <div className={titleClass}>{t('actions.externalLinkTitle', 'External Link')}</div>
        <div className="break-all">{payload.url || ''}</div>
      </div>
    );
  }
  if (payload.type === 'delivery.track_package') {
    return (
      <div className={cardClass}>
        <div className={titleClass}>{t('actionTypes.delivery.track_package', 'Package Tracking')}</div>
        <div><span className="font-medium">{t('actions.trackingNumber', 'Tracking Number:')}</span> {payload.trackingNumber || ''}</div>
        {payload.carrier ? <div><span className="font-medium">{t('actions.carrier', 'Carrier:')}</span> {payload.carrier}</div> : null}
        {payload.trackingUrl ? (
          <div className="mt-1.5">
            <a href={payload.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] underline">
              {t('actions.trackPackage', 'Track Package')}
            </a>
          </div>
        ) : null}
      </div>
    );
  }
  if (payload.type === 'travel.track_flight') {
    return (
      <div className={cardClass}>
        <div className={titleClass}>{t('actions.flightTitle', 'Flight')}</div>
        <div><span className="font-medium">{t('actions.flight', 'Flight:')}</span> {payload.flightNumber || ''}</div>
        {payload.airline ? <div><span className="font-medium">{t('actions.airline', 'Airline:')}</span> {payload.airline}</div> : null}
        {(payload.departureAirport || payload.arrivalAirport) ? (
          <div><span className="font-medium">{t('actions.route', 'Route:')}</span> {payload.departureAirport || '?'} → {payload.arrivalAirport || '?'}</div>
        ) : null}
        {payload.departureTime ? <div><span className="font-medium">{t('actions.departure', 'Departure:')}</span> {payload.departureTime}</div> : null}
        {payload.trackingUrl ? (
          <div className="mt-1.5">
            <a href={payload.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] underline">
              {t('actions.trackFlight', 'Track Flight')}
            </a>
          </div>
        ) : null}
      </div>
    );
  }
  if (payload.type === 'finance.pay_bill') {
    return (
      <div className={cardClass}>
        <div className={titleClass}>{t('actionTypes.finance.pay_bill', 'Bill Payment')}</div>
        {payload.payee ? <div><span className="font-medium">{t('actions.payee', 'Payee:')}</span> {payload.payee}</div> : null}
        {payload.amount ? (
          <div>
            <span className="font-medium">{t('actions.amount', 'Amount:')}</span> {payload.amount}{payload.currency ? ` ${payload.currency}` : ''}
          </div>
        ) : null}
        {payload.dueDate ? <div><span className="font-medium">{t('actions.due', 'Due:')}</span> {payload.dueDate}</div> : null}
        {payload.invoiceNumber ? <div><span className="font-medium">{t('actions.invoice', 'Invoice:')}</span> {payload.invoiceNumber}</div> : null}
        {payload.paymentUrl ? (
          <div className="mt-1.5">
            <a href={payload.paymentUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] underline">
              {t('actions.payNow', 'Pay Now')}
            </a>
          </div>
        ) : null}
      </div>
    );
  }
  if (payload.type === 'appointment.confirm') {
    return (
      <div className={cardClass}>
        <div className={titleClass}>{t('actionTypes.appointment.confirm', 'Appointment')}</div>
        {payload.serviceType ? <div><span className="font-medium">{t('actions.service', 'Service:')}</span> {payload.serviceType}</div> : null}
        {payload.providerName ? <div><span className="font-medium">{t('actions.provider', 'Provider:')}</span> {payload.providerName}</div> : null}
        {payload.appointmentTime ? <div><span className="font-medium">{t('actions.when', 'When:')}</span> {payload.appointmentTime}</div> : null}
        {payload.location ? <div><span className="font-medium">{t('actions.location', 'Location:')}</span> {payload.location}</div> : null}
        {payload.confirmationNumber ? <div><span className="font-medium">{t('actions.confirmation', 'Confirmation:')}</span> {payload.confirmationNumber}</div> : null}
        {payload.notes ? <div><span className="font-medium">{t('actions.notes', 'Notes:')}</span> {payload.notes}</div> : null}
      </div>
    );
  }
  return (
    <div className={cardClass}>
      <div className={titleClass}>{t('actions.manualTodoTitle', 'Manual Todo')}</div>
      <div>{payload.instructions || action.description}</div>
    </div>
  );
}
