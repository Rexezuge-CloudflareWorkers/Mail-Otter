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
        <div>{String(payload.startTime || '')} to {String(payload.endTime || '')}</div>
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
  return (
    <div className={cardClass}>
      <div className={titleClass}>Manual Todo</div>
      <div>{String(payload.instructions || action.description)}</div>
    </div>
  );
}
