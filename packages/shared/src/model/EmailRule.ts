type EmailRuleConditionMatcherField = 'from' | 'subject' | 'body';
type EmailRuleConditionMatcherOp = 'contains' | 'not_contains' | 'matches_sender';

interface EmailRuleConditionMatcher {
  field: EmailRuleConditionMatcherField;
  op: EmailRuleConditionMatcherOp;
  value: string;
}

interface EmailRuleCondition {
  operator: 'all' | 'any';
  matchers: EmailRuleConditionMatcher[];
}

interface EmailRuleAction {
  type: 'skip' | 'skip_actions' | 'prepend_instruction';
  instruction?: string;
}

interface EmailProcessingRule {
  ruleId: string;
  name: string;
  enabled: boolean;
  conditions: EmailRuleCondition;
  action: EmailRuleAction;
}

export type { EmailProcessingRule, EmailRuleAction, EmailRuleCondition, EmailRuleConditionMatcher, EmailRuleConditionMatcherField, EmailRuleConditionMatcherOp };
