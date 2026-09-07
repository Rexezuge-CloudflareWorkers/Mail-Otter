import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConnectedApplication, SenderDomainFilters } from '../../types';
import { Button } from '../ui/Button';
import { CollapsibleSection } from '../shared/CollapsibleSection';
import { Input } from '../ui/Input';
import { useMailboxCallbacks } from '../../contexts/MailboxCallbacksContext';

export function SenderFilterSection({ application }: { application: ConnectedApplication }) {
  const { t } = useTranslation();
  const { busy, onUpdateSenderFilters } = useMailboxCallbacks();
  const [draft, setDraft] = useState('');
  const current: SenderDomainFilters = application.senderDomainFilters ?? { includeRules: [] };

  const handleAdd = () => {
    const trimmed = draft.trim().toLowerCase();
    if (!trimmed || current.includeRules.includes(trimmed)) return;
    onUpdateSenderFilters(application.applicationId, { includeRules: [...current.includeRules, trimmed] });
    setDraft('');
  };

  const handleRemove = (rule: string) => {
    onUpdateSenderFilters(application.applicationId, { includeRules: current.includeRules.filter((r) => r !== rule) });
  };

  return (
    <CollapsibleSection title={t('senderFilter.allowlistTitle', 'Sender Allowlist')}>
      <p className="text-xs text-[var(--color-text-muted)] mb-4">
        {t('senderFilter.description1', 'When set, only emails from matching senders are processed. Leave empty to process all senders. Use')}{' '}
        <code className="font-mono">@domain.com</code>{' '}
        {t('senderFilter.description2', 'to match a domain or')}{' '}
        <code className="font-mono">user@domain.com</code>{' '}
        {t('senderFilter.description3', 'for an exact address.')}{' '}
        {t('senderFilter.description4', 'To block specific senders, create a rule with Field: From, Operator: Matches Sender, Action: Skip.')}
      </p>
      {current.includeRules.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {current.includeRules.map((rule) => (
            <span
              key={rule}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-[var(--color-surface-raised)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
            >
              {rule}
              <button
                type="button"
                onClick={() => handleRemove(rule)}
                disabled={busy}
                className="ml-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] disabled:opacity-40"
                aria-label={t('senderFilter.removeRule', 'Remove {{rule}}', { rule })}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key !== 'Enter') {
          	return;
          }

          e.preventDefault(); handleAdd(); }}
          placeholder={t('senderFilter.placeholder', '@domain.com or user@domain.com')}
          disabled={busy}
          className="text-sm"
        />
        <Button variant="secondary" size="sm" onClick={handleAdd} disabled={busy || !draft.trim()}>
          {t('common.add', 'Add')}
        </Button>
      </div>
    </CollapsibleSection>
  );
}
