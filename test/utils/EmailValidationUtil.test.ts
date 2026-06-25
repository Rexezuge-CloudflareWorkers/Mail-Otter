import { describe, expect, it } from 'vitest';
import { EmailValidationUtil } from '@mail-otter/backend-services/auth';

function createRequest(headers: Record<string, string> = {}): Request {
  return new Request('https://example.com/user/me', { headers });
}

describe('EmailValidationUtil', () => {
  describe('getAuthenticatedUserEmail', () => {
    it('returns dev auth email when set', async () => {
      const email = await EmailValidationUtil.getAuthenticatedUserEmail(createRequest(), {
        DEV_AUTH_EMAIL: 'dev@example.com',
      });
      expect(email).toBe('dev@example.com');
    });

    it('throws UnauthorizedError when no JWT and no dev email', async () => {
      await expect(
        EmailValidationUtil.getAuthenticatedUserEmail(createRequest(), {}),
      ).rejects.toThrow('No Cloudflare Access JWT token provided in request headers.');
    });

    it('throws when TEAM_DOMAIN is missing', async () => {
      const req = createRequest({ 'cf-access-jwt-assertion': 'token' });
      await expect(
        EmailValidationUtil.getAuthenticatedUserEmail(req, {}),
      ).rejects.toThrow('Missing required JWT verification configuration (TEAM_DOMAIN or POLICY_AUD not set).');
    });

    it('throws when POLICY_AUD is missing', async () => {
      const req = createRequest({ 'cf-access-jwt-assertion': 'token' });
      await expect(
        EmailValidationUtil.getAuthenticatedUserEmail(req, { TEAM_DOMAIN: 'https://example.cloudflareaccess.com' }),
      ).rejects.toThrow('Missing required JWT verification configuration (TEAM_DOMAIN or POLICY_AUD not set).');
    });

    it('throws on empty POLICY_AUD', async () => {
      const req = createRequest({ 'cf-access-jwt-assertion': 'token' });
      await expect(
        EmailValidationUtil.getAuthenticatedUserEmail(req, {
          TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
          POLICY_AUD: ' '.repeat(3),
        }),
      ).rejects.toThrow('Missing required JWT verification configuration (empty POLICY_AUD).');
    });

    it('throws on comma-separated POLICY_AUD', async () => {
      const req = createRequest({ 'cf-access-jwt-assertion': 'token' });
      await expect(
        EmailValidationUtil.getAuthenticatedUserEmail(req, {
          TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
          POLICY_AUD: 'aud1,aud2',
        }),
      ).rejects.toThrow('Multiple JWT audiences are not supported.');
    });
  });
});
