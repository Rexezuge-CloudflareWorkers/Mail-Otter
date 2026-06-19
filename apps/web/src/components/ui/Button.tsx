import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]',
  {
    variants: {
      variant: {
        primary:   'bg-[var(--color-accent)] text-[#0d1008] hover:bg-[var(--color-accent-dim)]',
        secondary: 'bg-[var(--color-surface-3)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-4)]',
        ghost:     'bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-primary)]',
        danger:    'bg-[var(--color-error-bg)] text-[var(--color-error-text)] hover:brightness-125',
      },
      size: {
        sm: 'px-3 py-1.5 text-xs',
        md: 'px-4 py-2',
        lg: 'px-5 py-2.5 text-base',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export function Button({ className, variant, size, loading, children, disabled, ...props }: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}
