import { RefreshCw } from 'lucide-react';
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

export function ActionsView({
  applications,
  applicationId,
  setApplicationId,
  status,
  setStatus,
  actions,
  actionsCursor,
  selectedActionId,
  executions,
  onRefresh,
  onLoadMore,
  onSelectAction,
  onExecuteAction,
  busy,
}: {
  applications: ConnectedApplication[];
  applicationId: string;
  setApplicationId: (id: string) => void;
  status: EmailActionStatus | '';
  setStatus: (s: EmailActionStatus | '') => void;
  actions: EmailAction[];
  actionsCursor?: string;
  selectedActionId: string;
  executions: EmailActionExecution[];
  onRefresh: () => void;
  onLoadMore: () => void;
  onSelectAction: (id: string) => void;
  onExecuteAction: (id: string) => void;
  busy: boolean;
}) {
  const selectedAction = actions.find((a) => a.actionId === selectedActionId);

  return (
    <main className="max-w-7xl mx-auto px-6 py-8 space-y-5 animate-fade-in-up">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">Actions</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
            Review AI-Proposed Actions, Execution Results, Audit Trail, And Expiry.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onRefresh} disabled={busy}>
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
                  <div className="min-w-0">
                    <div className="font-medium text-[var(--color-text-primary)] truncate">{action.title}</div>
                    <div className="text-sm text-[var(--color-text-secondary)] mt-0.5 line-clamp-1">{action.description}</div>
                    <div className="text-xs text-[var(--color-text-muted)] mt-1">
                      {action.actionType} · Expires {formatExpiryTimestamp(action.expiresAt)}
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
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busy || selectedAction.status !== 'pending'}
                  onClick={() => onExecuteAction(selectedAction.actionId)}
                >
                  Execute From UI
                </Button>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Execution Audit</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => onSelectAction(selectedAction.actionId)}>
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
                      <div className="text-xs text-[var(--color-text-secondary)] mt-1">
                        {execution.triggeredBy} · {formatTimestamp(execution.createdAt)}
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
