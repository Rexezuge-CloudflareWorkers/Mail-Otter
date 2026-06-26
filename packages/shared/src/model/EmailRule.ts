type EmailRuleConditionMatcherField = 'from' | 'subject' | 'body' | 'has_attachment' | 'detected_action_type' | 'always';
type EmailRuleConditionMatcherOp = 'contains' | 'not_contains' | 'matches_sender' | 'is' | 'includes' | 'not_includes' | 'match_all';

type EmailRuleConditionMatcher =
  | { field: 'from'; op: 'contains' | 'not_contains' | 'matches_sender'; value: string }
  | { field: 'subject'; op: 'contains' | 'not_contains'; value: string }
  | { field: 'body'; op: 'contains' | 'not_contains'; value: string }
  | { field: 'has_attachment'; op: 'is'; value: 'true' | 'false' }
  | { field: 'detected_action_type'; op: 'includes' | 'not_includes'; value: string }
  | { field: 'always'; op: 'match_all' };

interface EmailRuleCondition {
  operator: 'all' | 'any';
  matchers: EmailRuleConditionMatcher[];
}

type EmailRuleActionType =
  | 'skip'
  | 'skip_actions'
  | 'prepend_instruction'
  | 'apply_label'
  | 'archive_message'
  | 'mark_read'
  | 'star_message';

type EmailRuleAction =
  | { type: 'skip' }
  | { type: 'skip_actions' }
  | { type: 'prepend_instruction'; instruction?: string }
  | { type: 'apply_label'; labelName: string }
  | { type: 'archive_message' }
  | { type: 'mark_read' }
  | { type: 'star_message' };

interface EmailProcessingRule {
  ruleId: string;
  name: string;
  enabled: boolean;
  conditions: EmailRuleCondition;
  action: EmailRuleAction;
}

export type {
  EmailProcessingRule,
  EmailRuleAction,
  EmailRuleActionType,
  EmailRuleCondition,
  EmailRuleConditionMatcher,
  EmailRuleConditionMatcherField,
  EmailRuleConditionMatcherOp,
};
