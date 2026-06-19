import { cn } from '../../lib/utils';

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full px-3 py-2 rounded-lg bg-[var(--color-surface-base)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] transition-colors duration-150 focus:outline-none focus:border-[var(--color-accent)] disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'px-3 py-2 rounded-lg bg-[var(--color-surface-base)] border border-[var(--color-border)] text-[var(--color-text-primary)] transition-colors duration-150 focus:outline-none focus:border-[var(--color-accent)] disabled:opacity-60',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ className, children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn('block text-sm text-[var(--color-text-secondary)]', className)} {...props}>
      {children}
    </label>
  );
}
