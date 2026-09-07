import { useState, useRef, useEffect } from 'react';
import { AlarmClock, CalendarClock, RefreshCw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ConnectedApplication, EmailAction, EmailActionExecution, EmailActionStatus } from '../../types';
import { formatExpiryTimestamp, formatFutureDuration, formatTimestamp } from '../../lib/format';
import { ActionStatusBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardTitle } from '../ui/Card';
import { Select, Label } from '../ui/Input';
import { Metric } from '../shared/Metric';
import { FilterBar } from '../shared/FilterBar';
import { LoadMoreButton } from '../shared/LoadMoreButton';
import { MailboxSelect } from '../shared/MailboxSelect';
import { RefreshButton } from '../shared/RefreshButton';
import { ActionPayloadDetails } from '../actions/ActionPayloadDetails';
import { cn } from '../../lib/utils';

const AUTO_EXECUTABLE_TYPES = new Set(['calendar.add_event', 'email.draft_reply']);

function useSnoozePresets(): { label: string; getValue: () => string }[] {
  const { t } = useTranslation();
  return [
    { label: t('actions.presets.oneHour', '1 Hour'), getValue: () => new Date(Date.now() + 60 * 60 * 1000).toISOString() },
    {
      label: t('actions.presets.endOfDay', 'End Of Day'),
      getValue: () => {
        const d = new Date();
        d.setHours(18, 0, 0, 0);
        if (d <= new Date()) d.setDate(d.getDate() + 1);
        return d.toISOString();
      },
    },
    {
      label: t('actions.presets.tomorrow', 'Tomorrow'),
      getValue: () => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(9, 0, 0, 0);
        return d.toISOString();
      },
    },
    { label: t('actions.presets.threeDays', '3 Days'), getValue: () => new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() },
    { label: t('actions.presets.oneWeek', '1 Week'), getValue: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() },
  ];
}

function formatSnoozedUntil(ts: number, lng?: string | null): string {
  return formatFutureDuration(ts, lng ?? undefined);
}

const pad = (n: number) => String(n).padStart(2, '0');

function toLocalDatetimeValue(isoString: string): string {
  const d = new Date(isoString);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localDatetimeToISO(local: string): string {
  return new Date(local).toISOString();
}

function SnoozeDropdown({
  onSnooze,
  disabled,
}: {
  onSnooze: (isoString: string) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const presets = useSnoozePresets();
  const [open, setOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const [minDatetime] = useState(() => toLocalDatetimeValue(new Date(Date.now() + 60_000).toISOString()));

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title={t('actions.snoozeAction', 'Snooze Action')}
      >
        <AlarmClock className="h-3.5 w-3.5" />
        {t('actions.snooze', 'Snooze')}
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl shadow-xl w-48 py-1.5">
          {presets.map((preset) => (
            <button
              key={preset.label}
              className="w-full text-left px-3.5 py-1.5 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)] transition-colors"
              onClick={() => {
                onSnooze(preset.getValue());
                setOpen(false);
              }}
            >
              {preset.label}
            </button>
          ))}
          <div className="border-t border-[var(--color-border)] my-1.5" />
          <div className="px-3.5 pb-1.5 space-y-1.5">
            <input
              type="datetime-local"
              className="w-full rounded-lg bg-[var(--color-surface-3)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-xs px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              value={customValue}
              min={minDatetime}
              onChange={(e) => setCustomValue(e.target.value)}
            />
            <Button
              variant="secondary"
              size="sm"
              className="w-full text-xs"
              disabled={!customValue}
              onClick={() => {
                if (!customValue) {
                	return;
                }

                onSnooze(localDatetimeToISO(customValue));
                setOpen(false);
              }}
            >
              {t('actions.setCustom', 'Set Custom')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ActionsView({
  applications,
  applicationId,
  setApplicationId,
  status,
  setStatus,
  showSnoozed,
  setShowSnoozed,
  actions,
  actionsCursor,
  selectedActionId,
  executions,
  onRefresh,
  onLoadMore,
  onSelectAction,
  onExecuteAction,
  onSnoozeAction,
  onScheduleAction,
  busy,
}: {
  applications: ConnectedApplication[];
  applicationId: string;
  setApplicationId: (id: string) => void;
  status: EmailActionStatus | '';
  setStatus: (s: EmailActionStatus | '') => void;
  showSnoozed: boolean;
  setShowSnoozed: (v: boolean) => void;
  actions: EmailAction[];
  actionsCursor?: string;
  selectedActionId: string;
  executions: EmailActionExecution[];
  onRefresh: () => void;
  onLoadMore: () => void;
  onSelectAction: (id: string) => void;
  onExecuteAction: (id: string) => void;
  onSnoozeAction: (id: string, snoozedUntil: string | null) => void;
  onScheduleAction: (id: string, scheduledFor: string | null) => void;
  busy: boolean;
}) {
  const { t, i18n } = useTranslation();
  const lng = i18n.resolvedLanguage;
  const selectedAction = actions.find((a) => a.actionId === selectedActionId);
  const [now] = useState(() => Date.now() / 1000);
  const [minScheduleDatetime] = useState(() => toLocalDatetimeValue(new Date(Date.now() + 60_000).toISOString()));

  const [scheduleCustomValue, setScheduleCustomValue] = useState('');

  const handleRefreshExecutions = () => {
    onSelectAction(selectedAction!.actionId);
  };

  const isSnoozed = (a: EmailAction) => Boolean(a.snoozedUntil && a.snoozedUntil > now);
  const isScheduled = (a: EmailAction) => Boolean(a.scheduledFor && a.scheduledFor > now);

  return (
    <main className="max-w-7xl mx-auto px-6 py-8 space-y-5 animate-fade-in-up">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">{t('actions.title', 'Actions')}</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
            {t('actions.subtitle', 'Review AI-Proposed Actions, Execution Results, Audit Trail, And Expiry.')}
          </p>
        </div>
        <RefreshButton onRefresh={onRefresh} loading={busy} />
      </div>

      <FilterBar>
        <div className="flex flex-col gap-1.5">
          <Label>{t('actions.filterMailbox', 'Mailbox')}</Label>
          <MailboxSelect value={applicationId} onChange={setApplicationId} applications={applications} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>{t('actions.filterStatus', 'Status')}</Label>
          <Select value={status} onChange={(e) => setStatus(e.target.value as EmailActionStatus | '')} className="min-w-[140px]">
            <option value="">{t('actions.allStatuses', 'All Statuses')}</option>
            {(['pending', 'executing', 'succeeded', 'failed', 'expired', 'cancelled'] as EmailActionStatus[]).map((s) => (
              <option key={s} value={s}>{t(`status.${s}`, s.charAt(0).toUpperCase() + s.slice(1))}</option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>{t('actions.snoozed', 'Snoozed')}</Label>
          <Button
            variant={showSnoozed ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setShowSnoozed(!showSnoozed)}
            className="self-start"
          >
            <AlarmClock className="h-3.5 w-3.5" />
            {showSnoozed ? t('actions.hideSnoozed', 'Hiding Snoozed') : t('actions.showSnoozed', 'Show Snoozed')}
          </Button>
        </div>
      </FilterBar>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-5">
        <Card className="p-0 overflow-hidden">
          <CardHeader className="px-5 pt-5 pb-4 border-b border-[var(--color-border)] mb-0">
            <CardTitle>{t('actions.actionItems', 'Action Items')}</CardTitle>
            <span className="text-sm text-[var(--color-text-muted)]">{t('actions.loaded', '{{count}} Loaded', { count: actions.length })}</span>
          </CardHeader>
          <div className="divide-y divide-[var(--color-border)]">
            {actions.map((action) => (
              <button
                key={action.actionId}
                onClick={() => onSelectAction(action.actionId)}
                className={cn(
                  'w-full text-left px-5 py-4 transition-colors duration-150',
                  selectedActionId === action.actionId ? 'bg-[#0e2d22]' : 'hover:bg-[var(--color-surface-2)]',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[var(--color-text-primary)] truncate">{action.title}</div>
                    <div className="text-sm text-[var(--color-text-secondary)] mt-0.5 line-clamp-1">{action.description}</div>
                    <div className="text-xs text-[var(--color-text-muted)] mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>{t(`actionTypes.${action.actionType}`, action.actionType)}</span>
                      <span>·</span>
                      <span>{formatExpiryTimestamp(action.expiresAt, lng)}</span>
                      {isSnoozed(action) && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[var(--color-surface-3)] text-[var(--color-text-secondary)]">
                          <AlarmClock className="h-2.5 w-2.5" />
                          {t('actions.snoozedBadge', 'Snoozed {{duration}}', { duration: formatSnoozedUntil(action.snoozedUntil!, lng) })}
                        </span>
                      )}
                      {isScheduled(action) && !isSnoozed(action) && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[var(--color-accent-subtle)] text-[var(--color-accent)]">
                          <CalendarClock className="h-2.5 w-2.5" />
                          {t('actions.scheduledBadge', 'Scheduled {{duration}}', { duration: formatSnoozedUntil(action.scheduledFor!, lng) })}
                        </span>
                      )}
                    </div>
                  </div>
                  <ActionStatusBadge status={action.status} />
                </div>
              </button>
            ))}
            {actions.length === 0 && (
              <div className="px-5 py-12 text-center text-sm text-[var(--color-text-muted)]">{t('actions.empty', 'No Actions Found.')}</div>
            )}
          </div>
          {actionsCursor && (
            <div className="px-5 py-3 border-t border-[var(--color-border)]">
              <LoadMoreButton onLoadMore={onLoadMore} loading={busy} />
            </div>
          )}
        </Card>

        <div className="space-y-4">
          {selectedAction ? (
            <>
              <Card className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-[var(--color-text-primary)]">{selectedAction.title}</h2>
                    <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">{selectedAction.description}</p>
                  </div>
                  <ActionStatusBadge status={selectedAction.status} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Metric label={t('actions.type', 'Type')} value={t(`actionTypes.${selectedAction.actionType}`, selectedAction.actionType)} />
                  <Metric label={t('actions.risk', 'Risk')} value={selectedAction.riskLevel} />
                  <Metric label={t('actions.expires', 'Expires')} value={formatExpiryTimestamp(selectedAction.expiresAt, lng)} />
                  <Metric label={t('actions.executed', 'Executed')} value={formatTimestamp(selectedAction.executedAt, lng)} />
                  {selectedAction.snoozedUntil && selectedAction.snoozedUntil > now && (
                    <Metric label={t('actions.snoozedUntil', 'Snoozed Until')} value={new Date(selectedAction.snoozedUntil * 1000).toLocaleString(lng)} />
                  )}
                  {selectedAction.scheduledFor && selectedAction.scheduledFor > now && (
                    <Metric label={t('actions.scheduledFor', 'Scheduled For')} value={new Date(selectedAction.scheduledFor * 1000).toLocaleString(lng)} />
                  )}
                </div>
                <ActionPayloadDetails action={selectedAction} />
                {selectedAction.result && (
                  <div className="rounded-xl bg-[var(--color-surface-base)] border border-[var(--color-border)] p-3.5">
                    <div className="font-medium text-[var(--color-text-primary)] text-sm mb-1">{t('actions.result', 'Result')}</div>
                    <div className="text-sm text-[var(--color-text-secondary)]">{selectedAction.result.summary}</div>
                    {(selectedAction.result.providerUrl || selectedAction.result.externalUrl) && (
                      <a
                        className="inline-block mt-2 text-sm text-[var(--color-accent)] hover:underline"
                        href={selectedAction.result.providerUrl || selectedAction.result.externalUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t('actions.openResult', 'Open Result →')}
                      </a>
                    )}
                  </div>
                )}
                {selectedAction.errorMessage && (
                  <div className="text-sm text-[var(--color-error-text)]">{selectedAction.errorMessage}</div>
                )}

                {selectedAction.status === 'pending' && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={busy}
                      onClick={() => onExecuteAction(selectedAction.actionId)}
                    >
                      {t('actions.execute', 'Execute From UI')}
                    </Button>

                    <SnoozeDropdown
                      disabled={busy}
                      onSnooze={(iso) => onSnoozeAction(selectedAction.actionId, iso)}
                    />

                    {isSnoozed(selectedAction) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => onSnoozeAction(selectedAction.actionId, null)}
                        title={t('actions.cancelSnooze', 'Cancel Snooze')}
                      >
                        <X className="h-3.5 w-3.5" />
                        {t('actions.cancelSnooze', 'Cancel Snooze')}
                      </Button>
                    )}
                  </div>
                )}

                {selectedAction.status === 'pending' && AUTO_EXECUTABLE_TYPES.has(selectedAction.actionType) && (
                  <div className="rounded-xl bg-[var(--color-surface-base)] border border-[var(--color-border)] p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <CalendarClock className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
                        <span className="text-sm font-medium text-[var(--color-text-primary)]">{t('actions.autoExecuteAt', 'Auto-Execute At')}</span>
                      </div>
                      {isScheduled(selectedAction) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => onScheduleAction(selectedAction.actionId, null)}
                        >
                          <X className="h-3.5 w-3.5" />
                          {t('common.cancel', 'Cancel')}
                        </Button>
                      )}
                    </div>
                    {isScheduled(selectedAction) ? (
                      <p className="text-sm text-[var(--color-text-secondary)]">
                        {t('actions.scheduledHint', 'Scheduled for {{date}}', { date: new Date(selectedAction.scheduledFor! * 1000).toLocaleString(lng) })}
                      </p>
                    ) : (
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {t('actions.autoExecuteHint', 'Pick a date and time for the system to execute this action automatically.')}
                      </p>
                    )}
                    <div className="flex gap-2 items-center flex-wrap">
                      <input
                        type="datetime-local"
                        className="rounded-lg bg-[var(--color-surface-3)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-xs px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                        value={scheduleCustomValue}
                        min={minScheduleDatetime}
                        onChange={(e) => setScheduleCustomValue(e.target.value)}
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy || !scheduleCustomValue}
                        onClick={() => {
                          if (!scheduleCustomValue) {
                          	return;
                          }

                          onScheduleAction(selectedAction.actionId, localDatetimeToISO(scheduleCustomValue));
                          setScheduleCustomValue('');
                        }}
                      >
                        {t('actions.schedule', 'Schedule')}
                      </Button>
                    </div>
                  </div>
                )}
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t('actions.executionAudit', 'Execution Audit')}</CardTitle>
                  <Button variant="ghost" size="sm" onClick={handleRefreshExecutions}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    {t('common.refresh', 'Refresh')}
                  </Button>
                </CardHeader>
                <div className="space-y-2.5">
                  {executions.map((execution) => (
                    <div key={execution.executionId} className="rounded-xl bg-[var(--color-surface-base)] border border-[var(--color-border)] p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-[var(--color-text-primary)]">{t('actions.attempt', 'Attempt {{n}}', { n: execution.attempt })}</span>
                        <ActionStatusBadge status={execution.status} />
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)] mt-1">
                        {execution.triggeredBy === 'auto_execute' || execution.triggeredBy === 'scheduled' ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-[var(--color-accent-subtle)] text-[var(--color-accent)]">
                            {execution.triggeredBy === 'scheduled' ? t('actions.scheduledLabel', 'Scheduled') : t('actions.autoLabel', 'Auto')}
                          </span>
                        ) : (
                          <span>{execution.triggeredBy}</span>
                        )}
                        <span>·</span>
                        <span>{formatTimestamp(execution.createdAt, lng)}</span>
                      </div>
                      {execution.providerOperationId && (
                        <div className="text-xs text-[var(--color-text-muted)] mt-1">{t('actions.providerIdLabel', 'Provider ID: {{id}}', { id: execution.providerOperationId })}</div>
                      )}
                      {execution.errorMessage && (
                        <div className="text-xs text-[var(--color-error-text)] mt-1">{execution.errorMessage}</div>
                      )}
                    </div>
                  ))}
                  {executions.length === 0 && (
                    <div className="text-sm text-[var(--color-text-muted)]">{t('actions.noExecutions', 'No Execution Attempts Recorded.')}</div>
                  )}
                </div>
              </Card>
            </>
          ) : (
            <Card className="text-center text-[var(--color-text-muted)] text-sm py-16">
              {t('actions.selectAction', 'Select An Action To View Details.')}
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}
