import { cn } from '../../lib/utils';
import { X } from 'lucide-react';

export function Metric({
  label,
  value,
  tone = 'muted',
  subtitle,
  onDismiss,
}: {
  label: string;
  value: string;
  tone?: 'muted' | 'error';
  subtitle?: string;
  onDismiss?: () => void;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 min-w-0 relative">
      <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">{label}</div>
      <div className={cn('mt-1.5 text-sm break-words', tone === 'error' ? 'text-[var(--color-error-text)]' : 'text-[var(--color-text-primary)]')}>
        {value}
      </div>
      {subtitle && <div className="mt-0.5 text-xs text-[var(--color-text-muted)]">{subtitle}</div>}
      {onDismiss && tone === 'error' && (
        <button
          onClick={onDismiss}
          title="Dismiss Error"
          className="absolute top-1 right-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] leading-none text-xs flex items-center gap-0.5 whitespace-nowrap"
        >
          Dismiss <X className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}
