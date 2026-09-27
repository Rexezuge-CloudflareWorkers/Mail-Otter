import { describe, expect, it } from 'vitest';
import { hasCredentials, isApplicationActive, isImapPasswordApplication, requiresProviderMailbox } from '@mail-otter/shared/model';
import { isActionExecutable, isActionSnoozed, isActionTerminal } from '@mail-otter/shared/model';

describe('ConnectedApplicationHelpers', () => {
  it('detects imap-password applications', () => {
    expect(isImapPasswordApplication({ connectionMethod: 'imap-password' })).toBe(true);
    expect(isImapPasswordApplication({ connectionMethod: 'oauth2' })).toBe(false);
  });

  it('requires a provider mailbox for non-IMAP apps without one', () => {
    expect(requiresProviderMailbox({ connectionMethod: 'oauth2', providerEmail: null })).toBe(true);
    expect(requiresProviderMailbox({ connectionMethod: 'oauth2', providerEmail: 'a@b.c' })).toBe(false);
    expect(requiresProviderMailbox({ connectionMethod: 'imap-password', providerEmail: null })).toBe(false);
  });

  it('reports active status and credential presence', () => {
    expect(isApplicationActive({ status: 'connected' })).toBe(true);
    expect(isApplicationActive({ status: 'error' })).toBe(false);
    expect(hasCredentials({ credentials: { imapPassword: 'x' } } as never)).toBe(true);
  });
});

describe('EmailActionHelpers', () => {
  it('classifies terminal statuses', () => {
    for (const status of ['succeeded', 'failed', 'expired', 'cancelled']) {
      expect(isActionTerminal({ status: status as never })).toBe(true);
    }
    expect(isActionTerminal({ status: 'pending' })).toBe(false);
    expect(isActionTerminal({ status: 'executing' })).toBe(false);
  });

  it('gates executability on pending status and expiry', () => {
    expect(isActionExecutable({ status: 'pending', expiresAt: 200 }, 100)).toBe(true);
    expect(isActionExecutable({ status: 'pending', expiresAt: 50 }, 100)).toBe(false);
    expect(isActionExecutable({ status: 'succeeded', expiresAt: 200 }, 100)).toBe(false);
  });

  it('detects snoozed actions', () => {
    expect(isActionSnoozed({ snoozedUntil: 200 }, 100)).toBe(true);
    expect(isActionSnoozed({ snoozedUntil: 50 }, 100)).toBe(false);
    expect(isActionSnoozed({ snoozedUntil: null }, 100)).toBe(false);
  });
});
