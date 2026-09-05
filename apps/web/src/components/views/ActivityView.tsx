import { Download } from 'lucide-react';
import type { ConnectedApplication } from '../../types';
import type { ActivityEntry, ActivityEventType } from '../../services/activityService';
import { Badge } from '../ui/Badge';
import type { BadgeVariant } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardTitle } from '../ui/Card';
import { FilterBar } from '../shared/FilterBar';
import { LoadMoreButton } from '../shared/LoadMoreButton';
import { MailboxSelect } from '../shared/MailboxSelect';
import { RefreshButton } from '../shared/RefreshButton';
import { appName } from '../../lib/applications';
import { formatTimestamp } from '../../lib/format';

const ACTION_TYPE_LABELS: Record<string, string> = {
  'calendar.add_event': 'Calendar Event',
  'email.draft_reply': 'Email Draft Reply',
  'external.open_link': 'Open Link',
  'manual.todo': 'To-Do',
  'delivery.track_package': 'Package Tracking',
  'travel.track_flight': 'Flight Tracking',
  'finance.pay_bill': 'Bill Payment',
  'appointment.confirm': 'Appointment',
};

function eventDescription(entry: ActivityEntry): string {
  if (entry.eventType === 'email_processed') {
    if (entry.status === 'summarized') return 'Email Summarized';
    if (entry.status === 'skipped') return 'Email Skipped';
    return 'Email Processing Error';
  }
  if (entry.eventType === 'action_created') {
    const label = ACTION_TYPE_LABELS[entry.actionType] ?? entry.actionType;
    return `${label} Action Detected`;
  }
  if (entry.executionStatus === 'succeeded') return 'Action Executed';
  if (entry.executionStatus === 'failed') return 'Action Execution Failed';
  if (entry.executionStatus === 'expired') return 'Action Expired';
  return 'Action Executed';
}

function eventBadgeVariant(entry: ActivityEntry): BadgeVariant {
  if (entry.eventType === 'email_processed') {
    if (entry.status === 'summarized') return 'success';
    if (entry.status === 'error') return 'error';
    return 'neutral';
  }
  if (entry.eventType === 'action_created') return 'info';
  if (entry.executionStatus === 'succeeded') return 'success';
  if (entry.executionStatus === 'failed' || entry.executionStatus === 'expired') return 'error';
  return 'neutral';
}

function eventBadgeLabel(entry: ActivityEntry): string {
  if (entry.eventType === 'email_processed') return 'Email';
  if (entry.eventType === 'action_created') return 'Action';
  return 'Execution';
}

function ActivityRow({ entry, applications }: { entry: ActivityEntry; applications: ConnectedApplication[] }) {
  return (
    <div className="flex items-center gap-3 flex-wrap px-4 py-2.5 border-b border-[var(--color-border)] last:border-0">
      <Badge variant={eventBadgeVariant(entry)}>{eventBadgeLabel(entry)}</Badge>
      <span className="text-sm text-[var(--color-text-primary)] flex-1 min-w-0 truncate">
        {eventDescription(entry)}
      </span>
      <span className="text-xs text-[var(--color-text-muted)] shrink-0">
        {appName(entry.applicationId, applications)}
      </span>
      <span className="text-xs text-[var(--color-text-muted)] shrink-0 ml-auto">
        {formatTimestamp(entry.timestamp)}
      </span>
    </div>
  );
}

const EVENT_TYPE_OPTIONS: { value: ActivityEventType; label: string }[] = [
  { value: 'email_processed', label: 'Email Processed' },
  { value: 'action_created', label: 'Action Created' },
  { value: 'action_executed', label: 'Action Executed' },
];

export function ActivityView({
  applications,
  applicationId,
  setApplicationId,
  eventTypes,
  setEventTypes,
  entries,
  cursor,
  loading,
  exporting,
  onRefresh,
  onLoadMore,
  onExportCsv,
}: {
  applications: ConnectedApplication[];
  applicationId: string;
  setApplicationId: (id: string) => void;
  eventTypes: ActivityEventType[];
  setEventTypes: (types: ActivityEventType[]) => void;
  entries: ActivityEntry[];
  cursor?: string;
  loading: boolean;
  exporting: boolean;
  onRefresh: () => void;
  onLoadMore: () => void;
  onExportCsv: () => void;
}) {
  const toggleEventType = (type: ActivityEventType) => {
    if (eventTypes.includes(type)) {
      setEventTypes(eventTypes.filter((t) => t !== type));
    } else {
      setEventTypes([...eventTypes, type]);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col gap-6">
      <FilterBar>
        <MailboxSelect value={applicationId} onChange={setApplicationId} applications={applications} />

        <div className="flex items-center gap-3">
          {EVENT_TYPE_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer text-sm text-[var(--color-text-secondary)]">
              <input
                type="checkbox"
                checked={eventTypes.includes(opt.value)}
                onChange={() => toggleEventType(opt.value)}
                className="accent-[var(--color-accent)]"
              />
              {opt.label}
            </label>
          ))}
        </div>

        <Button variant="secondary" size="sm" onClick={onExportCsv} loading={exporting}>
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </Button>

        <RefreshButton onRefresh={onRefresh} loading={loading} className="ml-auto" />
      </FilterBar>

      <Card>
        <CardHeader>
          <CardTitle>Activity Feed</CardTitle>
        </CardHeader>
        {loading && entries.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-[var(--color-text-muted)] text-sm">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-[var(--color-text-muted)] text-sm">No Activity Found</div>
        ) : (
          <>
            {entries.map((entry, i) => (
              <ActivityRow key={`${entry.eventType}-${entry.timestamp}-${i}`} entry={entry} applications={applications} />
            ))}
            {cursor && (
              <LoadMoreButton onLoadMore={onLoadMore} loading={loading} />
            )}
          </>
        )}
      </Card>
    </div>
  );
}
