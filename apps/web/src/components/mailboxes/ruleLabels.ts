import type { useTranslation } from 'react-i18next';
import type {
  EmailRuleAction,
  EmailRuleActionType,
  EmailRuleConditionMatcherField,
} from '../../types';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

const MAX_RULES = 20;
const MAX_MATCHERS = 5;

const PRE_PROCESSING_ACTION_TYPES: ReadonlySet<EmailRuleActionType> = new Set(['skip', 'skip_actions', 'prepend_instruction']);
const POST_PROCESSING_ACTION_TYPES: ReadonlySet<EmailRuleActionType> = new Set(['apply_label', 'archive_message', 'mark_read', 'star_message']);

const FIELD_LABELS: Record<EmailRuleConditionMatcherField, string> = {
  from: 'From',
  subject: 'Subject',
  body: 'Body',
  has_attachment: 'Has Attachment',
  detected_action_type: 'Detected Action Type',
  always: 'Always (Match All Emails)',
};

const DETECTED_ACTION_TYPE_OPTIONS = [
  'calendar.add_event',
  'email.draft_reply',
  'external.open_link',
  'manual.todo',
  'delivery.track_package',
  'travel.track_flight',
  'finance.pay_bill',
  'appointment.confirm',
];

const ACTION_LABELS: Record<EmailRuleActionType, string> = {
  skip: 'Skip',
  skip_actions: 'Skip Actions',
  prepend_instruction: 'Custom Instruction',
  apply_label: 'Apply Label',
  archive_message: 'Archive',
  mark_read: 'Mark Read',
  star_message: 'Star',
};

const ACTION_BADGE_COLORS: Record<EmailRuleActionType, string> = {
  skip: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  skip_actions: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  prepend_instruction: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  apply_label: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  archive_message: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  mark_read: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400',
  star_message: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
};

function getActionLabel(action: EmailRuleAction, t: TranslateFn): string {
  return t(`rules.actions.${action.type}`, ACTION_LABELS[action.type]);
}

function getActionBadgeColor(action: EmailRuleAction): string {
  return ACTION_BADGE_COLORS[action.type];
}

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
};
export type { TranslateFn };
