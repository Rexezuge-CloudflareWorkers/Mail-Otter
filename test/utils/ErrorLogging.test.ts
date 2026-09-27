import { describe, expect, it, vi, afterEach } from 'vitest';
import { logError, logTokenAdjacentError } from '@mail-otter/shared/utils';

const SECRETS = [
  'ya29.a0AfH6SMBsecret-value-here',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
  'supersecretaccesstoken',
];

/**
Every string handed to console.* during the callback.
*/
const captureConsole = (run: () => void): string[] => {
  const lines: string[] = [];
  const spies = (['log', 'info', 'warn', 'error'] as const).map((level) =>
    vi.spyOn(console, level).mockImplementation((...args: unknown[]): void => {
      lines.push(args.map((a) => (typeof a === 'string' ? a : String(a))).join(' '));
    }),
  );
  try {
    run();
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
  return lines;
};

describe('redacted error logging', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redacts Google access tokens from a log line', () => {
    const lines = captureConsole(() => {
      logError('error', 'Upstream call failed', new Error(`request failed with ${SECRETS[0]}`));
    });
    const output = lines.join('\n');
    expect(output).not.toContain('a0AfH6SMBsecret-value-here');
    expect(output).toContain('[REDACTED]');
  });

  it('redacts a JWT from a log line', () => {
    const lines = captureConsole(() => {
      logError('warn', 'Callback rejected', new Error(`token ${SECRETS[1]} was not accepted`));
    });
    expect(lines.join('\n')).not.toContain(SECRETS[1]);
  });

  it('redacts bearer and basic authorization headers', () => {
    const lines = captureConsole(() => {
      logError('error', 'Graph request failed', new Error('Authorization: Bearer supersecretaccesstoken'));
      logError('error', 'Graph request failed', new Error('Authorization: Basic dXNlcjpwYXNzd29yZA=='));
    });
    const output = lines.join('\n');
    expect(output).not.toContain('supersecretaccesstoken');
    expect(output).not.toContain('dXNlcjpwYXNzd29yZA==');
    expect(output).toContain('Bearer [REDACTED]');
    expect(output).toContain('Basic [REDACTED]');
  });

  it('redacts tokens carried in query strings and key/value pairs', () => {
    const lines = captureConsole(() => {
      logError('error', 'Refresh failed', new Error('GET https://oauth.example.com/token?access_token=abc123&state=xyz'));
      logError('error', 'Refresh failed', new Error('client_secret=shhh123 rejected'));
    });
    const output = lines.join('\n');
    expect(output).not.toContain('abc123');
    expect(output).not.toContain('shhh123');
  });

  it('still preserves the error name and non-secret message', () => {
    const lines = captureConsole(() => {
      logError('error', 'IMAP login failed', new Error('Authentication credentials rejected'));
    });
    const output = lines.join('\n');
    expect(output).toContain('IMAP login failed');
    expect(output).toContain('Authentication credentials rejected');
    expect(output).toContain('Error:');
  });

  it('handles non-Error throwables', () => {
    const lines = captureConsole(() => {
      logError('error', 'Odd failure', 'plain string failure');
      logError('error', 'Odd failure', { code: 'EAUTH', reason: 'bad token ya29.leaked-value' });
    });
    const output = lines.join('\n');
    expect(output).toContain('plain string failure');
    expect(output).not.toContain('ya29.leaked-value');
  });

  it('omits the separator when there is no error detail', () => {
    const lines = captureConsole(() => {
      logError('error', 'Nothing to add');
    });
    expect(lines).toEqual(['Nothing to add']);
  });
});

describe('token-adjacent error logging', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never emits the caught error, so no token can leak through it', () => {
    const error = new Error(`token exchange failed: access_token=${SECRETS[2]}`);
    const lines = captureConsole(() => {
      logTokenAdjacentError('error', 'OAuth2 token operation failed');
    });
    // The error object is deliberately not passed, so nothing about it is logged.
    expect(lines.join('\n')).toBe('OAuth2 token operation failed');
    expect(error.message).toContain(SECRETS[2]);
  });

  it('includes only the identifiers it is given', () => {
    const lines = captureConsole(() => {
      logTokenAdjacentError('error', 'Cron task run failed', {
        applicationId: '11111111-1111-4111-8111-111111111111',
        subscriptionId: '',
      });
    });
    const output = lines.join('\n');
    expect(output).toContain('applicationId=11111111-1111-4111-8111-111111111111');
    // Empty identifiers are dropped rather than logged as `key=`.
    expect(output).not.toContain('subscriptionId=');
  });
});
