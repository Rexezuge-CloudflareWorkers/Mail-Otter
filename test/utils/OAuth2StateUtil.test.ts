import { describe, expect, it } from 'vitest';
import { OAuth2StateUtil } from '@mail-otter/backend-services/oauth2';

describe('OAuth2StateUtil', () => {
  it('generateState produces a base64url string of expected length', () => {
    const state = OAuth2StateUtil.generateState();
    expect(state).toEqual(expect.any(String));
    expect(state.length).toBeGreaterThanOrEqual(40);
  });

  it('generateCodeVerifier produces a base64url string', () => {
    const verifier = OAuth2StateUtil.generateCodeVerifier();
    expect(verifier).toEqual(expect.any(String));
    expect(verifier.length).toBeGreaterThanOrEqual(80);
  });

  it('getStateHash returns a SHA-256 hex hash', async () => {
    const hash = await OAuth2StateUtil.getStateHash('test-state');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('getCodeChallenge returns a SHA-256 base64url digest', async () => {
    const challenge = await OAuth2StateUtil.getCodeChallenge('test-verifier');
    expect(challenge).toEqual(expect.any(String));
    expect(challenge).not.toContain('=');
    expect(challenge).not.toContain('+');
    expect(challenge).not.toContain('/');
  });
});
