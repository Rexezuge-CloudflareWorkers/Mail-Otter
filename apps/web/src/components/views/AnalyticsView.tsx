import { RefreshCw } from 'lucide-react';
import type { ConnectedApplication } from '../../../components/types';
import type { AnalyticsData } from '../../types';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardTitle } from '../ui/Card';
import { Select } from '../ui/Input';
import { Metric } from '../shared/Metric';
import { FilterBar } from '../shared/FilterBar';
import { LineChart } from '../analytics/LineChart';
import { StackedBarChart } from '../analytics/StackedBarChart';
import { HorizontalBarList } from '../analytics/HorizontalBarList';
import { cn } from '../../lib/utils';

type DayOption = { value: 7 | 30 | 90; label: string };
const DAY_OPTIONS: Array<DayOption> = [
  { value: 7, label: '7 Days' },
  { value: 30, label: '30 Days' },
  { value: 90, label: '90 Days' },
];

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
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">Analytics</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Usage Trends And Processing Stats</p>
        </div>
        <Button variant="secondary" size="sm" onClick={onRefresh} loading={loading}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
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
        <Select value={applicationId} onChange={(e) => setApplicationId(e.target.value)}>
          <option value="">All Mailboxes</option>
          {applications.map((app) => (
            <option key={app.applicationId} value={app.applicationId}>
              {app.displayName}
            </option>
          ))}
        </Select>
      </FilterBar>

      {!loading && !data && (
        <Card className="py-16 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">Hit Refresh To Load Analytics.</p>
        </Card>
      )}

      {(loading || data) && (
        <div className={cn('space-y-5', loading && !data && 'animate-pulse')}>
          <Card>
            <CardHeader>
              <CardTitle>AI Usage</CardTitle>
              <span className="text-xs text-[var(--color-text-muted)]">Global usage across all accounts</span>
            </CardHeader>
            <LineChart
              points={data?.aiUsage.daily.map((d) => ({ date: d.date, value: d.estimatedNeurons })) ?? []}
              label="AI neuron usage over time"
            />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Metric
                label="Total Neurons"
                value={data ? data.aiUsage.total.estimatedNeurons.toLocaleString() : '—'}
              />
              <Metric
                label="Total Requests"
                value={data ? data.aiUsage.total.requestCount.toLocaleString() : '—'}
              />
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Email Processing</CardTitle>
            </CardHeader>
            <StackedBarChart days={data?.processing.daily ?? []} />
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--color-text-muted)]">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-sm bg-[var(--color-accent)]" />
                Summarized
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-sm bg-[var(--color-text-muted)] opacity-50" />
                Skipped
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-sm bg-red-500" />
                Error
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Metric label="Summarized" value={data ? data.processing.total.summarized.toLocaleString() : '—'} />
              <Metric label="Skipped" value={data ? data.processing.total.skipped.toLocaleString() : '—'} />
              <Metric label="Errors" value={data ? data.processing.total.error.toLocaleString() : '—'} tone={data && data.processing.total.error > 0 ? 'error' : 'muted'} />
              <Metric
                label="Success Rate"
                value={data ? `${Math.round(data.processing.total.successRate * 100)}%` : '—'}
              />
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <p className="mb-3 text-sm font-medium text-[var(--color-text-secondary)]">By Status</p>
                <HorizontalBarList items={statusItems} />
              </div>
              <div>
                <p className="mb-3 text-sm font-medium text-[var(--color-text-secondary)]">By Type</p>
                <HorizontalBarList items={typeItems} />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Context Index</CardTitle>
            </CardHeader>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Metric label="Active Documents" value={data ? data.context.active.toLocaleString() : '—'} />
              <Metric label="Deleted Documents" value={data ? data.context.deleted.toLocaleString() : '—'} />
              <Metric label="Error Documents" value={data ? data.context.error.toLocaleString() : '—'} tone={data && data.context.error > 0 ? 'error' : 'muted'} />
              <Metric
                label="Chars Indexed"
                value={data ? data.context.totalCharsIndexed.toLocaleString() : '—'}
              />
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}
