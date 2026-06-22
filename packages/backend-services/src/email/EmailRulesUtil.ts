import type { EmailProcessingRule, EmailRuleConditionMatcher } from '@mail-otter/shared/model';
import { SenderFilterUtil } from './SenderFilterUtil';

interface EmailRuleContext {
  from: string;
  subject: string;
  body: string;
}

class EmailRulesUtil {
  public static evaluate(rules: EmailProcessingRule[], ctx: EmailRuleContext): EmailProcessingRule | null {
    for (const rule of rules) {
      if (!rule.enabled) continue;
      if (EmailRulesUtil.matchesConditions(rule, ctx)) return rule;
    }
    return null;
  }

  private static matchesConditions(rule: EmailProcessingRule, ctx: EmailRuleContext): boolean {
    const { operator, matchers } = rule.conditions;
    if (operator === 'any') {
      return matchers.some((m) => EmailRulesUtil.matchesMatcher(m, ctx));
    }
    return matchers.every((m) => EmailRulesUtil.matchesMatcher(m, ctx));
  }

  public static matchesMatcher(matcher: EmailRuleConditionMatcher, ctx: EmailRuleContext): boolean {
    const fieldValue: string = EmailRulesUtil.getFieldValue(matcher.field, ctx);

    if (matcher.op === 'matches_sender') {
      const address: string = SenderFilterUtil.extractEmailAddress(fieldValue);
      return SenderFilterUtil.matchesPattern(address, matcher.value);
    }

    const haystack: string = fieldValue.toLowerCase();
    const needle: string = matcher.value.toLowerCase();
    const found: boolean = haystack.includes(needle);
    return matcher.op === 'contains' ? found : !found;
  }

  private static getFieldValue(field: EmailRuleConditionMatcher['field'], ctx: EmailRuleContext): string {
    switch (field) {
      case 'from': return ctx.from;
      case 'subject': return ctx.subject;
      case 'body': return ctx.body;
    }
  }
}

export { EmailRulesUtil };
export type { EmailRuleContext };
