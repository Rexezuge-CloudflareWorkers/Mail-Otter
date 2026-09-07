import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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

function ActivityRow({ entry, applications }: { entry: ActivityEntry; applications: ConnectedApplication[] }) {
  const { t, i18n } = useTranslation();
  const badgeLabel =
    entry.eventType === 'email_processed'
      ? t('activity.email', 'Email')
      : entry.eventType === 'action_created'
        ? t('activity.action', 'Action')
        : t('activity.execution', 'Execution');
  let description: string;
  switch (entry.eventType) {
    case 'email_processed': {
      switch (entry.status) {
        case 'summarized': { description = t('activity.emailSummarized', 'Email Summarized'); break; }
        case 'skipped': { description = t('activity.emailSkipped', 'Email Skipped'); break; }
        default: { description = t('activity.emailError', 'Email Processing Error'); break; }
      }
      break;
    }
    case 'action_created': {
      const label = t(`actionTypes.${entry.actionType}`, entry.actionType);
      description = t('activity.actionDetected', '{{label}} Action Detected', { label });
      break;
    }
    default: {
      switch (entry.executionStatus) {
        case 'succeeded': { description = t('activity.actionExecuted', 'Action Executed'); break; }
        case 'failed': { description = t('activity.actionFailed', 'Action Execution Failed'); break; }
        case 'expired': { description = t('activity.actionExpired', 'Action Expired'); break; }
        default: { description = t('activity.actionExecuted', 'Action Executed'); break; }
      }
      break;
    }
  }
  return (
    <div className="flex items-center gap-3 flex-wrap px-4 py-2.5 border-b border-[var(--color-border)] last:border-0">
      <Badge variant={eventBadgeVariant(entry)}>{badgeLabel}</Badge>
      <span className="text-sm text-[var(--color-text-primary)] flex-1 min-w-0 truncate">
        {description}
      </span>
      <span className="text-xs text-[var(--color-text-muted)] shrink-0">
        {appName(entry.applicationId, applications)}
      </span>
      <span className="text-xs text-[var(--color-text-muted)] shrink-0 ml-auto">
        {formatTimestamp(entry.timestamp, i18n.resolvedLanguage)}
      </span>
    </div>
  );
}

const EVENT_TYPE_VALUES: ActivityEventType[] = ['email_processed', 'action_created', 'action_executed'];

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
  const { t } = useTranslation();
  const toggleEventType = (type: ActivityEventType) => {
    if (eventTypes.includes(type)) {
      setEventTypes(eventTypes.filter((x) => x !== type));
    } else {
      setEventTypes([...eventTypes, type]);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col gap-6">
      <FilterBar>
        <MailboxSelect value={applicationId} onChange={setApplicationId} applications={applications} />

        <div className="flex items-center gap-3">
          {EVENT_TYPE_VALUES.map((value) => (
            <label key={value} className="flex items-center gap-1.5 cursor-pointer text-sm text-[var(--color-text-secondary)]">
              <input
                type="checkbox"
                checked={eventTypes.includes(value)}
                onChange={() => toggleEventType(value)}
                className="accent-[var(--color-accent)]"
              />
              {t(`activity.filters.${value}`, value)}
            </label>
          ))}
        </div>

        <Button variant="secondary" size="sm" onClick={onExportCsv} loading={exporting}>
          <Download className="h-3.5 w-3.5" />
          {t('activity.exportCsv', 'Export CSV')}
        </Button>

        <RefreshButton onRefresh={onRefresh} loading={loading} className="ml-auto" />
      </FilterBar>

      <Card>
        <CardHeader>
          <CardTitle>{t('activity.title', 'Activity Feed')}</CardTitle>
        </CardHeader>
        {loading && entries.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-[var(--color-text-muted)] text-sm">{t('activity.loading', 'Loading…')}</div>
        ) : entries.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-[var(--color-text-muted)] text-sm">{t('activity.empty', 'No Activity Found')}</div>
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
