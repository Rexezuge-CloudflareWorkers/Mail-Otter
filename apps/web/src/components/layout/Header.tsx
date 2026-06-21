import { cn } from '../../lib/utils';
import type { ActiveView } from '../../types';
import { AiUsageBar } from '../shared/AiUsageBar';

const TABS: { id: ActiveView; label: string }[] = [
  { id: 'mailboxes', label: 'Mailboxes' },
  { id: 'context', label: 'RAG Context' },
  { id: 'actions', label: 'Actions' },
];

export function Header({
  activeView,
  onViewChange,
  userEmail,
  aiUsage,
}: {
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
  userEmail: string;
  aiUsage?: { estimatedNeurons: number; dailyNeuronLimit: number; fallbackThreshold: number } | null;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface-base)]/95 backdrop-blur">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-5">
          <div className="text-xl font-semibold tracking-tight">
            <span className="text-[var(--color-accent)]">Mail</span>
            <span className="text-[var(--color-text-primary)]">-Otter</span>
          </div>

          <nav className="flex items-center rounded-lg bg-[var(--color-surface-2)] p-1 gap-0.5">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onViewChange(tab.id)}
                className={cn(
                  'px-3.5 py-1.5 rounded-md text-sm transition-colors duration-150',
                  activeView === tab.id
                    ? 'bg-[var(--color-surface-4)] text-[var(--color-text-primary)] font-medium'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
                )}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="text-sm text-[var(--color-text-muted)] truncate max-w-xs">{userEmail}</div>
      </div>

      {aiUsage && (
        <AiUsageBar
          estimatedNeurons={aiUsage.estimatedNeurons}
          dailyNeuronLimit={aiUsage.dailyNeuronLimit}
          fallbackThreshold={aiUsage.fallbackThreshold}
        />
      )}
    </header>
  );
}
