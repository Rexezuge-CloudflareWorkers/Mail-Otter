import { useState, useRef, useEffect } from 'react';
import { RefreshCw, AlarmClock, CalendarClock, X } from 'lucide-react';
import type { ConnectedApplication, EmailAction, EmailActionExecution, EmailActionStatus } from '../../../components/types';
import { formatTimestamp, formatExpiryTimestamp } from '../../../components/utils';
import { ActionStatusBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardTitle } from '../ui/Card';
import { Select, Label } from '../ui/Input';
import { Metric } from '../shared/Metric';
import { FilterBar } from '../shared/FilterBar';
import { ActionPayloadDetails } from '../actions/ActionPayloadDetails';
import { cn } from '../../lib/utils';

const AUTO_EXECUTABLE_TYPES = new Set(['calendar.add_event', 'email.draft_reply']);

const SNOOZE_PRESETS: { label: string; getValue: () => string }[] = [
  { label: '1 Hour', getValue: () => new Date(Date.now() + 60 * 60 * 1000).toISOString() },
  {
    label: 'End Of Day',
    getValue: () => {
      const d = new Date();
      d.setHours(18, 0, 0, 0);
      if (d <= new Date()) d.setDate(d.getDate() + 1);
      return d.toISOString();
    },
  },
  {
    label: 'Tomorrow',
    getValue: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d.toISOString();
    },
  },
  { label: '3 Days', getValue: () => new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() },
  { label: '1 Week', getValue: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() },
];

function formatSnoozedUntil(ts: number): string {
  const date = new Date(ts * 1000);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString();
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
        title="Snooze Action"
      >
        <AlarmClock className="h-3.5 w-3.5" />
        Snooze
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl shadow-xl w-48 py-1.5">
          {SNOOZE_PRESETS.map((preset) => (
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
              Set Custom
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
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">Actions</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
            Review AI-Proposed Actions, Execution Results, Audit Trail, And Expiry.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onRefresh} loading={busy}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <FilterBar>
        <div className="flex flex-col gap-1.5">
          <Label>Mailbox</Label>
          <Select value={applicationId} onChange={(e) => setApplicationId(e.target.value)} className="min-w-[180px]">
            <option value="">All Mailboxes</option>
            {applications.map((app) => (
              <option key={app.applicationId} value={app.applicationId}>{app.displayName}</option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Status</Label>
          <Select value={status} onChange={(e) => setStatus(e.target.value as EmailActionStatus | '')} className="min-w-[140px]">
            <option value="">All Statuses</option>
            {(['pending', 'executing', 'succeeded', 'failed', 'expired', 'cancelled'] as EmailActionStatus[]).map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Snoozed</Label>
          <Button
            variant={showSnoozed ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setShowSnoozed(!showSnoozed)}
            className="self-start"
          >
            <AlarmClock className="h-3.5 w-3.5" />
            {showSnoozed ? 'Hiding Snoozed' : 'Show Snoozed'}
          </Button>
        </div>
      </FilterBar>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-5">
        <Card className="p-0 overflow-hidden">
          <CardHeader className="px-5 pt-5 pb-4 border-b border-[var(--color-border)] mb-0">
            <CardTitle>Action Items</CardTitle>
            <span className="text-sm text-[var(--color-text-muted)]">{actions.length} Loaded</span>
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
                      <span>{action.actionType}</span>
                      <span>·</span>
                      <span>{formatExpiryTimestamp(action.expiresAt)}</span>
                      {isSnoozed(action) && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[var(--color-surface-3)] text-[var(--color-text-secondary)]">
                          <AlarmClock className="h-2.5 w-2.5" />
                          Snoozed {formatSnoozedUntil(action.snoozedUntil!)}
                        </span>
                      )}
                      {isScheduled(action) && !isSnoozed(action) && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[var(--color-accent-subtle)] text-[var(--color-accent)]">
                          <CalendarClock className="h-2.5 w-2.5" />
                          Scheduled {formatSnoozedUntil(action.scheduledFor!)}
                        </span>
                      )}
                    </div>
                  </div>
                  <ActionStatusBadge status={action.status} />
                </div>
              </button>
            ))}
            {actions.length === 0 && (
              <div className="px-5 py-12 text-center text-sm text-[var(--color-text-muted)]">No Actions Found.</div>
            )}
          </div>
          {actionsCursor && (
            <div className="px-5 py-3 border-t border-[var(--color-border)]">
              <Button variant="secondary" size="sm" onClick={onLoadMore} disabled={busy}>Load More</Button>
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
                  <Metric label="Type" value={selectedAction.actionType} />
                  <Metric label="Risk" value={selectedAction.riskLevel} />
                  <Metric label="Expires" value={formatExpiryTimestamp(selectedAction.expiresAt)} />
                  <Metric label="Executed" value={formatTimestamp(selectedAction.executedAt)} />
                  {selectedAction.snoozedUntil && selectedAction.snoozedUntil > now && (
                    <Metric label="Snoozed Until" value={new Date(selectedAction.snoozedUntil * 1000).toLocaleString()} />
                  )}
                  {selectedAction.scheduledFor && selectedAction.scheduledFor > now && (
                    <Metric label="Scheduled For" value={new Date(selectedAction.scheduledFor * 1000).toLocaleString()} />
                  )}
                </div>
                <ActionPayloadDetails action={selectedAction} />
                {selectedAction.result && (
                  <div className="rounded-xl bg-[var(--color-surface-base)] border border-[var(--color-border)] p-3.5">
                    <div className="font-medium text-[var(--color-text-primary)] text-sm mb-1">Result</div>
                    <div className="text-sm text-[var(--color-text-secondary)]">{selectedAction.result.summary}</div>
                    {(selectedAction.result.providerUrl || selectedAction.result.externalUrl) && (
                      <a
                        className="inline-block mt-2 text-sm text-[var(--color-accent)] hover:underline"
                        href={selectedAction.result.providerUrl || selectedAction.result.externalUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open Result →
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
                      Execute From UI
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
                        title="Cancel Snooze"
                      >
                        <X className="h-3.5 w-3.5" />
                        Cancel Snooze
                      </Button>
                    )}
                  </div>
                )}

                {selectedAction.status === 'pending' && AUTO_EXECUTABLE_TYPES.has(selectedAction.actionType) && (
                  <div className="rounded-xl bg-[var(--color-surface-base)] border border-[var(--color-border)] p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <CalendarClock className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
                        <span className="text-sm font-medium text-[var(--color-text-primary)]">Auto-Execute At</span>
                      </div>
                      {isScheduled(selectedAction) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => onScheduleAction(selectedAction.actionId, null)}
                        >
                          <X className="h-3.5 w-3.5" />
                          Cancel
                        </Button>
                      )}
                    </div>
                    {isScheduled(selectedAction) ? (
                      <p className="text-sm text-[var(--color-text-secondary)]">
                        Scheduled for {new Date(selectedAction.scheduledFor! * 1000).toLocaleString()}.
                      </p>
                    ) : (
                      <p className="text-xs text-[var(--color-text-muted)]">
                        Pick a date and time for the system to execute this action automatically.
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
                        Schedule
                      </Button>
                    </div>
                  </div>
                )}
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Execution Audit</CardTitle>
                  <Button variant="ghost" size="sm" onClick={handleRefreshExecutions}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    Refresh
                  </Button>
                </CardHeader>
                <div className="space-y-2.5">
                  {executions.map((execution) => (
                    <div key={execution.executionId} className="rounded-xl bg-[var(--color-surface-base)] border border-[var(--color-border)] p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-[var(--color-text-primary)]">Attempt {execution.attempt}</span>
                        <ActionStatusBadge status={execution.status} />
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)] mt-1">
                        {execution.triggeredBy === 'auto_execute' || execution.triggeredBy === 'scheduled' ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-[var(--color-accent-subtle)] text-[var(--color-accent)]">
                            {execution.triggeredBy === 'scheduled' ? 'Scheduled' : 'Auto'}
                          </span>
                        ) : (
                          <span>{execution.triggeredBy}</span>
                        )}
                        <span>·</span>
                        <span>{formatTimestamp(execution.createdAt)}</span>
                      </div>
                      {execution.providerOperationId && (
                        <div className="text-xs text-[var(--color-text-muted)] mt-1">Provider ID: {execution.providerOperationId}</div>
                      )}
                      {execution.errorMessage && (
                        <div className="text-xs text-[var(--color-error-text)] mt-1">{execution.errorMessage}</div>
                      )}
                    </div>
                  ))}
                  {executions.length === 0 && (
                    <div className="text-sm text-[var(--color-text-muted)]">No Execution Attempts Recorded.</div>
                  )}
                </div>
              </Card>
            </>
          ) : (
            <Card className="text-center text-[var(--color-text-muted)] text-sm py-16">
              Select An Action To View Details.
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}
