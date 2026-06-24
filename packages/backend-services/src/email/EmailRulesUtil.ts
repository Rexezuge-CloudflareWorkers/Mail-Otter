import type { EmailProcessingRule, EmailRuleConditionMatcher } from '@mail-otter/shared/model';
import { PRE_PROCESSING_ACTION_TYPES, POST_PROCESSING_ACTION_TYPES } from '@mail-otter/shared/constants';
import { SenderFilterUtil } from './SenderFilterUtil';

interface EmailRuleContext {
  from: string;
  subject: string;
  body: string;
  hasAttachment?: boolean | undefined;
  detectedActionTypes?: string[] | undefined;
}

class EmailRulesUtil {
  public static isPreProcessingRule(rule: EmailProcessingRule): boolean {
    return PRE_PROCESSING_ACTION_TYPES.has(rule.action.type);
  }

  public static isPostProcessingRule(rule: EmailProcessingRule): boolean {
    return POST_PROCESSING_ACTION_TYPES.has(rule.action.type);
  }

  public static evaluatePreProcessing(rules: EmailProcessingRule[], ctx: EmailRuleContext): EmailProcessingRule | null {
    for (const rule of rules) {
      if (!rule.enabled) continue;
      if (!EmailRulesUtil.isPreProcessingRule(rule)) continue;
      if (EmailRulesUtil.matchesConditions(rule, ctx)) return rule;
    }
    return null;
  }

  public static evaluatePostProcessing(rules: EmailProcessingRule[], ctx: EmailRuleContext): EmailProcessingRule[] {
    const matched: EmailProcessingRule[] = [];
    for (const rule of rules) {
      if (!rule.enabled) continue;
      if (!EmailRulesUtil.isPostProcessingRule(rule)) continue;
      if (EmailRulesUtil.matchesConditions(rule, ctx)) matched.push(rule);
    }
    return matched;
  }

  public static evaluate(rules: EmailProcessingRule[], ctx: EmailRuleContext): EmailProcessingRule | null {
    return EmailRulesUtil.evaluatePreProcessing(rules, ctx);
  }

  private static matchesConditions(rule: EmailProcessingRule, ctx: EmailRuleContext): boolean {
    const { operator, matchers } = rule.conditions;
    if (operator === 'any') {
      return matchers.some((m) => EmailRulesUtil.matchesMatcher(m, ctx));
    }
    return matchers.every((m) => EmailRulesUtil.matchesMatcher(m, ctx));
  }

  public static matchesMatcher(matcher: EmailRuleConditionMatcher, ctx: EmailRuleContext): boolean {
    if (matcher.field === 'has_attachment') {
      const hasAttachment = ctx.hasAttachment === true;
      return matcher.value === 'true' ? hasAttachment : !hasAttachment;
    }

    if (matcher.field === 'detected_action_type') {
      const detectedTypes = ctx.detectedActionTypes ?? [];
      const found = detectedTypes.includes(matcher.value);
      return matcher.op === 'includes' ? found : !found;
    }

    if (matcher.op === 'matches_sender') {
      const address: string = SenderFilterUtil.extractEmailAddress(ctx.from);
      return SenderFilterUtil.matchesPattern(address, matcher.value);
    }

    const fieldValue: string = EmailRulesUtil.getFieldValue(matcher.field, ctx);
    const haystack: string = fieldValue.toLowerCase();
    const needle: string = matcher.value.toLowerCase();
    const found: boolean = haystack.includes(needle);
    return matcher.op === 'contains' ? found : !found;
  }

  private static getFieldValue(field: string, ctx: EmailRuleContext): string {
    switch (field) {
      case 'from': return ctx.from;
      case 'subject': return ctx.subject;
      case 'body': return ctx.body;
      default: return '';
    }
  }
}

export { EmailRulesUtil };
export type { EmailRuleContext };
