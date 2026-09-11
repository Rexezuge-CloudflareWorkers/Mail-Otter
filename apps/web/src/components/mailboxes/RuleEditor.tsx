import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  EmailProcessingRule,
  EmailRuleAction,
  EmailRuleActionType,
  EmailRuleConditionMatcher,
  EmailRuleConditionMatcherField,
} from '../../types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { suggestRule as apiSuggestRule, loadLabels as apiLoadLabels } from '../../services/applicationService';
import {
  DETECTED_ACTION_TYPE_OPTIONS,
  MAX_MATCHERS,
  POST_PROCESSING_ACTION_TYPES,
  PRE_PROCESSING_ACTION_TYPES,
  getActionBadgeColor,
  getActionLabel,
} from './ruleLabels';
import { formatConditionSummary } from './formatCondition';

interface MatcherDraft {
  field: EmailRuleConditionMatcherField;
  op: string;
  value: string;
}

const emptyMatcher = (): MatcherDraft => ({ field: 'subject', op: 'contains', value: '' });

interface RuleDraft {
  name: string;
  operator: 'all' | 'any';
  matchers: MatcherDraft[];
  actionType: EmailRuleActionType;
  instruction: string;
  labelName: string;
}

const emptyDraft = (): RuleDraft => ({
  name: '',
  operator: 'any',
  matchers: [emptyMatcher()],
  actionType: 'skip',
  instruction: '',
  labelName: '',
});

function ruleToDraft(rule: EmailProcessingRule): RuleDraft {
  return {
    name: rule.name,
    operator: rule.conditions.operator,
    matchers: rule.conditions.matchers.map((m) => ({ field: m.field, op: m.op, value: 'value' in m ? m.value : '' })),
    actionType: rule.action.type,
    instruction: rule.action.type === 'prepend_instruction' ? (rule.action.instruction ?? '') : '',
    labelName: rule.action.type === 'apply_label' ? rule.action.labelName : '',
  };
}

function draftToMatcher(m: MatcherDraft): EmailRuleConditionMatcher {
  if (m.field === 'always') {
    return { field: 'always', op: 'match_all' };
  }
  if (m.field === 'has_attachment') {
    return { field: 'has_attachment', op: 'is', value: (m.value === 'true' ? 'true' : 'false') };
  }
  if (m.field === 'detected_action_type') {
    return { field: 'detected_action_type', op: (m.op === 'not_includes' ? 'not_includes' : 'includes'), value: m.value };
  }
  if (m.field === 'from') {
    const fromOps = ['contains', 'not_contains', 'matches_sender'] as const;
    const op = (fromOps.includes(m.op as typeof fromOps[number]) ? m.op : 'contains') as typeof fromOps[number];
    return { field: 'from', op, value: m.value };
  }
  const op = (m.op === 'contains' || m.op === 'not_contains') ? m.op : 'contains';
  return { field: m.field, op, value: m.value };
}

function draftToAction(draft: RuleDraft): EmailRuleAction {
  switch (draft.actionType) {
    case 'prepend_instruction': { return { type: 'prepend_instruction', instruction: draft.instruction.trim() };
    }
    case 'apply_label': { return { type: 'apply_label', labelName: draft.labelName.trim() };
    }
    case 'archive_message': { return { type: 'archive_message' };
    }
    case 'mark_read': { return { type: 'mark_read' };
    }
    case 'star_message': { return { type: 'star_message' };
    }
    case 'skip_actions': { return { type: 'skip_actions' };
    }
    default: { return { type: 'skip' };
    }
  }
}

type LabelState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'loaded'; labels: Array<{ id: string; name: string }> }
  | { phase: 'error' };

interface RuleFormProps {
  initialRule?: EmailProcessingRule;
  applicationId: string;
  onAdd: (rule: EmailProcessingRule) => void;
  onCancel: () => void;
}

function RuleForm({
  initialRule,
  applicationId,
  onAdd,
  onCancel,
}: RuleFormProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<RuleDraft>(initialRule ? ruleToDraft(initialRule) : emptyDraft());
  const [labelState, setLabelState] = useState<LabelState>({ phase: 'idle' });

  const loadLabelsForApplyLabel = async () => {
    if (labelState.phase === 'loading' || labelState.phase === 'loaded') return;
    setLabelState({ phase: 'loading' });
    try {
      const { labels } = await apiLoadLabels(applicationId);
      setLabelState({ phase: 'loaded', labels });
    } catch {
      setLabelState({ phase: 'error' });
    }
  };

  const setMatcher = (i: number, patch: Partial<MatcherDraft>) => {
    setDraft((d) => {
      const matchers = d.matchers.map((m, idx) => {
        if (idx !== i) return m;
        const updated = { ...m, ...patch };
        if (patch.field) {
          switch (patch.field) {
          case 'always': {
            updated.op = 'match_all';
            updated.value = '';

          break;
          }
          case 'has_attachment': {
            updated.op = 'is';
            updated.value = 'true';

          break;
          }
          case 'detected_action_type': {
            updated.op = 'includes';
            updated.value ||= DETECTED_ACTION_TYPE_OPTIONS[0];

          break;
          }
          case 'from': {
            if (updated.op !== 'contains' && updated.op !== 'not_contains' && updated.op !== 'matches_sender') {
              updated.op = 'contains';
            }

          break;
          }
          default: {
            if (updated.op !== 'contains' && updated.op !== 'not_contains') {
              updated.op = 'contains';
            }
          }
          }
        }
        return updated;
      });
      const alwaysIdx = matchers.findIndex((m) => m.field === 'always');
      if (alwaysIdx !== -1) return { ...d, matchers: [matchers[alwaysIdx]] };
      return { ...d, matchers };
    });
  };

  const setActionType = (actionType: EmailRuleActionType) => {
    setDraft((d) => {
      const newMatchers = d.matchers.map((m): MatcherDraft => {
        if (m.field === 'detected_action_type' && PRE_PROCESSING_ACTION_TYPES.has(actionType)) {
          return { ...m, field: 'subject', op: 'contains' };
        }
        return m;
      });
      return { ...d, actionType, matchers: newMatchers };
    });
    if (actionType === 'apply_label') {
      void loadLabelsForApplyLabel();
    }
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
    if (draft.matchers.some((m) => {
      if (m.field === 'has_attachment' || m.field === 'always') return false;
      return !m.value.trim();
    })) return false;
    if (draft.actionType === 'prepend_instruction' && !draft.instruction.trim()) return false;
    if (draft.actionType === 'apply_label' && !draft.labelName.trim()) return false;
    return POST_PROCESSING_ACTION_TYPES.has(draft.actionType) || draft.matchers.every((m) => m.field !== 'detected_action_type');
  };

  const handleAdd = () => {
    if (!isValid()) return;
    const rule: EmailProcessingRule = {
      ruleId: initialRule?.ruleId ?? crypto.randomUUID(),
      name: draft.name.trim(),
      enabled: initialRule?.enabled ?? true,
      conditions: {
        operator: draft.operator,
        matchers: draft.matchers.map(draftToMatcher),
      },
      action: draftToAction(draft),
    };
    onAdd(rule);
    if (!initialRule) setDraft(emptyDraft());
  };

  const renderMatcherValueInput = (m: MatcherDraft, i: number) => {
    if (m.field === 'always') return null;
    if (m.field === 'has_attachment') {
      return (
        <select
          value={m.value}
          onChange={(e) => setMatcher(i, { value: e.target.value })}
          className="text-xs border border-[var(--color-border)] rounded px-2 py-1 bg-[var(--color-surface-base)] text-[var(--color-text-primary)] flex-1"
        >
          <option value="true">{t('rules.trueValue', 'True')}</option>
          <option value="false">{t('rules.falseValue', 'False')}</option>
        </select>
      );
    }
    if (m.field === 'detected_action_type') {
      return (
        <select
          value={m.value}
          onChange={(e) => setMatcher(i, { value: e.target.value })}
          className="text-xs border border-[var(--color-border)] rounded px-2 py-1 bg-[var(--color-surface-base)] text-[var(--color-text-primary)] flex-1"
        >
          {DETECTED_ACTION_TYPE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{t(`actionTypes.${opt}`, opt)}</option>
          ))}
        </select>
      );
    }
    return (
      <Input
        type="text"
        value={m.value}
        onChange={(e) => setMatcher(i, { value: e.target.value })}
        placeholder={m.op === 'matches_sender' ? t('rules.senderPlaceholder', '@domain.com or user@example.com') : t('rules.valuePlaceholder', 'value')}
        className="text-sm flex-1 min-w-0"
        maxLength={200}
      />
    );
  };

  const renderOpSelect = (m: MatcherDraft, i: number) => {
    if (m.field === 'always') return null;
    if (m.field === 'has_attachment') {
      return (
        <select
          value="is"
          disabled
          className="text-xs border border-[var(--color-border)] rounded px-2 py-1 bg-[var(--color-surface-base)] text-[var(--color-text-primary)] opacity-60"
        >
          <option value="is">{t('rules.ops.is', 'Is')}</option>
        </select>
      );
    }
    if (m.field === 'detected_action_type') {
      return (
        <select
          value={m.op}
          onChange={(e) => setMatcher(i, { op: e.target.value })}
          className="text-xs border border-[var(--color-border)] rounded px-2 py-1 bg-[var(--color-surface-base)] text-[var(--color-text-primary)]"
        >
          <option value="includes">{t('rules.ops.includes', 'Includes')}</option>
          <option value="not_includes">{t('rules.ops.not_includes', 'Does Not Include')}</option>
        </select>
      );
    }
    return (
      <select
        value={m.op}
        onChange={(e) => setMatcher(i, { op: e.target.value })}
        className="text-xs border border-[var(--color-border)] rounded px-2 py-1 bg-[var(--color-surface-base)] text-[var(--color-text-primary)]"
      >
        <option value="contains">{t('rules.ops.contains', 'Contains')}</option>
        <option value="not_contains">{t('rules.ops.not_contains', 'Does Not Contain')}</option>
        {m.field === 'from' && <option value="matches_sender">{t('rules.ops.matches_sender', 'Matches Sender')}</option>}
      </select>
    );
  };

  return (
    <div className="border border-[var(--color-border)] rounded-lg p-4 flex flex-col gap-3 bg-[var(--color-surface-raised)]">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-[var(--color-text-secondary)]">{t('rules.ruleName', 'Rule Name')}</label>
        <Input
          type="text"
          placeholder={t('rules.ruleNamePlaceholder', 'e.g. Skip Newsletters')}
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          className="text-sm"
          maxLength={100}
        />
      </div>

      {!(draft.matchers.length === 1 && draft.matchers[0].field === 'always') && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-text-muted)]">{t('rules.match', 'Match')}</span>
          <select
            value={draft.operator}
            onChange={(e) => setDraft((d) => ({ ...d, operator: e.target.value as 'all' | 'any' }))}
            className="text-xs border border-[var(--color-border)] rounded px-2 py-1 bg-[var(--color-surface-base)] text-[var(--color-text-primary)]"
          >
            <option value="any">{t('rules.anyCondition', 'Any Condition')}</option>
            <option value="all">{t('rules.allConditions', 'All Conditions')}</option>
          </select>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {draft.matchers.map((m, i) => (
          <div key={i} className="flex gap-2 items-center flex-wrap">
            <select
              value={m.field}
              onChange={(e) => setMatcher(i, { field: e.target.value as EmailRuleConditionMatcherField })}
              className="text-xs border border-[var(--color-border)] rounded px-2 py-1 bg-[var(--color-surface-base)] text-[var(--color-text-primary)]"
            >
              <option value="from">{t('rules.fields.from', 'From')}</option>
              <option value="subject">{t('rules.fields.subject', 'Subject')}</option>
              <option value="body">{t('rules.fields.body', 'Body')}</option>
              <option value="has_attachment">{t('rules.fields.has_attachment', 'Has Attachment')}</option>
              <option value="detected_action_type">{t('rules.fields.detected_action_type', 'Detected Action Type')}</option>
              <option value="always">{t('rules.fields.always', 'Always (Match All Emails)')}</option>
            </select>
            {renderOpSelect(m, i)}
            {renderMatcherValueInput(m, i)}
            {draft.matchers.length > 1 && (
              <button
                type="button"
                onClick={() => removeMatcher(i)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-sm"
                aria-label={t('rules.removeMatcher', 'Remove Matcher')}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {draft.matchers.length < MAX_MATCHERS && draft.matchers[0]?.field !== 'always' && (
          <button
            type="button"
            onClick={addMatcher}
            className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] text-left w-fit"
          >
            + {t('rules.addCondition', 'Add Condition')}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-[var(--color-text-secondary)]">{t('rules.action', 'Action')}</label>
        <select
          value={draft.actionType}
          onChange={(e) => setActionType(e.target.value as EmailRuleActionType)}
          className="text-xs border border-[var(--color-border)] rounded px-2 py-1 bg-[var(--color-surface-base)] text-[var(--color-text-primary)]"
        >
          <optgroup label={t('rules.preProcessing', 'Pre-Processing (First Match Wins)')}>
            <option value="skip">{t('rules.actionSkipDesc', "Skip — Don't Summarize This Email")}</option>
            <option value="skip_actions">{t('rules.actionSkipActionsDesc', "Skip Actions — Summarize But Don't Create Action Proposals")}</option>
            <option value="prepend_instruction">{t('rules.actionPrependInstructionDesc', 'Custom Instruction — Add Extra Instructions To The AI Prompt')}</option>
          </optgroup>
          <optgroup label={t('rules.postProcessing', 'Post-Processing (All Matches Execute)')}>
            <option value="apply_label">{t('rules.actionApplyLabelDesc', 'Apply Label — Add A Label Or Category')}</option>
            <option value="archive_message">{t('rules.actionArchiveDesc', 'Archive — Move To Archive')}</option>
            <option value="mark_read">{t('rules.actionMarkReadDesc', 'Mark As Read')}</option>
            <option value="star_message">{t('rules.actionStarDesc', 'Star — Star Or Flag The Email')}</option>
          </optgroup>
        </select>
        {draft.actionType === 'prepend_instruction' && (
          <textarea
            value={draft.instruction}
            onChange={(e) => setDraft((d) => ({ ...d, instruction: e.target.value }))}
            placeholder={t('rules.instructionPlaceholder', 'e.g. Always extract invoice number and due date.')}
            className="text-sm border border-[var(--color-border)] rounded px-3 py-2 bg-[var(--color-surface-base)] text-[var(--color-text-primary)] resize-none mt-1"
            rows={2}
            maxLength={500}
          />
        )}
        {draft.actionType === 'apply_label' && (
          <div className="flex flex-col gap-1 mt-1">
            <Input
              type="text"
              placeholder={t('rules.labelPlaceholder', 'Label name (e.g. Shopping)')}
              value={draft.labelName}
              onChange={(e) => setDraft((d) => ({ ...d, labelName: e.target.value }))}
              className="text-sm"
              maxLength={100}
            />
            {labelState.phase === 'loading' && (
              <p className="text-xs text-[var(--color-text-muted)]">{t('rules.loadingLabels', 'Loading Labels…')}</p>
            )}
            {labelState.phase === 'loaded' && labelState.labels.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {labelState.labels.map((label) => (
                  <button
                    key={label.id}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, labelName: label.name }))}
                    className="text-xs px-2 py-0.5 rounded border border-[var(--color-border)] bg-[var(--color-surface-base)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text-primary)]"
                  >
                    {label.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="secondary" size="sm" onClick={onCancel}>{t('common.cancel', 'Cancel')}</Button>
        <Button variant="primary" size="sm" onClick={handleAdd} disabled={!isValid()}>{initialRule ? t('rules.saveRule', 'Save Rule') : t('rules.addRule', 'Add Rule')}</Button>
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

interface SuggestRuleFormProps {
  applicationId: string;
  onAdd: (rule: EmailProcessingRule) => void;
  onCancel: () => void;
}

function SuggestRuleForm({
  applicationId,
  onAdd,
  onCancel,
}: SuggestRuleFormProps) {
  const { t } = useTranslation();
  const [description, setDescription] = useState('');
  const [state, setState] = useState<SuggestState>({ phase: 'idle' });

  if (state.phase === 'edit') {
    return (
      <RuleForm
        initialRule={state.rule}
        applicationId={applicationId}
        onAdd={onAdd}
        onCancel={() => {
          // eslint-disable-next-line sonarjs/no-unused-vars
          const { ruleId: _, ...ruleWithoutId } = state.rule;
          setState({ phase: 'preview', rule: ruleWithoutId, description: state.description });
        }}
      />
    );
  }

  const generate = async (desc: string) => {
    setState({ phase: 'loading' });
    try {
      const { rule } = await apiSuggestRule(applicationId, desc);
      setState({ phase: 'preview', rule, description: desc });
    } catch (e) {
      const message = e instanceof Error ? e.message : t('rules.suggestErrorFallback', 'Could Not Generate A Rule. Try Rephrasing Your Description.');
      setState({ phase: 'error', message, description: desc });
    }
  };

  const handleGenerate = () => {
    if (!description.trim()) return;
    void generate(description.trim());
  };

  const handleRegenerate = () => {
    if (state.phase === 'preview' || state.phase === 'error') {
      void generate(state.description);
    }
  };

  const handleAccept = () => {
    if (state.phase !== 'preview') return;
    onAdd({ ...state.rule, ruleId: crypto.randomUUID() });
  };

  return (
    <div className="border border-[var(--color-border)] rounded-lg p-4 flex flex-col gap-3 bg-[var(--color-surface-raised)]">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-[var(--color-text-secondary)]">{t('rules.describeRule', 'Describe A Rule')}</label>
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder={t('rules.suggestInputPlaceholder', 'e.g. Skip newsletters from Substack')}
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
            {state.phase === 'loading' ? t('common.generating', 'Generating…') : t('common.generate', 'Generate')}
          </Button>
        </div>
      </div>

      {state.phase === 'error' && (
        <p className="text-xs text-red-500">{state.message}</p>
      )}

      {state.phase === 'preview' && (
        <div className="border border-[var(--color-border)] rounded-lg p-3 flex flex-col gap-1 bg-[var(--color-surface-base)]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded uppercase ${getActionBadgeColor(state.rule.action)}`}>
              {getActionLabel(state.rule.action, t)}
            </span>
            <span className="text-sm font-medium text-[var(--color-text-primary)]">{state.rule.name}</span>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">{formatConditionSummary({ ...state.rule, ruleId: '' }, t)}</p>
          {state.rule.action.type === 'prepend_instruction' && state.rule.action.instruction && (
            <p className="text-xs text-[var(--color-text-secondary)] italic">"{state.rule.action.instruction}"</p>
          )}
          {state.rule.action.type === 'apply_label' && (
            <p className="text-xs text-[var(--color-text-secondary)]">{t('rules.labelValue', 'Label: {{name}}', { name: state.rule.action.labelName })}</p>
          )}
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <Button variant="secondary" size="sm" onClick={onCancel}>{t('common.cancel', 'Cancel')}</Button>
        {state.phase === 'preview' && (
          <>
            <Button variant="secondary" size="sm" onClick={handleRegenerate}>{t('common.regenerate', 'Regenerate')}</Button>
            <Button variant="secondary" size="sm" onClick={() => setState({ phase: 'edit', rule: { ...state.rule, ruleId: crypto.randomUUID() }, description: state.description })}>{t('common.edit', 'Edit')}</Button>
            <Button variant="primary" size="sm" onClick={handleAccept}>{t('rules.addRule', 'Add Rule')}</Button>
          </>
        )}
        {state.phase === 'error' && (
          <Button variant="secondary" size="sm" onClick={handleRegenerate}>{t('common.retry', 'Retry')}</Button>
        )}
      </div>
    </div>
  );
}

export { RuleForm, SuggestRuleForm, draftToAction, draftToMatcher, emptyDraft, emptyMatcher, ruleToDraft };
export type { MatcherDraft, RuleDraft, RuleFormProps, SuggestRuleFormProps, SuggestState };
