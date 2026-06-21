import { useState } from 'react';
import type { SenderDomainFilters } from '../../../components/types';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardTitle } from '../ui/Card';
import { Input } from '../ui/Input';

function RuleList({
  label,
  rules,
  busy,
  onAdd,
  onRemove,
}: {
  label: string;
  rules: string[];
  busy: boolean;
  onAdd: (rule: string) => void;
  onRemove: (rule: string) => void;
}) {
  const [draft, setDraft] = useState('');

  const handleAdd = () => {
    const trimmed = draft.trim().toLowerCase();
    if (!trimmed || rules.includes(trimmed)) return;
    onAdd(trimmed);
    setDraft('');
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">{label}</p>
      {rules.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {rules.map((rule) => (
            <span
              key={rule}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-[var(--color-surface-raised)] border border-[var(--color-border)] text-[var(--color-text-primary)]"
            >
              {rule}
              <button
                type="button"
                onClick={() => onRemove(rule)}
                disabled={busy}
                className="ml-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] disabled:opacity-40"
                aria-label={`Remove ${rule}`}
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
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
          placeholder="@domain.com or user@domain.com"
          disabled={busy}
          className="text-sm"
        />
        <Button variant="secondary" size="sm" onClick={handleAdd} disabled={busy || !draft.trim()}>
          Add
        </Button>
      </div>
    </div>
  );
}

export function SenderFilterSection({
  filters,
  busy,
  onUpdate,
}: {
  filters: SenderDomainFilters | null | undefined;
  busy: boolean;
  onUpdate: (filters: SenderDomainFilters) => void;
}) {
  const current: SenderDomainFilters = filters ?? { includeRules: [], excludeRules: [] };

  const addInclude = (rule: string) => onUpdate({ ...current, includeRules: [...current.includeRules, rule] });
  const removeInclude = (rule: string) => onUpdate({ ...current, includeRules: current.includeRules.filter((r) => r !== rule) });
  const addExclude = (rule: string) => onUpdate({ ...current, excludeRules: [...current.excludeRules, rule] });
  const removeExclude = (rule: string) => onUpdate({ ...current, excludeRules: current.excludeRules.filter((r) => r !== rule) });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sender Filters</CardTitle>
      </CardHeader>
      <p className="text-xs text-[var(--color-text-muted)] mb-4">
        Include rules: only process emails from matching senders. Exclude rules: skip emails from matching senders.
        Use <code className="font-mono">@domain.com</code> to match a domain or <code className="font-mono">user@domain.com</code> for an exact address.
        Exclude rules are checked first.
      </p>
      <div className="flex flex-col gap-4">
        <RuleList label="Include rules" rules={current.includeRules} busy={busy} onAdd={addInclude} onRemove={removeInclude} />
        <RuleList label="Exclude rules" rules={current.excludeRules} busy={busy} onAdd={addExclude} onRemove={removeExclude} />
      </div>
    </Card>
  );
}
