import type { ConnectedApplication, EmailActionType } from '../../../components/types';
import { CollapsibleSection } from '../shared/CollapsibleSection';
import { useMailboxCallbacks } from '../../contexts/MailboxCallbacksContext';

interface ActionTypeConfig {
  type: EmailActionType;
  label: string;
  description: string;
  risk: 'low' | 'medium' | 'high';
  warning?: string;
}

const ACTION_TYPES: ActionTypeConfig[] = [
  { type: 'delivery.track_package', label: 'Track Package', description: 'Notes tracking number and opens tracking link.', risk: 'low' },
  { type: 'travel.track_flight', label: 'Track Flight', description: 'Notes flight details and opens tracking link.', risk: 'low' },
  { type: 'finance.pay_bill', label: 'Pay Bill', description: 'Notes bill details and opens payment link.', risk: 'low' },
  { type: 'appointment.confirm', label: 'Confirm Appointment', description: 'Notes appointment details.', risk: 'low' },
  { type: 'external.open_link', label: 'Open Link', description: 'Marks the link as reviewed.', risk: 'low' },
  { type: 'manual.todo', label: 'Manual Todo', description: 'Acknowledges the task immediately.', risk: 'low' },
  { type: 'email.draft_reply', label: 'Draft Reply', description: 'Creates a draft reply in your mailbox.', risk: 'medium', warning: 'Creates drafts without review.' },
  { type: 'calendar.add_event', label: 'Add Calendar Event', description: 'Adds the event to your calendar.', risk: 'high', warning: 'Adds events to your calendar without review. Requires the calendar feature to be enabled.' },
];

const RISK_COLORS: Record<'low' | 'medium' | 'high', string> = {
  low: 'text-[var(--color-success-text)]',
  medium: 'text-[var(--color-warning-text)]',
  high: 'text-[var(--color-error-text)]',
};

export function AutoExecuteSection({ application }: { application: ConnectedApplication }) {
  const { busy, onUpdateAutoExecuteActionTypes } = useMailboxCallbacks();
  const enabled = new Set(application.autoExecuteActionTypes);

  const toggle = (type: EmailActionType) => {
    const next = new Set(enabled);
    if (next.has(type)) {
      next.delete(type);
    } else {
      next.add(type);
    }
    onUpdateAutoExecuteActionTypes(application.applicationId, Array.from(next));
  };

  return (
    <CollapsibleSection title="Action Auto-Execution">
      <p className="text-xs text-[var(--color-text-muted)] mb-4">
        Automatically execute these action types when a matching email is processed. Results appear in the Actions view without requiring a manual click.
      </p>
      <div className="space-y-2">
        {ACTION_TYPES.map(({ type, label, description, risk, warning }) => {
          const isEnabled = enabled.has(type);
          return (
            <label
              key={type}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                isEnabled
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-subtle)]'
                  : 'border-[var(--color-border)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-hover)]'
              } ${busy ? 'opacity-60 pointer-events-none' : ''}`}
            >
              <input
                type="checkbox"
                className="mt-0.5 shrink-0 accent-[var(--color-accent)]"
                checked={isEnabled}
                disabled={busy}
                onChange={() => toggle(type)}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--color-text-primary)]">{label}</span>
                  <span className={`text-[10px] font-semibold uppercase ${RISK_COLORS[risk]}`}>{risk}</span>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{description}</p>
                {warning && (
                  <p className={`text-xs mt-0.5 ${RISK_COLORS[risk]}`}>{warning}</p>
                )}
              </div>
            </label>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}
