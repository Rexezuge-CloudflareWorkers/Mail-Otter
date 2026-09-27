import { describe, expect, it } from 'vitest';
import { hasCredentials, isApplicationActive, isImapPasswordApplication, requiresProviderMailbox } from '@mail-otter/shared/model';

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
