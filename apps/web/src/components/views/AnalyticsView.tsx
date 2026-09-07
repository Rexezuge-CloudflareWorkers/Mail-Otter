import { useTranslation } from 'react-i18next';
import type { ConnectedApplication } from '../../types';
import type { AnalyticsData } from '../../types';
import { Card, CardHeader, CardTitle } from '../ui/Card';
import { Metric } from '../shared/Metric';
import { FilterBar } from '../shared/FilterBar';
import { MailboxSelect } from '../shared/MailboxSelect';
import { RefreshButton } from '../shared/RefreshButton';
import { LineChart } from '../analytics/LineChart';
import { StackedBarChart } from '../analytics/StackedBarChart';
import { HorizontalBarList } from '../analytics/HorizontalBarList';
import { cn } from '../../lib/utils';

type DayOption = { value: 7 | 30 | 90; label: string };

export function AnalyticsView({
  applications,
  days,
  setDays,
  applicationId,
  setApplicationId,
  data,
  loading,
  onRefresh,
}: {
  applications: ConnectedApplication[];
  days: 7 | 30 | 90;
  setDays: (d: 7 | 30 | 90) => void;
  applicationId: string;
  setApplicationId: (id: string) => void;
  data: AnalyticsData | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lng = i18n.resolvedLanguage;
  const DAY_OPTIONS: Array<DayOption> = [
    { value: 7, label: t('analytics.days7', '7 Days') },
    { value: 30, label: t('analytics.days30', '30 Days') },
    { value: 90, label: t('analytics.days90', '90 Days') },
  ];
  const statusItems = data
    ? Object.entries(data.actions.byStatus).map(([label, value]) => ({ label, value }))
    : [];
  const typeItems = data
    ? Object.entries(data.actions.byType).map(([label, value]) => ({ label, value }))
    : [];

  return (
    <main className="max-w-7xl mx-auto px-6 py-8 space-y-5 animate-fade-in-up">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">{t('analytics.title', 'Analytics')}</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{t('analytics.subtitle', 'Usage Trends And Processing Stats')}</p>
        </div>
        <RefreshButton onRefresh={onRefresh} loading={loading} />
      </div>

      <FilterBar>
        <div className="flex items-center gap-1 rounded-lg bg-[var(--color-surface-2)] p-1">
          {DAY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={cn(
                'px-3 py-1 rounded-md text-sm transition-colors duration-150',
                days === opt.value
                  ? 'bg-[var(--color-surface-4)] text-[var(--color-text-primary)] font-medium'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <MailboxSelect value={applicationId} onChange={setApplicationId} applications={applications} />
      </FilterBar>

      {!loading && !data && (
        <Card className="py-16 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">{t('analytics.loadPrompt', 'Hit Refresh To Load Analytics.')}</p>
        </Card>
      )}

      {(loading || data) && (
        <div className={cn('space-y-5', loading && !data && 'animate-pulse')}>
          <Card>
            <CardHeader>
              <CardTitle>{t('analytics.aiUsage', 'AI Usage')}</CardTitle>
              <span className="text-xs text-[var(--color-text-muted)]">{t('analytics.aiUsageSubtitle', 'Global usage across all accounts')}</span>
            </CardHeader>
            <LineChart
              points={data?.aiUsage.daily.map((d) => ({ date: d.date, value: d.estimatedNeurons })) ?? []}
              label={t('analytics.aiUsageLabel', 'AI neuron usage over time')}
            />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Metric
                label={t('analytics.totalNeurons', 'Total Neurons')}
                value={data ? data.aiUsage.total.estimatedNeurons.toLocaleString(lng) : '—'}
              />
              <Metric
                label={t('analytics.totalRequests', 'Total Requests')}
                value={data ? data.aiUsage.total.requestCount.toLocaleString(lng) : '—'}
              />
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('analytics.emailProcessing', 'Email Processing')}</CardTitle>
            </CardHeader>
            <StackedBarChart days={data?.processing.daily ?? []} />
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--color-text-muted)]">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-sm bg-[var(--color-accent)]" />
                {t('analytics.summarized', 'Summarized')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-sm bg-[var(--color-text-muted)] opacity-50" />
                {t('analytics.skipped', 'Skipped')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-sm bg-red-500" />
                {t('status.error', 'Error')}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Metric label={t('analytics.summarized', 'Summarized')} value={data ? data.processing.total.summarized.toLocaleString(lng) : '—'} />
              <Metric label={t('analytics.skipped', 'Skipped')} value={data ? data.processing.total.skipped.toLocaleString(lng) : '—'} />
              <Metric label={t('analytics.errors', 'Errors')} value={data ? data.processing.total.error.toLocaleString(lng) : '—'} tone={data && data.processing.total.error > 0 ? 'error' : 'muted'} />
              <Metric
                label={t('analytics.successRate', 'Success Rate')}
                value={data ? `${Math.round(data.processing.total.successRate * 100)}%` : '—'}
              />
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('actions.title', 'Actions')}</CardTitle>
            </CardHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <p className="mb-3 text-sm font-medium text-[var(--color-text-secondary)]">{t('analytics.byStatusLabel', 'By Status')}</p>
                <HorizontalBarList items={statusItems} />
              </div>
              <div>
                <p className="mb-3 text-sm font-medium text-[var(--color-text-secondary)]">{t('analytics.byTypeLabel', 'By Type')}</p>
                <HorizontalBarList items={typeItems} />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('analytics.contextIndex', 'Context Index')}</CardTitle>
            </CardHeader>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Metric label={t('analytics.activeDocuments', 'Active Documents')} value={data ? data.context.active.toLocaleString(lng) : '—'} />
              <Metric label={t('analytics.deletedDocuments', 'Deleted Documents')} value={data ? data.context.deleted.toLocaleString(lng) : '—'} />
              <Metric label={t('analytics.errorDocuments', 'Error Documents')} value={data ? data.context.error.toLocaleString(lng) : '—'} tone={data && data.context.error > 0 ? 'error' : 'muted'} />
              <Metric
                label={t('analytics.charsIndexed', 'Chars Indexed')}
                value={data ? data.context.totalCharsIndexed.toLocaleString(lng) : '—'}
              />
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}
