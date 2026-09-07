import { useTranslation } from 'react-i18next';
import type { ConnectedApplication, EmailActionType } from '../../types';
import { CollapsibleSection } from '../shared/CollapsibleSection';
import { useMailboxCallbacks } from '../../contexts/MailboxCallbacksContext';

type AutoExecuteRisk = 'low' | 'medium' | 'high';

interface ActionTypeConfig {
  type: EmailActionType;
  risk: AutoExecuteRisk;
}

const ACTION_TYPES: ActionTypeConfig[] = [
  { type: 'delivery.track_package', risk: 'low' },
  { type: 'travel.track_flight', risk: 'low' },
  { type: 'finance.pay_bill', risk: 'low' },
  { type: 'appointment.confirm', risk: 'low' },
  { type: 'external.open_link', risk: 'low' },
  { type: 'manual.todo', risk: 'low' },
  { type: 'email.draft_reply', risk: 'medium' },
  { type: 'calendar.add_event', risk: 'high' },
];

const RISK_COLORS: Record<'low' | 'medium' | 'high', string> = {
  low: 'text-[var(--color-success-text)]',
  medium: 'text-[var(--color-warning-text)]',
  high: 'text-[var(--color-error-text)]',
};

export function AutoExecuteSection({ application }: { application: ConnectedApplication }) {
  const { t } = useTranslation();
  const { busy, onUpdateAutoExecuteActionTypes } = useMailboxCallbacks();
  const enabled = new Set(application.autoExecuteActionTypes);

  const actionLabels: Record<EmailActionType, string> = {
    'delivery.track_package': t('autoExecute.trackPackage', 'Track Package'),
    'travel.track_flight': t('autoExecute.trackFlight', 'Track Flight'),
    'finance.pay_bill': t('autoExecute.payBill', 'Pay Bill'),
    'appointment.confirm': t('autoExecute.confirmAppointment', 'Confirm Appointment'),
    'external.open_link': t('autoExecute.openLink', 'Open Link'),
    'manual.todo': t('autoExecute.manualTodo', 'Manual Todo'),
    'email.draft_reply': t('autoExecute.draftReply', 'Draft Reply'),
    'calendar.add_event': t('autoExecute.addCalendarEvent', 'Add Calendar Event'),
  };
  const actionDescriptions: Record<EmailActionType, string> = {
    'delivery.track_package': t('autoExecute.trackPackageDesc', 'Notes tracking number and opens tracking link.'),
    'travel.track_flight': t('autoExecute.trackFlightDesc', 'Notes flight details and opens tracking link.'),
    'finance.pay_bill': t('autoExecute.payBillDesc', 'Notes bill details and opens payment link.'),
    'appointment.confirm': t('autoExecute.confirmAppointmentDesc', 'Notes appointment details.'),
    'external.open_link': t('autoExecute.openLinkDesc', 'Marks the link as reviewed.'),
    'manual.todo': t('autoExecute.manualTodoDesc', 'Acknowledges the task immediately.'),
    'email.draft_reply': t('autoExecute.draftReplyDesc', 'Creates a draft reply in your mailbox.'),
    'calendar.add_event': t('autoExecute.addCalendarEventDesc', 'Adds the event to your calendar.'),
  };
  const actionWarnings: Partial<Record<EmailActionType, string>> = {
    'email.draft_reply': t('autoExecute.draftReplyWarning', 'Creates drafts without review.'),
    'calendar.add_event': t('autoExecute.addCalendarEventWarning', 'Adds events to your calendar without review. Requires the calendar feature to be enabled.'),
  };
  const riskLabels: Record<'low' | 'medium' | 'high', string> = {
    low: t('autoExecute.risk.low', 'low'),
    medium: t('autoExecute.risk.medium', 'medium'),
    high: t('autoExecute.risk.high', 'high'),
  };

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
    <CollapsibleSection title={t('autoExecute.title', 'Action Auto-Execution')}>
      <p className="text-xs text-[var(--color-text-muted)] mb-4">
        {t('autoExecute.description', 'Automatically execute these action types when a matching email is processed. Results appear in the Actions view without requiring a manual click.')}
      </p>
      <div className="space-y-2">
        {ACTION_TYPES.map(({ type, risk }) => {
          const isEnabled = enabled.has(type);
          const label = actionLabels[type];
          const description = actionDescriptions[type];
          const warning = actionWarnings[type];
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
                  <span className={`text-[10px] font-semibold uppercase ${RISK_COLORS[risk]}`}>{riskLabels[risk]}</span>
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
