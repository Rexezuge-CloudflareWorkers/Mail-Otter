import { useTranslation } from 'react-i18next';
import type { EmailProcessingRule } from '../../types';
import { getActionBadgeColor, getActionLabel } from './ruleLabels';
import { formatConditionSummary } from './formatCondition';

interface RuleRowProps {
  rule: EmailProcessingRule;
  index: number;
  total: number;
  busy: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
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
}: RuleRowProps) {
  const { t } = useTranslation();
  return (
    <div className={`flex flex-col gap-1 py-3 border-b border-[var(--color-border)] last:border-0 ${rule.enabled ? '' : 'opacity-50'}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded uppercase ${getActionBadgeColor(rule.action)}`}>
          {getActionLabel(rule.action, t)}
        </span>
        <span className="text-sm font-medium text-[var(--color-text-primary)] flex-1">{rule.name}</span>
        <div className="flex items-center gap-1 ml-auto">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={busy || index === 0}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] disabled:opacity-30 px-1"
            aria-label={t('rules.moveUp', 'Move Up')}
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={busy || index === total - 1}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] disabled:opacity-30 px-1"
            aria-label={t('rules.moveDown', 'Move Down')}
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onToggle}
            disabled={busy}
            className={`text-xs px-2 py-0.5 rounded border ${rule.enabled ? 'border-[var(--color-border)] text-[var(--color-text-secondary)]' : 'border-[var(--color-border)] text-[var(--color-text-muted)]'} disabled:opacity-40`}
            aria-label={rule.enabled ? t('rules.disableRule', 'Disable Rule') : t('rules.enableRule', 'Enable Rule')}
          >
            {rule.enabled ? t('rules.enabled', 'Enabled') : t('rules.disabled', 'Disabled')}
          </button>
          <button
            type="button"
            onClick={onEdit}
            disabled={busy}
            className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-40 px-1"
            aria-label={t('rules.editRule', 'Edit Rule')}
          >
            {t('common.edit', 'Edit')}
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40 px-1"
            aria-label={t('rules.deleteRule', 'Delete Rule')}
          >
            {t('common.delete', 'Delete')}
          </button>
        </div>
      </div>
      <p className="text-xs text-[var(--color-text-muted)]">{formatConditionSummary(rule, t)}</p>
      {rule.action.type === 'prepend_instruction' && rule.action.instruction && (
        <p className="text-xs text-[var(--color-text-secondary)] italic">"{rule.action.instruction}"</p>
      )}
      {rule.action.type === 'apply_label' && (
        <p className="text-xs text-[var(--color-text-secondary)]">{t('rules.labelValue', 'Label: {{name}}', { name: rule.action.labelName })}</p>
      )}
    </div>
  );
}

export { RuleRow };
export type { RuleRowProps };
