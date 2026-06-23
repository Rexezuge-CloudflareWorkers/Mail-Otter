import type { EmailAction } from '../../../components/types';

export function ActionPayloadDetails({ action }: { action: EmailAction }) {
  const { payload } = action;

  const cardClass = 'rounded-xl bg-[var(--color-surface-base)] border border-[var(--color-border)] p-3.5 text-sm text-[var(--color-text-secondary)]';
  const titleClass = 'font-medium text-[var(--color-text-primary)] mb-1.5';

  if (payload.type === 'calendar.add_event') {
    return (
      <div className={cardClass}>
        <div className={titleClass}>Calendar Event</div>
        <div>{String(payload.eventTitle || action.title)}</div>
        <div>{String(payload.startTime || '')} to {String(payload.endTime || '')}{payload.timeZone ? ` (${String(payload.timeZone)})` : ''}</div>
        {payload.location ? <div>{String(payload.location)}</div> : null}
      </div>
    );
  }
  if (payload.type === 'email.draft_reply') {
    return (
      <div className={cardClass}>
        <div className={titleClass}>Draft Reply</div>
        <pre className="whitespace-pre-wrap font-sans">{String(payload.draftBody || '')}</pre>
      </div>
    );
  }
  if (payload.type === 'external.open_link') {
    return (
      <div className={cardClass}>
        <div className={titleClass}>External Link</div>
        <div className="break-all">{String(payload.url || '')}</div>
      </div>
    );
  }
  if (payload.type === 'delivery.track_package') {
    return (
      <div className={cardClass}>
        <div className={titleClass}>Package Tracking</div>
        <div><span className="font-medium">Tracking Number:</span> {String(payload.trackingNumber || '')}</div>
        {payload.carrier ? <div><span className="font-medium">Carrier:</span> {String(payload.carrier)}</div> : null}
        {payload.trackingUrl ? (
          <div className="mt-1.5">
            <a href={String(payload.trackingUrl)} target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] underline">
              Track Package
            </a>
          </div>
        ) : null}
      </div>
    );
  }
  if (payload.type === 'travel.track_flight') {
    return (
      <div className={cardClass}>
        <div className={titleClass}>Flight</div>
        <div><span className="font-medium">Flight:</span> {String(payload.flightNumber || '')}</div>
        {payload.airline ? <div><span className="font-medium">Airline:</span> {String(payload.airline)}</div> : null}
        {(payload.departureAirport || payload.arrivalAirport) ? (
          <div><span className="font-medium">Route:</span> {String(payload.departureAirport || '?')} → {String(payload.arrivalAirport || '?')}</div>
        ) : null}
        {payload.departureTime ? <div><span className="font-medium">Departure:</span> {String(payload.departureTime)}</div> : null}
        {payload.trackingUrl ? (
          <div className="mt-1.5">
            <a href={String(payload.trackingUrl)} target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] underline">
              Track Flight
            </a>
          </div>
        ) : null}
      </div>
    );
  }
  if (payload.type === 'finance.pay_bill') {
    return (
      <div className={cardClass}>
        <div className={titleClass}>Bill Payment</div>
        {payload.payee ? <div><span className="font-medium">Payee:</span> {String(payload.payee)}</div> : null}
        {payload.amount ? (
          <div>
            <span className="font-medium">Amount:</span> {String(payload.amount)}{payload.currency ? ` ${String(payload.currency)}` : ''}
          </div>
        ) : null}
        {payload.dueDate ? <div><span className="font-medium">Due:</span> {String(payload.dueDate)}</div> : null}
        {payload.invoiceNumber ? <div><span className="font-medium">Invoice:</span> {String(payload.invoiceNumber)}</div> : null}
        {payload.paymentUrl ? (
          <div className="mt-1.5">
            <a href={String(payload.paymentUrl)} target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] underline">
              Pay Now
            </a>
          </div>
        ) : null}
      </div>
    );
  }
  if (payload.type === 'appointment.confirm') {
    return (
      <div className={cardClass}>
        <div className={titleClass}>Appointment</div>
        {payload.serviceType ? <div><span className="font-medium">Service:</span> {String(payload.serviceType)}</div> : null}
        {payload.providerName ? <div><span className="font-medium">Provider:</span> {String(payload.providerName)}</div> : null}
        {payload.appointmentTime ? <div><span className="font-medium">When:</span> {String(payload.appointmentTime)}</div> : null}
        {payload.location ? <div><span className="font-medium">Location:</span> {String(payload.location)}</div> : null}
        {payload.confirmationNumber ? <div><span className="font-medium">Confirmation:</span> {String(payload.confirmationNumber)}</div> : null}
        {payload.notes ? <div><span className="font-medium">Notes:</span> {String(payload.notes)}</div> : null}
      </div>
    );
  }
  return (
    <div className={cardClass}>
      <div className={titleClass}>Manual Todo</div>
      <div>{String(payload.instructions || action.description)}</div>
    </div>
  );
}
