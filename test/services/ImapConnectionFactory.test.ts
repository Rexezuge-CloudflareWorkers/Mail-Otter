import { describe, expect, it } from 'vitest';
import { buildImapConnectOptions, getImapDefaults } from '@mail-otter/backend-services/provider';

describe('ImapConnectionFactory', () => {
  it('returns provider defaults with localhost fallback', () => {
    expect(getImapDefaults('google-gmail')).toEqual({ host: 'imap.gmail.com', port: 993 });
    expect(getImapDefaults('apple-icloud')).toEqual({ host: 'imap.mail.me.com', port: 993 });
    expect(getImapDefaults('unknown')).toEqual({ host: 'localhost', port: 993 });
  });

  it('builds PLAIN options for imap-password apps', () => {
    const options = buildImapConnectOptions(
      { providerId: 'google-gmail', imapPassword: 'pw', providerEmail: 'u@x' } as never,
      'token',
      true,
    );
    expect(options).toEqual({
      host: 'imap.gmail.com',
      port: 993,
      username: 'u@x',
      auth: { method: 'PLAIN', password: 'pw' },
    });
  });

  it('builds XOAUTH2 options and prefers explicit host/port/username', () => {
    const options = buildImapConnectOptions(
      {
        providerId: 'custom-imap',
        imapHost: 'mail.example.com',
        imapPort: 1143,
        imapUsername: 'custom-user',
        providerEmail: 'u@x',
      } as never,
      'tok',
      false,
    );
    expect(options).toEqual({
      host: 'mail.example.com',
      port: 1143,
      username: 'custom-user',
      auth: { method: 'XOAUTH2', accessToken: 'tok' },
    });
  });
});
