import { useState } from 'react';
import type { ConnectedApplication, EmailProcessingRule, EmailRuleConditionMatcher, EmailRuleConditionMatcherField, EmailRuleConditionMatcherOp } from '../../../components/types';
import { Button } from '../ui/Button';
import { CollapsibleSection } from '../shared/CollapsibleSection';
import { Input } from '../ui/Input';
import { useMailboxCallbacks } from '../../contexts/MailboxCallbacksContext';
import { suggestRule as apiSuggestRule } from '../../services/applicationService';

const MAX_RULES = 20;
const MAX_MATCHERS = 5;

const FIELD_LABELS: Record<EmailRuleConditionMatcherField, string> = {
  from: 'From',
  subject: 'Subject',
  body: 'Body',
};

const OP_LABELS: Record<EmailRuleConditionMatcherOp, string> = {
  contains: 'Contains',
  not_contains: 'Does Not Contain',
  matches_sender: 'Matches Sender',
};

const ACTION_LABELS: Record<EmailProcessingRule['action']['type'], string> = {
  skip: 'Skip',
  skip_actions: 'Skip Actions',
  prepend_instruction: 'Custom Instruction',
};

const ACTION_BADGE_COLORS: Record<EmailProcessingRule['action']['type'], string> = {
  skip: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  skip_actions: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  prepend_instruction: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

function formatConditionSummary(rule: EmailProcessingRule): string {
  const { operator, matchers } = rule.conditions;
  return matchers
    .map((m) => `${FIELD_LABELS[m.field]} ${OP_LABELS[m.op].toLowerCase()} "${m.value}"`)
    .join(operator === 'any' ? ' OR ' : ' AND ');
}

interface MatcherDraft {
  field: EmailRuleConditionMatcherField;
  op: EmailRuleConditionMatcherOp;
  value: string;
}

const emptyMatcher = (): MatcherDraft => ({ field: 'subject', op: 'contains', value: '' });

interface RuleDraft {
  name: string;
  operator: 'all' | 'any';
  matchers: MatcherDraft[];
  actionType: EmailProcessingRule['action']['type'];
  instruction: string;
}

const emptyDraft = (): RuleDraft => ({
  name: '',
  operator: 'any',
  matchers: [emptyMatcher()],
  actionType: 'skip',
  instruction: '',
});

function ruleToDraft(rule: EmailProcessingRule): RuleDraft {
  return {
    name: rule.name,
    operator: rule.conditions.operator,
    matchers: rule.conditions.matchers.map((m) => ({ field: m.field, op: m.op, value: m.value })),
    actionType: rule.action.type,
    instruction: rule.action.type === 'prepend_instruction' ? (rule.action.instruction ?? '') : '',
  };
}

function RuleForm({ initialRule, onAdd, onCancel }: { initialRule?: EmailProcessingRule; onAdd: (rule: EmailProcessingRule) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<RuleDraft>(initialRule ? ruleToDraft(initialRule) : emptyDraft());

  const setMatcher = (i: number, patch: Partial<MatcherDraft>) => {
    setDraft((d) => {
      const matchers = d.matchers.map((m, idx) => (idx === i ? { ...m, ...patch } : m));
      if (patch.field && patch.field !== 'from' && matchers[i].op === 'matches_sender') {
        matchers[i] = { ...matchers[i], op: 'contains' };
      }
      return { ...d, matchers };
    });
  };

  const addMatcher = () => {
    if (draft.matchers.length >= MAX_MATCHERS) return;
    setDraft((d) => ({ ...d, matchers: [...d.matchers, emptyMatcher()] }));
  };

  const removeMatcher = (i: number) => {
    if (draft.matchers.length <= 1) return;
    setDraft((d) => ({ ...d, matchers: d.matchers.filter((_, idx) => idx !== i) }));
  };

  const isValid = (): boolean => {
    if (!draft.name.trim()) return false;
    if (draft.matchers.some((m) => !m.value.trim())) return false;
    if (draft.actionType === 'prepend_instruction' && !draft.instruction.trim()) return false;
    return true;
  };

  const handleAdd = () => {
    if (!isValid()) return;
    const rule: EmailProcessingRule = {
      ruleId: initialRule?.ruleId ?? crypto.randomUUID(),
      name: draft.name.trim(),
      enabled: initialRule?.enabled ?? true,
      conditions: {
        operator: draft.operator,
        matchers: draft.matchers.map((m): EmailRuleConditionMatcher => ({ field: m.field, op: m.op, value: m.value.trim() })),
      },
      action: draft.actionType === 'prepend_instruction'
        ? { type: 'prepend_instruction', instruction: draft.instruction.trim() }
        : { type: draft.actionType },
    };
    onAdd(rule);
    if (!initialRule) setDraft(emptyDraft());
  };

  return (
    <div className="border border-[var(--color-border)] rounded-lg p-4 flex flex-col gap-3 bg-[var(--color-surface-raised)]">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-[var(--color-text-secondary)]">Rule Name</label>
        <Input
          type="text"
          placeholder="e.g. Skip Newsletters"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          className="text-sm"
          maxLength={100}
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--color-text-muted)]">Match</span>
        <select
          value={draft.operator}
          onChange={(e) => setDraft((d) => ({ ...d, operator: e.target.value as 'all' | 'any' }))}
          className="text-xs border border-[var(--color-border)] rounded px-2 py-1 bg-[var(--color-surface-base)] text-[var(--color-text-primary)]"
        >
          <option value="any">Any Condition</option>
          <option value="all">All Conditions</option>
        </select>
      </div>

      <div className="flex flex-col gap-2">
        {draft.matchers.map((m, i) => (
          <div key={i} className="flex gap-2 items-center flex-wrap">
            <select
              value={m.field}
              onChange={(e) => setMatcher(i, { field: e.target.value as EmailRuleConditionMatcherField })}
              className="text-xs border border-[var(--color-border)] rounded px-2 py-1 bg-[var(--color-surface-base)] text-[var(--color-text-primary)]"
            >
              <option value="from">From</option>
              <option value="subject">Subject</option>
              <option value="body">Body</option>
            </select>
            <select
              value={m.op}
              onChange={(e) => setMatcher(i, { op: e.target.value as EmailRuleConditionMatcherOp })}
              className="text-xs border border-[var(--color-border)] rounded px-2 py-1 bg-[var(--color-surface-base)] text-[var(--color-text-primary)]"
            >
              <option value="contains">Contains</option>
              <option value="not_contains">Does Not Contain</option>
              {m.field === 'from' && <option value="matches_sender">Matches Sender</option>}
            </select>
            <Input
              type="text"
              value={m.value}
              onChange={(e) => setMatcher(i, { value: e.target.value })}
              placeholder={m.op === 'matches_sender' ? '@domain.com or user@example.com' : 'value'}
              className="text-sm flex-1 min-w-0"
              maxLength={200}
            />
            {draft.matchers.length > 1 && (
              <button
                type="button"
                onClick={() => removeMatcher(i)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-sm"
                aria-label="Remove Matcher"
              >
                ×
              </button>
            )}
          </div>
        ))}
        {draft.matchers.length < MAX_MATCHERS && (
          <button
            type="button"
            onClick={addMatcher}
            className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] text-left w-fit"
          >
            + Add Condition
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-[var(--color-text-secondary)]">Action</label>
        <select
          value={draft.actionType}
          onChange={(e) => setDraft((d) => ({ ...d, actionType: e.target.value as EmailProcessingRule['action']['type'] }))}
          className="text-xs border border-[var(--color-border)] rounded px-2 py-1 bg-[var(--color-surface-base)] text-[var(--color-text-primary)]"
        >
          <option value="skip">Skip — Don't Summarize This Email</option>
          <option value="skip_actions">Skip Actions — Summarize But Don't Create Action Proposals</option>
          <option value="prepend_instruction">Custom Instruction — Add Extra Instructions To The AI Prompt</option>
        </select>
        {draft.actionType === 'prepend_instruction' && (
          <textarea
            value={draft.instruction}
            onChange={(e) => setDraft((d) => ({ ...d, instruction: e.target.value }))}
            placeholder="e.g. Always extract invoice number and due date."
            className="text-sm border border-[var(--color-border)] rounded px-3 py-2 bg-[var(--color-surface-base)] text-[var(--color-text-primary)] resize-none mt-1"
            rows={2}
            maxLength={500}
          />
        )}
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" size="sm" onClick={handleAdd} disabled={!isValid()}>{initialRule ? 'Save Rule' : 'Add Rule'}</Button>
      </div>
    </div>
  );
}

type SuggestState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'preview'; rule: Omit<EmailProcessingRule, 'ruleId'>; description: string }
  | { phase: 'edit'; rule: EmailProcessingRule; description: string }
  | { phase: 'error'; message: string; description: string };

function SuggestRuleForm({
  applicationId,
  onAdd,
  onCancel,
}: {
  applicationId: string;
  onAdd: (rule: EmailProcessingRule) => void;
  onCancel: () => void;
}) {
  const [description, setDescription] = useState('');
  const [state, setState] = useState<SuggestState>({ phase: 'idle' });

  const generate = async (desc: string) => {
    setState({ phase: 'loading' });
    try {
      const { rule } = await apiSuggestRule(applicationId, desc);
      setState({ phase: 'preview', rule, description: desc });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could Not Generate A Rule. Try Rephrasing Your Description.';
      setState({ phase: 'error', message, description: desc });
    }
  };

  const handleGenerate = () => {
    if (!description.trim()) return;
    generate(description.trim());
  };

  const handleRegenerate = () => {
    if (state.phase === 'preview' || state.phase === 'error') {
      generate(state.description);
    }
  };

  const handleAccept = () => {
    if (state.phase !== 'preview') return;
    onAdd({ ...state.rule, ruleId: crypto.randomUUID() });
  };

  if (state.phase === 'edit') {
    return (
      <RuleForm
        initialRule={state.rule}
        onAdd={onAdd}
        onCancel={() => {
          const { ruleId: _, ...ruleWithoutId } = state.rule;
          setState({ phase: 'preview', rule: ruleWithoutId, description: state.description });
        }}
      />
    );
  }

  return (
    <div className="border border-[var(--color-border)] rounded-lg p-4 flex flex-col gap-3 bg-[var(--color-surface-raised)]">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-[var(--color-text-secondary)]">Describe A Rule</label>
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="e.g. Skip newsletters from Substack"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              if (state.phase === 'preview' || state.phase === 'error') setState({ phase: 'idle' });
            }}
            className="text-sm flex-1"
            maxLength={500}
            disabled={state.phase === 'loading'}
            onKeyDown={(e) => { if (e.key === 'Enter' && description.trim() && state.phase !== 'loading') handleGenerate(); }}
          />
          <Button
            variant="primary"
            size="sm"
            onClick={handleGenerate}
            disabled={!description.trim() || state.phase === 'loading'}
          >
            {state.phase === 'loading' ? 'Generating…' : 'Generate'}
          </Button>
        </div>
      </div>

      {state.phase === 'error' && (
        <p className="text-xs text-red-500">{state.message}</p>
      )}

      {state.phase === 'preview' && (
        <div className="border border-[var(--color-border)] rounded-lg p-3 flex flex-col gap-1 bg-[var(--color-surface-base)]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded uppercase ${ACTION_BADGE_COLORS[state.rule.action.type]}`}>
              {ACTION_LABELS[state.rule.action.type]}
            </span>
            <span className="text-sm font-medium text-[var(--color-text-primary)]">{state.rule.name}</span>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">{formatConditionSummary({ ...state.rule, ruleId: '' })}</p>
          {state.rule.action.type === 'prepend_instruction' && state.rule.action.instruction && (
            <p className="text-xs text-[var(--color-text-secondary)] italic">"{state.rule.action.instruction}"</p>
          )}
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
        {state.phase === 'preview' && (
          <>
            <Button variant="secondary" size="sm" onClick={handleRegenerate}>Regenerate</Button>
            <Button variant="secondary" size="sm" onClick={() => setState({ phase: 'edit', rule: { ...state.rule, ruleId: crypto.randomUUID() }, description: state.description })}>Edit</Button>
            <Button variant="primary" size="sm" onClick={handleAccept}>Add Rule</Button>
          </>
        )}
        {state.phase === 'error' && (
          <Button variant="secondary" size="sm" onClick={handleRegenerate}>Retry</Button>
        )}
      </div>
    </div>
  );
}

function RuleRow({
  rule,
  index,
  total,
  busy,
  onToggle,
  onDelete,
  onEdit,
  onMoveUp,
  onMoveDown,
}: {
  rule: EmailProcessingRule;
  index: number;
  total: number;
  busy: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className={`flex flex-col gap-1 py-3 border-b border-[var(--color-border)] last:border-0 ${!rule.enabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded uppercase ${ACTION_BADGE_COLORS[rule.action.type]}`}>
          {ACTION_LABELS[rule.action.type]}
        </span>
        <span className="text-sm font-medium text-[var(--color-text-primary)] flex-1">{rule.name}</span>
        <div className="flex items-center gap-1 ml-auto">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={busy || index === 0}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] disabled:opacity-30 px-1"
            aria-label="Move Up"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={busy || index === total - 1}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] disabled:opacity-30 px-1"
            aria-label="Move Down"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onToggle}
            disabled={busy}
            className={`text-xs px-2 py-0.5 rounded border ${rule.enabled ? 'border-[var(--color-border)] text-[var(--color-text-secondary)]' : 'border-[var(--color-border)] text-[var(--color-text-muted)]'} disabled:opacity-40`}
            aria-label={rule.enabled ? 'Disable Rule' : 'Enable Rule'}
          >
            {rule.enabled ? 'Enabled' : 'Disabled'}
          </button>
          <button
            type="button"
            onClick={onEdit}
            disabled={busy}
            className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-40 px-1"
            aria-label="Edit Rule"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40 px-1"
            aria-label="Delete Rule"
          >
            Delete
          </button>
        </div>
      </div>
      <p className="text-xs text-[var(--color-text-muted)]">{formatConditionSummary(rule)}</p>
      {rule.action.type === 'prepend_instruction' && rule.action.instruction && (
        <p className="text-xs text-[var(--color-text-secondary)] italic">"{rule.action.instruction}"</p>
      )}
    </div>
  );
}

type FormMode = 'none' | 'manual' | 'suggest';

export function RulesSection({ application }: { application: ConnectedApplication }) {
  const { busy, onUpdateRules } = useMailboxCallbacks();
  const [formMode, setFormMode] = useState<FormMode>('none');
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const rules = application.emailProcessingRules ?? [];

  const save = (updated: EmailProcessingRule[]) => onUpdateRules(application.applicationId, updated);

  const addRule = (rule: EmailProcessingRule) => {
    setFormMode('none');
    save([...rules, rule]);
  };

  const saveEdit = (updated: EmailProcessingRule) => {
    setEditingRuleId(null);
    save(rules.map((r) => (r.ruleId === updated.ruleId ? updated : r)));
  };

  const toggleRule = (ruleId: string) =>
    save(rules.map((r) => (r.ruleId === ruleId ? { ...r, enabled: !r.enabled } : r)));

  const deleteRule = (ruleId: string) => save(rules.filter((r) => r.ruleId !== ruleId));

  const moveRule = (index: number, direction: -1 | 1) => {
    const updated = [...rules];
    const target = index + direction;
    if (target < 0 || target >= updated.length) return;
    [updated[index], updated[target]] = [updated[target], updated[index]];
    save(updated);
  };

  const canAddMore = rules.length < MAX_RULES;

  return (
    <CollapsibleSection title="Email Processing Rules">
      <p className="text-xs text-[var(--color-text-muted)] mb-4">
        Rules Are Evaluated In Order. The First Matching Rule Wins.
        Skip Rules Prevent Summarization. Skip Actions Rules Summarize Without Creating Action Proposals.
        Custom Instruction Rules Inject Extra Instructions Into The AI Prompt.
      </p>
      {rules.length > 0 && (
        <div className="mb-3">
          {rules.map((rule, index) =>
            rule.ruleId === editingRuleId ? (
              <RuleForm
                key={rule.ruleId}
                initialRule={rule}
                onAdd={saveEdit}
                onCancel={() => setEditingRuleId(null)}
              />
            ) : (
              <RuleRow
                key={rule.ruleId}
                rule={rule}
                index={index}
                total={rules.length}
                busy={busy || editingRuleId !== null}
                onToggle={() => toggleRule(rule.ruleId)}
                onDelete={() => deleteRule(rule.ruleId)}
                onEdit={() => { setEditingRuleId(rule.ruleId); setFormMode('none'); }}
                onMoveUp={() => moveRule(index, -1)}
                onMoveDown={() => moveRule(index, 1)}
              />
            )
          )}
        </div>
      )}
      {formMode === 'none' && rules.length === 0 && (
        <p className="text-xs text-[var(--color-text-muted)] mb-3">No Rules Configured.</p>
      )}
      {formMode === 'manual' && (
        <RuleForm onAdd={addRule} onCancel={() => setFormMode('none')} />
      )}
      {formMode === 'suggest' && (
        <SuggestRuleForm
          applicationId={application.applicationId}
          onAdd={addRule}
          onCancel={() => setFormMode('none')}
        />
      )}
      {formMode === 'none' && editingRuleId === null && (
        canAddMore ? (
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setFormMode('manual')} disabled={busy}>
              Add Rule
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setFormMode('suggest')} disabled={busy}>
              Generate With AI
            </Button>
          </div>
        ) : (
          <p className="text-xs text-[var(--color-text-muted)]">Maximum {MAX_RULES} Rules Reached.</p>
        )
      )}
    </CollapsibleSection>
  );
}
