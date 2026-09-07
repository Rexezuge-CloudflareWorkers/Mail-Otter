import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import type { ActiveView } from '../../types';
import { AiUsageBar } from '../shared/AiUsageBar';
import { LanguageSelector } from '../shared/LanguageSelector';

const TAB_IDS: ActiveView[] = ['mailboxes', 'context', 'actions', 'activity', 'chat', 'analytics', 'processing', 'help'];

export function Header({
  activeView,
  onViewChange,
  userEmail,
  aiUsage,
  language,
  onLanguageChange,
  languageDisabled,
}: {
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
  userEmail: string;
  aiUsage?: { estimatedNeurons: number; dailyNeuronLimit: number; fallbackThreshold: number } | null;
  language?: string;
  onLanguageChange?: (lng: string) => void;
  languageDisabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface-base)]/95 backdrop-blur">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-5">
          <div className="text-xl font-semibold tracking-tight">
            <span className="text-[var(--color-accent)]">Mail</span>
            <span className="text-[var(--color-text-primary)]">-Otter</span>
          </div>

          <nav className="flex items-center rounded-lg bg-[var(--color-surface-2)] p-1 gap-0.5 flex-wrap">
            {TAB_IDS.map((id) => (
              <button
                key={id}
                onClick={() => onViewChange(id)}
                className={cn(
                  'px-3.5 py-1.5 rounded-md text-sm transition-colors duration-150',
                  activeView === id
                    ? 'bg-[var(--color-surface-4)] text-[var(--color-text-primary)] font-medium'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
                )}
              >
                {t(`header.tabs.${id}`)}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {onLanguageChange && (
            <LanguageSelector value={language} onChange={onLanguageChange} disabled={languageDisabled} />
          )}
          <div className="text-sm text-[var(--color-text-muted)] truncate max-w-xs">{userEmail}</div>
        </div>
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
