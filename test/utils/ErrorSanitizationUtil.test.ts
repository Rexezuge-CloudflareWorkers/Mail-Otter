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
