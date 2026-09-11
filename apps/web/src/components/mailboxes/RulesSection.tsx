import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ConnectedApplication,
  EmailProcessingRule,
} from '../../types';
import { Button } from '../ui/Button';
import { CollapsibleSection } from '../shared/CollapsibleSection';
import { useMailboxCallbacks } from '../../contexts/MailboxCallbacksContext';
import { MAX_RULES } from './ruleLabels';
import { RuleForm, SuggestRuleForm } from './RuleEditor';
import { RuleRow } from './RuleList';

type FormMode = 'none' | 'manual' | 'suggest';

export function RulesSection({ application }: { application: ConnectedApplication }) {
  const { t } = useTranslation();
  const { busy, onUpdateRules } = useMailboxCallbacks();
  const [formMode, setFormMode] = useState<FormMode>('none');
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const rules = application.emailProcessingRules ?? [];

  const save = (updated: EmailProcessingRule[]) => onUpdateRules(application.applicationId, updated);

  const addRule = (rule: EmailProcessingRule) => {
    setFormMode('none');
    void save([...rules, rule]);
  };

  const saveEdit = (updated: EmailProcessingRule) => {
    setEditingRuleId(null);
    void save(rules.map((r) => (r.ruleId === updated.ruleId ? updated : r)));
  };

  const toggleRule = (ruleId: string) =>
    void save(rules.map((r) => (r.ruleId === ruleId ? { ...r, enabled: !r.enabled } : r)));

  const deleteRule = (ruleId: string) => void save(rules.filter((r) => r.ruleId !== ruleId));

  const moveRule = (index: number, direction: -1 | 1) => {
    const updated = [...rules];
    const target = index + direction;
    if (target < 0 || target >= updated.length) return;
    const temp = updated[index];
    updated[index] = updated[target];
    updated[target] = temp;
    void save(updated);
  };

  const canAddMore = rules.length < MAX_RULES;

  return (
    <CollapsibleSection title={t('rules.title', 'Email Processing Rules')}>
      <p className="text-xs text-[var(--color-text-muted)] mb-4">
        {t('rules.description', 'Rules Run In Two Phases. Pre-Processing Rules (Skip, Skip Actions, Custom Instruction) Run Before AI Summarization — First Match Wins. Post-Processing Rules (Apply Label, Archive, Mark Read, Star) Run After Summarization — All Matching Rules Execute.')}
      </p>
      {rules.length > 0 && (
        <div className="mb-3">
          {rules.map((rule, index) =>
            rule.ruleId === editingRuleId ? (
              <RuleForm
                key={rule.ruleId}
                initialRule={rule}
                applicationId={application.applicationId}
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
        <p className="text-xs text-[var(--color-text-muted)] mb-3">{t('rules.empty', 'No Rules Configured.')}</p>
      )}
      {formMode === 'manual' && (
        <RuleForm applicationId={application.applicationId} onAdd={addRule} onCancel={() => setFormMode('none')} />
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
              {t('rules.addRule', 'Add Rule')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setFormMode('suggest')} disabled={busy}>
              {t('rules.generateWithAI', 'Generate With AI')}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-[var(--color-text-muted)]">{t('rules.maxReached', 'Maximum {{max}} Rules Reached.', { max: MAX_RULES })}</p>
        )
      )}
    </CollapsibleSection>
  );
}

export { RuleForm, SuggestRuleForm } from './RuleEditor';
export type { MatcherDraft, RuleDraft, RuleFormProps, SuggestRuleFormProps, SuggestState } from './RuleEditor';
export { RuleRow } from './RuleList';
export type { RuleRowProps } from './RuleList';
export { formatConditionSummary } from './formatCondition';
export {
  ACTION_BADGE_COLORS,
  ACTION_LABELS,
  DETECTED_ACTION_TYPE_OPTIONS,
  FIELD_LABELS,
  MAX_MATCHERS,
  MAX_RULES,
  POST_PROCESSING_ACTION_TYPES,
  PRE_PROCESSING_ACTION_TYPES,
  getActionBadgeColor,
  getActionLabel,
} from './ruleLabels';
export type { TranslateFn } from './ruleLabels';
