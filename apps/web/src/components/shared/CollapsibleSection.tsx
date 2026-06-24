import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

export function CollapsibleSection({
  title,
  children,
  defaultExpanded = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[var(--color-surface-2)] transition-colors duration-150"
      >
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">{title}</h2>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-[var(--color-text-muted)] transition-transform duration-200',
            isExpanded && 'rotate-180',
          )}
        />
      </button>
      {isExpanded && (
        <div className="px-5 pb-5 pt-4 border-t border-[var(--color-border)] animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
}
