import type { EmailProcessingRule } from '../../types';
import { FIELD_LABELS } from './ruleLabels';
import type { TranslateFn } from './ruleLabels';

function formatConditionSummary(rule: EmailProcessingRule, t: TranslateFn): string {
  const { operator, matchers } = rule.conditions;
  return matchers
    .map((m) => {
      if (m.field === 'always') return t('rules.fields.always', 'Always (Match All Emails)');
      if (m.field === 'has_attachment') return `${t('rules.fields.has_attachment', 'Has Attachment')} ${t('rules.ops.is', 'Is')} ${m.value === 'true' ? t('rules.trueValue', 'True') : t('rules.falseValue', 'False')}`;
      if (m.field === 'detected_action_type') {
        const opLabel = m.op === 'includes' ? t('rules.ops.includes', 'Includes') : t('rules.ops.not_includes', 'Does Not Include');
        return `${t('rules.fields.detected_action_type', 'Detected Action Type')} ${opLabel} "${m.value}"`;
      }
      const fieldLabel = t(`rules.fields.${m.field}`, FIELD_LABELS[m.field]);
      const opKey = m.op === 'contains' ? 'rules.ops.contains' : m.op === 'not_contains' ? 'rules.ops.not_contains' : 'rules.ops.matches_sender';
      const opFallback = m.op === 'contains' ? 'Contains' : m.op === 'not_contains' ? 'Does Not Contain' : 'Matches Sender';
      const opLabel = t(opKey, opFallback);
      return `${fieldLabel} ${opLabel.toLowerCase()} "${m.value}"`;
    })
    .join(operator === 'any' ? ' OR ' : ' AND ');
}

export { formatConditionSummary };
