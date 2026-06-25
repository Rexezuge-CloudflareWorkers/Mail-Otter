import type { EmailAction } from '../../../components/types';

export function ActionPayloadDetails({ action }: { action: EmailAction }) {
  const { payload } = action;

  const cardClass = 'rounded-xl bg-[var(--color-surface-base)] border border-[var(--color-border)] p-3.5 text-sm text-[var(--color-text-secondary)]';
  const titleClass = 'font-medium text-[var(--color-text-primary)] mb-1.5';

  if (payload.type === 'calendar.add_event') {
    return (
      <div className={cardClass}>
        <div className={titleClass}>Calendar Event</div>
        <div>{payload.eventTitle || action.title}</div>
        <div>{payload.startTime || ''} to {payload.endTime || ''}{payload.timeZone ? ` (${payload.timeZone})` : ''}</div>
        {payload.location ? <div>{payload.location}</div> : null}
      </div>
    );
  }
  if (payload.type === 'email.draft_reply') {
    return (
      <div className={cardClass}>
        <div className={titleClass}>Draft Reply</div>
        <pre className="whitespace-pre-wrap font-sans">{payload.draftBody || ''}</pre>
      </div>
    );
  }
  if (payload.type === 'external.open_link') {
    return (
      <div className={cardClass}>
        <div className={titleClass}>External Link</div>
        <div className="break-all">{payload.url || ''}</div>
      </div>
    );
  }
  if (payload.type === 'delivery.track_package') {
    return (
      <div className={cardClass}>
        <div className={titleClass}>Package Tracking</div>
        <div><span className="font-medium">Tracking Number:</span> {payload.trackingNumber || ''}</div>
        {payload.carrier ? <div><span className="font-medium">Carrier:</span> {payload.carrier}</div> : null}
        {payload.trackingUrl ? (
          <div className="mt-1.5">
            <a href={payload.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] underline">
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
        <div><span className="font-medium">Flight:</span> {payload.flightNumber || ''}</div>
        {payload.airline ? <div><span className="font-medium">Airline:</span> {payload.airline}</div> : null}
        {(payload.departureAirport || payload.arrivalAirport) ? (
          <div><span className="font-medium">Route:</span> {payload.departureAirport || '?'} → {payload.arrivalAirport || '?'}</div>
        ) : null}
        {payload.departureTime ? <div><span className="font-medium">Departure:</span> {payload.departureTime}</div> : null}
        {payload.trackingUrl ? (
          <div className="mt-1.5">
            <a href={payload.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] underline">
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
        {payload.payee ? <div><span className="font-medium">Payee:</span> {payload.payee}</div> : null}
        {payload.amount ? (
          <div>
            <span className="font-medium">Amount:</span> {payload.amount}{payload.currency ? ` ${payload.currency}` : ''}
          </div>
        ) : null}
        {payload.dueDate ? <div><span className="font-medium">Due:</span> {payload.dueDate}</div> : null}
        {payload.invoiceNumber ? <div><span className="font-medium">Invoice:</span> {payload.invoiceNumber}</div> : null}
        {payload.paymentUrl ? (
          <div className="mt-1.5">
            <a href={payload.paymentUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] underline">
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
        {payload.serviceType ? <div><span className="font-medium">Service:</span> {payload.serviceType}</div> : null}
        {payload.providerName ? <div><span className="font-medium">Provider:</span> {payload.providerName}</div> : null}
        {payload.appointmentTime ? <div><span className="font-medium">When:</span> {payload.appointmentTime}</div> : null}
        {payload.location ? <div><span className="font-medium">Location:</span> {payload.location}</div> : null}
        {payload.confirmationNumber ? <div><span className="font-medium">Confirmation:</span> {payload.confirmationNumber}</div> : null}
        {payload.notes ? <div><span className="font-medium">Notes:</span> {payload.notes}</div> : null}
      </div>
    );
  }
  return (
    <div className={cardClass}>
      <div className={titleClass}>Manual Todo</div>
      <div>{payload.instructions || action.description}</div>
    </div>
  );
}
