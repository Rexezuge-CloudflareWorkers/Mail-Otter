import { beforeEach, describe, expect, it, vi } from 'vitest';
import { escapeHtml, sanitizeHtml } from '../../packages/provider-clients/src/email-content/HtmlContentUtil';
import { isFromMailbox, normalizeText, stripHtml, truncate } from '../../packages/provider-clients/src/email-content/TextContentUtil';
import { CursorUtil } from '@mail-otter/backend-data/utils';
import { isD1ErrorRetryable } from '@mail-otter/backend-data/utils';
import { createD1SessionEnv } from '@mail-otter/backend-data/utils';
import { EnvParser } from '@mail-otter/backend-runtime/config';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';

describe('HtmlContentUtil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('escapes all special chars', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  it('escapes text without anchors', () => {
    expect(sanitizeHtml('a < b & c')).toBe('a &lt; b &amp; c');
  });

  it('preserves https anchors and escapes inner text', () => {
    expect(sanitizeHtml('<a href="https://example.com">click <b>here</b></a>')).toBe(
      '<a href="https://example.com">click &lt;b&gt;here&lt;/b&gt;</a>',
    );
  });

  it('preserves http anchors', () => {
    expect(sanitizeHtml('go <a href="http://example.com">here</a> now')).toBe(
      'go <a href="http://example.com">here</a> now',
    );
  });

  it('escapes anchors with non-http hrefs', () => {
    const input = '<a href="javascript:alert(1)">x</a>';
    expect(sanitizeHtml(input)).toBe(escapeHtml(input));
  });

  it('escapes unterminated href, tag, and missing close anchor', () => {
    const unterminatedHref = '<a href="https://example.com';
    expect(sanitizeHtml(unterminatedHref)).toBe(escapeHtml(unterminatedHref));
    const unterminatedTag = '<a href="https://example.com">';
    expect(sanitizeHtml(unterminatedTag)).toBe(escapeHtml(unterminatedTag));
    const missingClose = '<a href="https://example.com">text';
    expect(sanitizeHtml(missingClose)).toBe(escapeHtml(missingClose));
  });

  it('escapes href query-string ampersands in preserved anchors', () => {
    expect(sanitizeHtml('<a href="https://example.com/?a=1&b=2">link</a>')).toBe(
      '<a href="https://example.com/?a=1&amp;b=2">link</a>',
    );
  });
});

describe('TextContentUtil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('strips html to text and skips scripts', () => {
    const text = stripHtml('<p>Hello</p><script>alert(1)</script><p>World</p>');
    expect(text).toContain('Hello');
    expect(text).toContain('World');
    expect(text).not.toContain('alert');
  });

  it('normalizes line endings, trailing spaces, blank runs, and trims', () => {
    expect(normalizeText('a\r\nb\rc  \n\n\n\nd   ')).toBe('a\nb\nc\n\nd');
  });

  it('truncate returns short values unchanged and flags long ones', () => {
    expect(truncate('short', 10)).toBe('short');
    expect(truncate('1234567890', 10)).toBe('1234567890');
    expect(truncate('12345678901', 10)).toBe('1234567890\n\n[Message truncated before summarization.]');
  });

  it('isFromMailbox matches case-insensitively and rejects blanks', () => {
    expect(isFromMailbox('Alice <ALICE@Example.com>', 'alice@example.com')).toBe(true);
    expect(isFromMailbox('bob@example.com', 'alice@example.com')).toBe(false);
    expect(isFromMailbox(undefined, 'alice@example.com')).toBe(false);
    expect(isFromMailbox('alice@example.com', undefined)).toBe(false);
    expect(isFromMailbox(null, null)).toBe(false);
  });
});

describe('CursorUtil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('round-trips values through encode/decode', () => {
    const value = { offset: 12, filter: 'new' };
    expect(CursorUtil.decode<typeof value>(CursorUtil.encode(value))).toEqual(value);
  });

  it('returns undefined for missing or invalid cursors', () => {
    expect(CursorUtil.decode(undefined)).toBeUndefined();
    expect(CursorUtil.decode('')).toBeUndefined();
    expect(CursorUtil.decode('!!!not-base64!!!')).toBeUndefined();
  });
});

describe('D1ErrorClassifier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('flags transient errors as retryable', () => {
    expect(isD1ErrorRetryable('database is locked')).toBe(true);
    expect(isD1ErrorRetryable('database is busy')).toBe(true);
    expect(isD1ErrorRetryable('connection reset by peer')).toBe(true);
    expect(isD1ErrorRetryable('request timed out')).toBe(true);
    expect(isD1ErrorRetryable('service unavailable, please retry')).toBe(true);
    expect(isD1ErrorRetryable('deadlock detected')).toBe(true);
  });

  it('flags constraint and programmer errors as non-retryable', () => {
    expect(isD1ErrorRetryable('UNIQUE constraint failed')).toBe(false);
    expect(isD1ErrorRetryable('no such table: foo')).toBe(false);
    expect(isD1ErrorRetryable('syntax error near SELECT')).toBe(false);
    expect(isD1ErrorRetryable('permission denied')).toBe(false);
  });

  it('prefers non-retryable when both match', () => {
    expect(isD1ErrorRetryable('permission denied: connection refused')).toBe(false);
  });

  it('returns false for empty or unknown messages', () => {
    expect(isD1ErrorRetryable('')).toBe(false);
    expect(isD1ErrorRetryable('something completely unexpected')).toBe(false);
  });
});

describe('D1SessionUtil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('wraps DB with the default first-primary constraint', () => {
    const session = { id: 's' };
    const withSession = vi.fn().mockReturnValue(session);
    const env = { DB: { withSession } as unknown as D1Database, OTHER: 'kept' };
    const result = createD1SessionEnv(env);
    expect(withSession).toHaveBeenCalledWith('first-primary');
    expect(result.DB).toBe(session);
    expect((result as unknown as Record<string, unknown>).OTHER).toBe('kept');
  });

  it('passes through a custom bookmark', () => {
    const withSession = vi.fn().mockReturnValue({ id: 's2' });
    const env = { DB: { withSession } as unknown as D1Database };
    createD1SessionEnv(env, 'custom-bookmark' as never);
    expect(withSession).toHaveBeenCalledWith('custom-bookmark');
  });
});

describe('EnvParser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses positive ints and falls back on bad input', () => {
    expect(EnvParser.positiveInt({ N: '7' }, 'N', '10')).toBe(7);
    expect(EnvParser.positiveInt({}, 'N', '10')).toBe(10);
    expect(EnvParser.positiveInt({ N: '0' }, 'N', '10')).toBe(10);
    expect(EnvParser.positiveInt({ N: '-3' }, 'N', '10')).toBe(10);
    expect(EnvParser.positiveInt({ N: 'abc' }, 'N', '10')).toBe(10);
    expect(EnvParser.positiveInt({ N: '1.5' }, 'N', '10')).toBe(10);
  });

  it('parses non-negative ints including zero', () => {
    expect(EnvParser.nonNegativeInt({ N: '0' }, 'N', '5')).toBe(0);
    expect(EnvParser.nonNegativeInt({ N: '4' }, 'N', '5')).toBe(4);
    expect(EnvParser.nonNegativeInt({ N: '-1' }, 'N', '5')).toBe(5);
    expect(EnvParser.nonNegativeInt({}, 'N', '5')).toBe(5);
  });

  it('parses strings and booleans', () => {
    expect(EnvParser.string({ S: 'x' }, 'S', 'd')).toBe('x');
    expect(EnvParser.string({}, 'S', 'd')).toBe('d');
    expect(EnvParser.boolean({ B: 'true' }, 'B', 'false')).toBe(true);
    expect(EnvParser.boolean({ B: 'TRUE' }, 'B', 'false')).toBe(false);
    expect(EnvParser.boolean({}, 'B', 'true')).toBe(true);
    expect(EnvParser.boolean({ B: '1' }, 'B', 'false')).toBe(false);
  });
});

describe('ConfigurationManager namespaces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads overrides and falls back to defaults consistently', () => {
    const def = ConfigurationManager.getMaxApplicationsPerUser({});
    expect(ConfigurationManager.getMaxApplicationsPerUser({ MAX_APPLICATIONS_PER_USER: '3' })).toBe(3);
    expect(ConfigurationManager.getMaxApplicationsPerUser({ MAX_APPLICATIONS_PER_USER: 'nope' })).toBe(def);
    expect(ConfigurationManager.limits.getMaxApplicationsPerUser({ MAX_APPLICATIONS_PER_USER: '3' })).toBe(3);
  });

  it('trims trailing slashes from base URLs', () => {
    expect(ConfigurationManager.getPublicBaseUrl({ PUBLIC_BASE_URL: 'https://x.example///' })).toBe('https://x.example');
    expect(ConfigurationManager.getActionCallbackBaseUrl({ ACTION_CALLBACK_BASE_URL: 'https://y.example/' })).toBe(
      'https://y.example',
    );
    expect(ConfigurationManager.baseUrl.getPublicBaseUrl({})).toBe(ConfigurationManager.getPublicBaseUrl({}));
  });

  it('exposes namespace groups that delegate to flat getters', () => {
    const env = { DEBUG_MODE: 'true', MAX_EMAIL_BODY_CHARS: '1234' };
    expect(ConfigurationManager.getDebugMode(env)).toBe(true);
    expect(ConfigurationManager.context.getMaxEmailBodyChars(env)).toBe(1234);
    expect(ConfigurationManager.ai.getSummaryModel({})).toBe(ConfigurationManager.getEmailSummaryModel({}));
    expect(ConfigurationManager.ai.getSummaryFallbackModel({})).toBe(
      ConfigurationManager.getEmailSummaryFallbackModel({}),
    );
    expect(ConfigurationManager.ai.getDailyNeuronFallbackThreshold({})).toBe(
      ConfigurationManager.getAiDailyNeuronFallbackThreshold({}),
    );
    expect(ConfigurationManager.tracking.getPackageTrackingApiKey({})).toBe(
      ConfigurationManager.digest.getPackageTrackingApiKey({}),
    );
    expect(ConfigurationManager.attachment.getMaxSizeBytes({})).toBe(ConfigurationManager.getMaxAttachmentSizeBytes({}));
    expect(ConfigurationManager.drive.getMaxFilesPerSync({})).toBe(ConfigurationManager.getMaxDriveFilesPerSync({}));
    expect(ConfigurationManager.chat.getMaxResponseTokens({})).toBe(ConfigurationManager.getChatMaxResponseTokens({}));
    expect(ConfigurationManager.oauth2.getStateExpiryMinutes({})).toBe(ConfigurationManager.getOauth2StateExpiryMinutes({}));
    expect(ConfigurationManager.subscription.getGmailRenewalWindowHours({})).toBe(
      ConfigurationManager.getGmailWatchRenewalWindowHours({}),
    );
    expect(ConfigurationManager.action.getDefaultExpiryHours({})).toBe(ConfigurationManager.getActionDefaultExpiryHours({}));
    expect(ConfigurationManager.processing.getTaskRunRetentionDays({})).toBeGreaterThan(0);
    expect(ConfigurationManager.processing.getTaskRunRetentionDays({ BACKGROUND_TASK_RUN_RETENTION_DAYS: '7' })).toBe(7);
  });

  it('parses attachment vision and digest tracking flags', () => {
    expect(ConfigurationManager.ai.isAttachmentVisionEnabled({ ATTACHMENT_VISION_ENABLED: 'true' })).toBe(true);
    expect(ConfigurationManager.ai.isAttachmentVisionEnabled({ ATTACHMENT_VISION_ENABLED: 'false' })).toBe(false);
    expect(typeof ConfigurationManager.ai.isAttachmentVisionEnabled({})).toBe('boolean');
    expect(ConfigurationManager.getFlightTrackingApiKey({ FLIGHT_TRACKING_API_KEY: 'k' })).toBe('k');
  });
});
