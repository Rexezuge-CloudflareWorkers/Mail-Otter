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
