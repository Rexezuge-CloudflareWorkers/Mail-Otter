import { describe, expect, it } from 'vitest';
import { ErrorSanitizationUtil } from '@mail-otter/shared/utils';

describe('ErrorSanitizationUtil', () => {
  it('passes through non-sensitive messages with error name', () => {
    expect(ErrorSanitizationUtil.sanitizeErrorForLogging(new Error('imap down'))).toBe('Error: imap down');
  });

  it('handles non-Error values', () => {
    expect(ErrorSanitizationUtil.sanitizeErrorForLogging('plain failure')).toBe('plain failure');
    expect(ErrorSanitizationUtil.sanitizeErrorForLogging(42)).toBe('42');
  });

  it('redacts bearer tokens', () => {
    const out = ErrorSanitizationUtil.sanitizeErrorForLogging(new Error('call failed Bearer ya29.secret-value'));
    expect(out).not.toContain('ya29.secret-value');
    expect(out).toContain('[REDACTED]');
  });

  // These samples deliberately contain no `ya29.` token or JWT, so a broken
  // BEARER/BASIC pattern cannot be masked by GOOGLE_TOKEN_PATTERN or
  // JWT_PATTERN passing the assertion on their behalf.
  it('redacts a bearer header on its own', () => {
    const out = ErrorSanitizationUtil.sanitizeMessage('Authorization: Bearer abcdef0123456789abcdef');
    expect(out).toContain('Bearer [REDACTED]');
    expect(out).not.toContain('abcdef0123456789abcdef');
  });

  it('redacts a lowercase bearer header', () => {
    const out = ErrorSanitizationUtil.sanitizeMessage('bearer abcdef0123456789abcdef');
    expect(out).not.toContain('abcdef0123456789abcdef');
  });

  it('redacts a basic auth header on its own', () => {
    const out = ErrorSanitizationUtil.sanitizeMessage('Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQ=');
    expect(out).toContain('Basic [REDACTED]');
    expect(out).not.toContain('dXNlcm5hbWU6cGFzc3dvcmQ=');
  });

  it('redacts a client_secret key-value pair', () => {
    const out = ErrorSanitizationUtil.sanitizeMessage('provider rejected client_secret=abc123def456');
    expect(out).toContain('client_secret=[REDACTED]');
    expect(out).not.toContain('abc123def456');
  });

  it('redacts an auth code and a code verifier key-value pair', () => {
    const authCode = ErrorSanitizationUtil.sanitizeMessage('callback failed auth_code=4/0AeanS0bABcdef');
    expect(authCode).toContain('auth_code=[REDACTED]');
    expect(authCode).not.toContain('4/0AeanS0bABcdef');

    const verifier = ErrorSanitizationUtil.sanitizeMessage('PKCE rejected code_verifier=abc123XYZ_-');
    expect(verifier).toContain('code_verifier=[REDACTED]');
    expect(verifier).not.toContain('abc123XYZ_-');
  });

  it('leaves a bare numeric code alone so error codes stay diagnosable', () => {
    // `code=500` is a status, not a credential. The OAuth2 *query parameter*
    // form is covered by TOKEN_QUERY_PATTERN instead.
    expect(ErrorSanitizationUtil.sanitizeMessage('provider returned code=500')).toBe('provider returned code=500');
  });

  it('redacts access_token key-value pairs', () => {
    const out = ErrorSanitizationUtil.sanitizeMessage('OAuth2 token worker failed: access_token=supersecret123');
    expect(out).not.toContain('supersecret123');
    expect(out).toContain('access_token=[REDACTED]');
  });

  it('redacts JWT-shaped strings', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5c';
    const out = ErrorSanitizationUtil.sanitizeMessage(`failed with ${jwt} end`);
    expect(out).not.toContain(jwt);
    expect(out).toContain('[REDACTED-JWT]');
  });

  it('redacts google oauth tokens and token query params', () => {
    expect(ErrorSanitizationUtil.sanitizeMessage('bad ya29.a0Abc123xyz')).not.toContain('ya29.a0Abc123xyz');
    const qp = ErrorSanitizationUtil.sanitizeMessage('GET /x?access_token=supersecret123&other=1');
    expect(qp).not.toContain('supersecret123');
    expect(qp).toContain('[REDACTED]');
  });
});
