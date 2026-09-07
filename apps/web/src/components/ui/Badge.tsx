import { cva, type VariantProps } from 'class-variance-authority';
import { useTranslation } from 'react-i18next';
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
    case 'accepted': {
      return 'success';
    }
    case 'error':
    case 'failed':
    case 'expired': {
      return 'error';
    }
    case 'draft':
    case 'pending':
    case 'cancelled': {
      return 'warning';
    }
    case 'executing': {
      return 'info';
    }
    default: {
      return 'neutral';
    }
  }
}

function useStatusLabel(status: string): string {
  const { t } = useTranslation();
  return t(`status.${status}`, status.charAt(0).toUpperCase() + status.slice(1));
}

export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  const label = useStatusLabel(status);
  return <Badge variant={variantFor(status)}>{label}</Badge>;
}

export function WatchBadge({ status }: { status: WatchStatus }) {
  const label = useStatusLabel(status);
  return <Badge variant={variantFor(status)}>{label}</Badge>;
}

export function ContextIndexBadge({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  return <Badge variant={enabled ? 'success' : 'neutral'}>{enabled ? t('badges.indexed', 'Indexed') : t('badges.notIndexed', 'Not Indexed')}</Badge>;
}

export function DocStatusBadge({ status }: { status: ContextDocStatus }) {
  const label = useStatusLabel(status);
  return <Badge variant={variantFor(status)}>{label}</Badge>;
}

export function DeletionStatusBadge({ status }: { status: DeletionStatus }) {
  const label = useStatusLabel(status);
  return <Badge variant={variantFor(status)}>{label}</Badge>;
}

export function ActionStatusBadge({ status }: { status: ActionStatus }) {
  const label = useStatusLabel(status);
  return <Badge variant={variantFor(status)}>{label}</Badge>;
}

type TaskRunStatus = 'running' | 'success' | 'partial_success' | 'error' | 'skipped';
type ProcessedMessageStatus = 'processing' | 'summarized' | 'skipped' | 'error';

function taskRunVariant(status: TaskRunStatus): BadgeVariant {
  switch (status) {
    case 'success': { return 'success';
    }
    case 'partial_success': { return 'warning';
    }
    case 'error': { return 'error';
    }
    case 'running': { return 'info';
    }
    case 'skipped': { return 'neutral';
    }
    default: { return 'neutral';
    }
  }
}

function useTaskRunLabel(status: TaskRunStatus): string {
  const { t } = useTranslation();
  if (status === 'partial_success') return t('badges.partial', 'Partial');
  return t(`status.${status}`, status.charAt(0).toUpperCase() + status.slice(1));
}

function processedMsgVariant(status: ProcessedMessageStatus): BadgeVariant {
  switch (status) {
    case 'summarized': { return 'success';
    }
    case 'error': { return 'error';
    }
    case 'processing': { return 'info';
    }
    case 'skipped': { return 'neutral';
    }
    default: { return 'neutral';
    }
  }
}

export function TaskRunStatusBadge({ status }: { status: TaskRunStatus }) {
  const label = useTaskRunLabel(status);
  return <Badge variant={taskRunVariant(status)}>{label}</Badge>;
}

export function ProcessedMessageStatusBadge({ status }: { status: ProcessedMessageStatus }) {
  const label = useStatusLabel(status);
  return <Badge variant={processedMsgVariant(status)}>{label}</Badge>;
}

type DeliveryStatus = 'success' | 'failure';

export function DeliveryStatusBadge({ status }: { status: DeliveryStatus }) {
  const { t } = useTranslation();
  return <Badge variant={status === 'success' ? 'success' : 'error'}>{status === 'success' ? t('badges.success', 'Success') : t('badges.failed', 'Failed')}</Badge>;
}

export function IntegrationHealthBadge({
  status,
  consecutiveFailures,
}: {
  status: 'success' | 'failure' | null;
  consecutiveFailures: number;
}) {
  const { t } = useTranslation();
  if (status === 'success') return <Badge variant="success">{t('badges.ok', 'Ok')}</Badge>;
  if (status === 'failure') return <Badge variant="error">{t('badges.failedWithCount', 'Failed ({{count}})', { count: consecutiveFailures })}</Badge>;
  return <Badge variant="neutral">{t('badges.neverSent', 'Never Sent')}</Badge>;
}
