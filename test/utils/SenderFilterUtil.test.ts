import { describe, it, expect } from 'vitest';
import { SenderFilterUtil } from '@mail-otter/backend-services/email';

describe('SenderFilterUtil', () => {
  describe('extractEmailAddress', () => {
    it('extracts address from angle-bracket format', () => {
      expect(SenderFilterUtil.extractEmailAddress('John Doe <john@example.com>')).toBe('john@example.com');
    });

    it('returns bare address as-is when no angle brackets', () => {
      expect(SenderFilterUtil.extractEmailAddress('john@example.com')).toBe('john@example.com');
    });

    it('lowercases the result', () => {
      expect(SenderFilterUtil.extractEmailAddress('JOHN@EXAMPLE.COM')).toBe('john@example.com');
    });

    it('lowercases angle-bracket format', () => {
      expect(SenderFilterUtil.extractEmailAddress('Acme Corp <Support@Acme.COM>')).toBe('support@acme.com');
    });

    it('trims whitespace', () => {
      expect(SenderFilterUtil.extractEmailAddress('  john@example.com  ')).toBe('john@example.com');
    });
  });

  describe('matchesPattern', () => {
    it('matches domain pattern when sender is from that domain', () => {
      expect(SenderFilterUtil.matchesPattern('alice@company.com', '@company.com')).toBe(true);
    });

    it('does not match domain pattern for a different domain', () => {
      expect(SenderFilterUtil.matchesPattern('alice@other.com', '@company.com')).toBe(false);
    });

    it('matches exact address', () => {
      expect(SenderFilterUtil.matchesPattern('alice@company.com', 'alice@company.com')).toBe(true);
    });

    it('does not match different exact address', () => {
      expect(SenderFilterUtil.matchesPattern('bob@company.com', 'alice@company.com')).toBe(false);
    });

    it('is case-insensitive for domain pattern', () => {
      expect(SenderFilterUtil.matchesPattern('alice@company.com', '@Company.COM')).toBe(true);
    });

    it('is case-insensitive for exact address pattern', () => {
      expect(SenderFilterUtil.matchesPattern('alice@company.com', 'Alice@Company.COM')).toBe(true);
    });
  });

  describe('shouldSkip', () => {
    it('returns skip: false when no rules are set', () => {
      const result = SenderFilterUtil.shouldSkip('user@example.com', { includeRules: [], excludeRules: [] });
      expect(result).toEqual({ skip: false });
    });

    it('returns skip: false when empty arrays match nothing', () => {
      const result = SenderFilterUtil.shouldSkip('user@example.com', { includeRules: [], excludeRules: [] });
      expect(result.skip).toBe(false);
    });

    it('skips sender matching an exclude rule (domain)', () => {
      const result = SenderFilterUtil.shouldSkip('newsletter@promotions.com', {
        includeRules: [],
        excludeRules: ['@promotions.com'],
      });
      expect(result).toEqual({ skip: true, reason: 'Sender matches application exclude filter rules.' });
    });

    it('skips sender matching an exclude rule (exact address)', () => {
      const result = SenderFilterUtil.shouldSkip('noreply@foo.com', {
        includeRules: [],
        excludeRules: ['noreply@foo.com'],
      });
      expect(result).toEqual({ skip: true, reason: 'Sender matches application exclude filter rules.' });
    });

    it('does not skip sender that does not match any exclude rule', () => {
      const result = SenderFilterUtil.shouldSkip('alice@company.com', {
        includeRules: [],
        excludeRules: ['@promotions.com'],
      });
      expect(result).toEqual({ skip: false });
    });

    it('does not skip sender matching an include rule', () => {
      const result = SenderFilterUtil.shouldSkip('alice@company.com', {
        includeRules: ['@company.com'],
        excludeRules: [],
      });
      expect(result).toEqual({ skip: false });
    });

    it('skips sender not matching any include rule', () => {
      const result = SenderFilterUtil.shouldSkip('alice@other.com', {
        includeRules: ['@company.com'],
        excludeRules: [],
      });
      expect(result).toEqual({ skip: true, reason: 'Sender does not match application include filter rules.' });
    });

    it('exclude takes precedence over include when sender is in both', () => {
      const result = SenderFilterUtil.shouldSkip('admin@company.com', {
        includeRules: ['@company.com'],
        excludeRules: ['admin@company.com'],
      });
      expect(result).toEqual({ skip: true, reason: 'Sender matches application exclude filter rules.' });
    });

    it('does not skip sender in include rules but not in exclude rules', () => {
      const result = SenderFilterUtil.shouldSkip('alice@company.com', {
        includeRules: ['@company.com'],
        excludeRules: ['@other.com'],
      });
      expect(result).toEqual({ skip: false });
    });

    it('extracts email from angle-bracket From header when matching', () => {
      const result = SenderFilterUtil.shouldSkip('Alice Smith <alice@company.com>', {
        includeRules: ['@company.com'],
        excludeRules: [],
      });
      expect(result).toEqual({ skip: false });
    });

    it('skips bare address not matching include rule extracted from angle-bracket header', () => {
      const result = SenderFilterUtil.shouldSkip('Bob Jones <bob@other.com>', {
        includeRules: ['@company.com'],
        excludeRules: [],
      });
      expect(result).toEqual({ skip: true, reason: 'Sender does not match application include filter rules.' });
    });
  });
});
