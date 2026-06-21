import type { ReactNode } from 'react';
import { Card } from '../ui/Card';

export function FilterBar({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 py-4">
      {title && <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">{title}</h1>}
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </Card>
  );
}
