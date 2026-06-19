import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium shrink-0',
  {
    variants: {
      variant: {
        success: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]',
        error:   'bg-[var(--color-error-bg)] text-[var(--color-error-text)]',
        warning: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]',
        info:    'bg-[var(--color-info-bg)] text-[var(--color-info-text)]',
        neutral: 'bg-[var(--color-neutral-bg)] text-[var(--color-neutral-text)]',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

export function Badge({ className, variant, children }: { className?: string; children: React.ReactNode } & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)}>{children}</span>;
}

type ConnectionStatus = 'draft' | 'connected' | 'error';
type WatchStatus = 'active' | 'stopped' | 'error';
type ContextDocStatus = 'active' | 'deleted' | 'error';
type DeletionStatus = 'accepted' | 'error';
type ActionStatus = 'pending' | 'executing' | 'succeeded' | 'failed' | 'expired' | 'cancelled';

function variantFor(status: string): BadgeVariant {
  switch (status) {
    case 'connected':
    case 'active':
    case 'succeeded':
    case 'accepted':
      return 'success';
    case 'error':
    case 'failed':
    case 'expired':
      return 'error';
    case 'draft':
    case 'pending':
    case 'cancelled':
      return 'warning';
    case 'executing':
      return 'info';
    default:
      return 'neutral';
  }
}

function label(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  return <Badge variant={variantFor(status)}>{label(status)}</Badge>;
}

export function WatchBadge({ status }: { status: WatchStatus }) {
  return <Badge variant={variantFor(status)}>{label(status)}</Badge>;
}

export function ContextIndexBadge({ enabled }: { enabled: boolean }) {
  return <Badge variant={enabled ? 'success' : 'neutral'}>{enabled ? 'Indexed' : 'Not Indexed'}</Badge>;
}

export function DocStatusBadge({ status }: { status: ContextDocStatus }) {
  return <Badge variant={variantFor(status)}>{label(status)}</Badge>;
}

export function DeletionStatusBadge({ status }: { status: DeletionStatus }) {
  return <Badge variant={variantFor(status)}>{label(status)}</Badge>;
}

export function ActionStatusBadge({ status }: { status: ActionStatus }) {
  return <Badge variant={variantFor(status)}>{label(status)}</Badge>;
}
