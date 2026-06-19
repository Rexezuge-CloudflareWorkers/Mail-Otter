import { cn } from '../../lib/utils';

export function Metric({ label, value, tone = 'muted', subtitle }: { label: string; value: string; tone?: 'muted' | 'error'; subtitle?: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 min-w-0">
      <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">{label}</div>
      <div className={cn('mt-1.5 text-sm break-words', tone === 'error' ? 'text-[var(--color-error-text)]' : 'text-[var(--color-text-primary)]')}>
        {value}
      </div>
      {subtitle && <div className="mt-0.5 text-xs text-[var(--color-text-muted)]">{subtitle}</div>}
    </div>
  );
}
