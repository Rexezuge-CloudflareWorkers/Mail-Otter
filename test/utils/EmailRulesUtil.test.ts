import { describe, it, expect } from 'vitest';
import { EmailRulesUtil } from '@mail-otter/backend-services/email';
import type { EmailProcessingRule } from '@mail-otter/shared/model';

const ctx = { from: 'Alice Smith <alice@newsletters.com>', subject: 'Weekly Digest - Unsubscribe anytime', body: 'Hello, this is your weekly digest.' };

function rule(overrides: Partial<EmailProcessingRule> = {}): EmailProcessingRule {
  return {
    ruleId: 'test-rule-id',
    name: 'Test Rule',
    enabled: true,
    conditions: { operator: 'any', matchers: [{ field: 'subject', op: 'contains', value: 'digest' }] },
    action: { type: 'skip' },
    ...overrides,
  };
}

describe('EmailRulesUtil', () => {
  describe('evaluate', () => {
    it('returns null when rules array is empty', () => {
      expect(EmailRulesUtil.evaluate([], ctx)).toBeNull();
    });

    it('returns null when no rule matches', () => {
      const r = rule({ conditions: { operator: 'any', matchers: [{ field: 'subject', op: 'contains', value: 'invoice' }] } });
      expect(EmailRulesUtil.evaluate([r], ctx)).toBeNull();
    });

    it('returns first matching rule', () => {
      const r1 = rule({ name: 'Rule 1', conditions: { operator: 'any', matchers: [{ field: 'subject', op: 'contains', value: 'invoice' }] } });
      const r2 = rule({ name: 'Rule 2', conditions: { operator: 'any', matchers: [{ field: 'subject', op: 'contains', value: 'digest' }] } });
      expect(EmailRulesUtil.evaluate([r1, r2], ctx)?.name).toBe('Rule 2');
    });

    it('skips disabled rules', () => {
      const r = rule({ enabled: false, conditions: { operator: 'any', matchers: [{ field: 'subject', op: 'contains', value: 'digest' }] } });
      expect(EmailRulesUtil.evaluate([r], ctx)).toBeNull();
    });

    it('stops at first match (first matching rule wins)', () => {
      const r1 = rule({ name: 'First', conditions: { operator: 'any', matchers: [{ field: 'subject', op: 'contains', value: 'digest' }] } });
      const r2 = rule({ name: 'Second', conditions: { operator: 'any', matchers: [{ field: 'subject', op: 'contains', value: 'digest' }] } });
      expect(EmailRulesUtil.evaluate([r1, r2], ctx)?.name).toBe('First');
    });
  });

  describe('matchesMatcher — contains', () => {
    it('matches subject substring case-insensitively', () => {
      expect(EmailRulesUtil.matchesMatcher({ field: 'subject', op: 'contains', value: 'DIGEST' }, ctx)).toBe(true);
    });

    it('does not match when substring is absent', () => {
      expect(EmailRulesUtil.matchesMatcher({ field: 'subject', op: 'contains', value: 'invoice' }, ctx)).toBe(false);
    });

    it('matches from field against raw header string', () => {
      expect(EmailRulesUtil.matchesMatcher({ field: 'from', op: 'contains', value: 'newsletters.com' }, ctx)).toBe(true);
    });

    it('matches body field', () => {
      expect(EmailRulesUtil.matchesMatcher({ field: 'body', op: 'contains', value: 'weekly digest' }, ctx)).toBe(true);
    });
  });

  describe('matchesMatcher — not_contains', () => {
    it('returns true when value is absent', () => {
      expect(EmailRulesUtil.matchesMatcher({ field: 'subject', op: 'not_contains', value: 'invoice' }, ctx)).toBe(true);
    });

    it('returns false when value is present', () => {
      expect(EmailRulesUtil.matchesMatcher({ field: 'subject', op: 'not_contains', value: 'digest' }, ctx)).toBe(false);
    });
  });

  describe('matchesMatcher — matches_sender', () => {
    it('matches domain pattern after extracting address from angle-bracket header', () => {
      expect(EmailRulesUtil.matchesMatcher({ field: 'from', op: 'matches_sender', value: '@newsletters.com' }, ctx)).toBe(true);
    });

    it('does not match different domain', () => {
      expect(EmailRulesUtil.matchesMatcher({ field: 'from', op: 'matches_sender', value: '@other.com' }, ctx)).toBe(false);
    });

    it('matches exact address', () => {
      expect(EmailRulesUtil.matchesMatcher({ field: 'from', op: 'matches_sender', value: 'alice@newsletters.com' }, ctx)).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(EmailRulesUtil.matchesMatcher({ field: 'from', op: 'matches_sender', value: 'ALICE@NEWSLETTERS.COM' }, ctx)).toBe(true);
    });
  });

  describe('operator: all vs any', () => {
    it('all — returns true only when every matcher matches', () => {
      const r = rule({
        conditions: {
          operator: 'all',
          matchers: [
            { field: 'subject', op: 'contains', value: 'digest' },
            { field: 'from', op: 'matches_sender', value: '@newsletters.com' },
          ],
        },
      });
      expect(EmailRulesUtil.evaluate([r], ctx)).not.toBeNull();
    });

    it('all — returns null when only one of two matchers matches', () => {
      const r = rule({
        conditions: {
          operator: 'all',
          matchers: [
            { field: 'subject', op: 'contains', value: 'digest' },
            { field: 'subject', op: 'contains', value: 'invoice' },
          ],
        },
      });
      expect(EmailRulesUtil.evaluate([r], ctx)).toBeNull();
    });

    it('any — returns match when at least one matcher matches', () => {
      const r = rule({
        conditions: {
          operator: 'any',
          matchers: [
            { field: 'subject', op: 'contains', value: 'invoice' },
            { field: 'subject', op: 'contains', value: 'digest' },
          ],
        },
      });
      expect(EmailRulesUtil.evaluate([r], ctx)).not.toBeNull();
    });

    it('any — returns null when no matcher matches', () => {
      const r = rule({
        conditions: {
          operator: 'any',
          matchers: [
            { field: 'subject', op: 'contains', value: 'invoice' },
            { field: 'subject', op: 'contains', value: 'payment' },
          ],
        },
      });
      expect(EmailRulesUtil.evaluate([r], ctx)).toBeNull();
    });
  });

  describe('evaluatePreProcessing', () => {
    it('returns null when no pre-processing rule matches', () => {
      const r = rule({ action: { type: 'skip' }, conditions: { operator: 'any', matchers: [{ field: 'subject', op: 'contains', value: 'invoice' }] } });
      expect(EmailRulesUtil.evaluatePreProcessing([r], ctx)).toBeNull();
    });

    it('returns matching pre-processing rule', () => {
      const r = rule({ action: { type: 'skip' } });
      expect(EmailRulesUtil.evaluatePreProcessing([r], ctx)?.action.type).toBe('skip');
    });

    it('ignores post-processing rules', () => {
      const r = rule({ action: { type: 'apply_label', labelName: 'Newsletters' } });
      expect(EmailRulesUtil.evaluatePreProcessing([r], ctx)).toBeNull();
    });
  });

  describe('evaluatePostProcessing', () => {
    it('returns empty array when no rules match', () => {
      const r = rule({ action: { type: 'archive_message' }, conditions: { operator: 'any', matchers: [{ field: 'subject', op: 'contains', value: 'invoice' }] } });
      expect(EmailRulesUtil.evaluatePostProcessing([r], ctx)).toHaveLength(0);
    });

    it('returns all matching post-processing rules', () => {
      const r1 = rule({ action: { type: 'archive_message' } });
      const r2 = rule({ action: { type: 'mark_read' } });
      const result = EmailRulesUtil.evaluatePostProcessing([r1, r2], ctx);
      expect(result).toHaveLength(2);
      expect(result[0].action.type).toBe('archive_message');
      expect(result[1].action.type).toBe('mark_read');
    });

    it('ignores pre-processing rules', () => {
      const r = rule({ action: { type: 'skip' } });
      expect(EmailRulesUtil.evaluatePostProcessing([r], ctx)).toHaveLength(0);
    });

    it('includes detected_action_type matcher match', () => {
      const r = rule({
        action: { type: 'star_message' },
        conditions: { operator: 'any', matchers: [{ field: 'detected_action_type', op: 'includes', value: 'calendar.add_event' }] },
      });
      const ctxWithActions = { ...ctx, detectedActionTypes: ['calendar.add_event'] };
      expect(EmailRulesUtil.evaluatePostProcessing([r], ctxWithActions)).toHaveLength(1);
    });
  });

  describe('action types', () => {
    it('matched rule carries skip action', () => {
      const r = rule({ action: { type: 'skip' } });
      const result = EmailRulesUtil.evaluate([r], ctx);
      expect(result?.action.type).toBe('skip');
    });

    it('matched rule carries skip_actions action', () => {
      const r = rule({ action: { type: 'skip_actions' } });
      const result = EmailRulesUtil.evaluate([r], ctx);
      expect(result?.action.type).toBe('skip_actions');
    });

    it('matched rule carries prepend_instruction action with instruction', () => {
      const r = rule({ action: { type: 'prepend_instruction', instruction: 'Extract invoice number.' } });
      const result = EmailRulesUtil.evaluate([r], ctx);
      expect(result?.action.type).toBe('prepend_instruction');
      expect(result?.action.instruction).toBe('Extract invoice number.');
    });
  });

  describe('matchesMatcher — has_attachment', () => {
    it('matches when email has attachment and value is true', () => {
      expect(EmailRulesUtil.matchesMatcher({ field: 'has_attachment', op: 'is', value: 'true' }, { ...ctx, hasAttachment: true })).toBe(true);
    });

    it('does not match when email has no attachment and value is true', () => {
      expect(EmailRulesUtil.matchesMatcher({ field: 'has_attachment', op: 'is', value: 'true' }, { ...ctx, hasAttachment: false })).toBe(false);
    });

    it('matches when email has no attachment and value is false', () => {
      expect(EmailRulesUtil.matchesMatcher({ field: 'has_attachment', op: 'is', value: 'false' }, { ...ctx, hasAttachment: false })).toBe(true);
    });

    it('treats undefined hasAttachment as false', () => {
      expect(EmailRulesUtil.matchesMatcher({ field: 'has_attachment', op: 'is', value: 'false' }, ctx)).toBe(true);
    });
  });

  describe('matchesMatcher — detected_action_type', () => {
    it('includes — returns true when action type is in detected list', () => {
      const ctxWithActions = { ...ctx, detectedActionTypes: ['calendar.add_event', 'email.draft_reply'] };
      expect(EmailRulesUtil.matchesMatcher({ field: 'detected_action_type', op: 'includes', value: 'calendar.add_event' }, ctxWithActions)).toBe(true);
    });

    it('includes — returns false when action type not in detected list', () => {
      const ctxWithActions = { ...ctx, detectedActionTypes: ['email.draft_reply'] };
      expect(EmailRulesUtil.matchesMatcher({ field: 'detected_action_type', op: 'includes', value: 'calendar.add_event' }, ctxWithActions)).toBe(false);
    });

    it('not_includes — returns true when action type is absent', () => {
      const ctxWithActions = { ...ctx, detectedActionTypes: ['email.draft_reply'] };
      expect(EmailRulesUtil.matchesMatcher({ field: 'detected_action_type', op: 'not_includes', value: 'calendar.add_event' }, ctxWithActions)).toBe(true);
    });

    it('not_includes — returns false when action type is present', () => {
      const ctxWithActions = { ...ctx, detectedActionTypes: ['calendar.add_event'] };
      expect(EmailRulesUtil.matchesMatcher({ field: 'detected_action_type', op: 'not_includes', value: 'calendar.add_event' }, ctxWithActions)).toBe(false);
    });

    it('treats undefined detectedActionTypes as empty list', () => {
      expect(EmailRulesUtil.matchesMatcher({ field: 'detected_action_type', op: 'includes', value: 'calendar.add_event' }, ctx)).toBe(false);
    });
  });

  describe('isPreProcessingRule / isPostProcessingRule', () => {
    it('skip is a pre-processing rule', () => {
      expect(EmailRulesUtil.isPreProcessingRule(rule({ action: { type: 'skip' } }))).toBe(true);
      expect(EmailRulesUtil.isPostProcessingRule(rule({ action: { type: 'skip' } }))).toBe(false);
    });

    it('apply_label is a post-processing rule', () => {
      expect(EmailRulesUtil.isPostProcessingRule(rule({ action: { type: 'apply_label', labelName: 'Work' } }))).toBe(true);
      expect(EmailRulesUtil.isPreProcessingRule(rule({ action: { type: 'apply_label', labelName: 'Work' } }))).toBe(false);
    });

    it('star_message is a post-processing rule', () => {
      expect(EmailRulesUtil.isPostProcessingRule(rule({ action: { type: 'star_message' } }))).toBe(true);
    });
  });

  describe('matchesMatcher — always', () => {
    it('returns true for a standard email context', () => {
      expect(EmailRulesUtil.matchesMatcher({ field: 'always', op: 'match_all' }, ctx)).toBe(true);
    });

    it('returns true when context fields are empty strings', () => {
      expect(EmailRulesUtil.matchesMatcher({ field: 'always', op: 'match_all' }, { from: '', subject: '', body: '' })).toBe(true);
    });

    it('returns true regardless of hasAttachment value', () => {
      expect(EmailRulesUtil.matchesMatcher({ field: 'always', op: 'match_all' }, { ...ctx, hasAttachment: false })).toBe(true);
      expect(EmailRulesUtil.matchesMatcher({ field: 'always', op: 'match_all' }, { ...ctx, hasAttachment: true })).toBe(true);
    });

    it('evaluatePreProcessing fires for any email with always matcher', () => {
      const r = rule({ action: { type: 'skip' }, conditions: { operator: 'any', matchers: [{ field: 'always', op: 'match_all' }] } });
      expect(EmailRulesUtil.evaluatePreProcessing([r], { from: '', subject: '', body: '' })).not.toBeNull();
    });

    it('evaluatePostProcessing includes always-matcher rule for any email', () => {
      const r = rule({ action: { type: 'star_message' }, conditions: { operator: 'any', matchers: [{ field: 'always', op: 'match_all' }] } });
      const result = EmailRulesUtil.evaluatePostProcessing([r], { from: '', subject: '', body: '' });
      expect(result).toHaveLength(1);
      expect(result[0].action.type).toBe('star_message');
    });
  });

  describe('edge cases', () => {
    it('empty body — contains returns false for non-empty value', () => {
      const emptyBodyCtx = { ...ctx, body: '' };
      expect(EmailRulesUtil.matchesMatcher({ field: 'body', op: 'contains', value: 'hello' }, emptyBodyCtx)).toBe(false);
    });

    it('empty body — not_contains returns true for non-empty value', () => {
      const emptyBodyCtx = { ...ctx, body: '' };
      expect(EmailRulesUtil.matchesMatcher({ field: 'body', op: 'not_contains', value: 'hello' }, emptyBodyCtx)).toBe(true);
    });

    it('bare email in from field works with matches_sender', () => {
      const bareCtx = { ...ctx, from: 'alice@newsletters.com' };
      expect(EmailRulesUtil.matchesMatcher({ field: 'from', op: 'matches_sender', value: '@newsletters.com' }, bareCtx)).toBe(true);
    });
  });
});
