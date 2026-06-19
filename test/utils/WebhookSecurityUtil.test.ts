import { describe, expect, it } from 'vitest';
import { WebhookSecurityUtil } from '@mail-otter/provider-clients';

describe('WebhookSecurityUtil', () => {
  describe('generateSecret', () => {
    it('generates a base64url string', () => {
      const secret = WebhookSecurityUtil.generateSecret();
      expect(secret).toEqual(expect.any(String));
      expect(secret.length).toBeGreaterThan(0);
      expect(secret).not.toContain('+');
      expect(secret).not.toContain('/');
      expect(secret).not.toContain('=');
    });
  });

  describe('hashSecret', () => {
    it('returns a SHA-256 hex hash', async () => {
      const hash = await WebhookSecurityUtil.hashSecret('test-secret');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('matchesSecret', () => {
    it('returns true when secret matches hash', async () => {
      const hash = await WebhookSecurityUtil.hashSecret('correct-secret');
      const result = await WebhookSecurityUtil.matchesSecret('correct-secret', hash);
      expect(result).toBe(true);
    });

    it('returns false when secret does not match hash', async () => {
      const hash = await WebhookSecurityUtil.hashSecret('correct-secret');
      const result = await WebhookSecurityUtil.matchesSecret('wrong-secret', hash);
      expect(result).toBe(false);
    });

    it('returns false when secret is null or undefined', async () => {
      const hash = await WebhookSecurityUtil.hashSecret('secret');
      expect(await WebhookSecurityUtil.matchesSecret(null, hash)).toBe(false);
      expect(await WebhookSecurityUtil.matchesSecret(undefined, hash)).toBe(false);
    });

    it('returns false when expectedHash is null or undefined', async () => {
      expect(await WebhookSecurityUtil.matchesSecret('secret', null)).toBe(false);
      expect(await WebhookSecurityUtil.matchesSecret('secret', undefined)).toBe(false);
    });

    it('returns false when both are null', async () => {
      expect(await WebhookSecurityUtil.matchesSecret(null, null)).toBe(false);
    });
  });

  describe('base64UrlDecodeToString', () => {
    it('decodes a base64url string', () => {
      const encoded = WebhookSecurityUtil.base64UrlEncodeString('hello world');
      const decoded = WebhookSecurityUtil.base64UrlDecodeToString(encoded);
      expect(decoded).toBe('hello world');
    });
  });

  describe('base64UrlEncodeString', () => {
    it('encodes a string to base64url format', () => {
      const result = WebhookSecurityUtil.base64UrlEncodeString('test');
      expect(result).toEqual(expect.any(String));
      expect(result).not.toContain('+');
      expect(result).not.toContain('/');
    });
  });
});
