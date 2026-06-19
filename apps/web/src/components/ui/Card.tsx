import { cn } from '../../lib/utils';

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-5', className)}>
      {children}
    </div>
  );
}

export function CardHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('flex items-center justify-between mb-4', className)}>{children}</div>;
}

export function CardTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return <h2 className={cn('text-lg font-semibold text-[var(--color-text-primary)]', className)}>{children}</h2>;
}
