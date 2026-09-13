import type { ImapConnectOptions } from '@mail-otter/provider-clients/imap';
import { PROVIDER_APPLE_ICLOUD, PROVIDER_CUSTOM_IMAP, PROVIDER_FASTMAIL_JMAP, PROVIDER_GOOGLE_GMAIL, PROVIDER_MICROSOFT_OUTLOOK, PROVIDER_YAHOO_MAIL } from '@mail-otter/shared/constants';
import type { ConnectedApplication } from '@mail-otter/shared/model';

/**
 * Factory for IMAP connection options (single source of provider defaults).
 *
 * Previously duplicated as `PROVIDER_IMAP_DEFAULTS` inside
 * `EmailProcessingWorkflow.buildImapConnectOptions`. New code (workflow,
 * polling tasks, tests) must use this factory so host/port defaults stay in
 * one place alongside `ConfigurableImapEmailProvider` wiring.
 */
const IMAP_PROVIDER_DEFAULTS: ReadonlyMap<string, { host: string; port: number }> = new Map([
  [PROVIDER_GOOGLE_GMAIL, { host: 'imap.gmail.com', port: 993 }],
  [PROVIDER_MICROSOFT_OUTLOOK, { host: 'outlook.office365.com', port: 993 }],
  [PROVIDER_FASTMAIL_JMAP, { host: 'imap.fastmail.com', port: 993 }],
  [PROVIDER_YAHOO_MAIL, { host: 'imap.mail.yahoo.com', port: 993 }],
  [PROVIDER_APPLE_ICLOUD, { host: 'imap.mail.me.com', port: 993 }],
  [PROVIDER_CUSTOM_IMAP, { host: 'localhost', port: 993 }],
]);

function getImapDefaults(providerId: string): { host: string; port: number } {
  return IMAP_PROVIDER_DEFAULTS.get(providerId) ?? { host: 'localhost', port: 993 };
}

function buildImapConnectOptions(
  application: Pick<ConnectedApplication, 'providerId' | 'imapHost' | 'imapPort' | 'imapUsername' | 'providerEmail' | 'imapPassword'>,
  accessToken: string,
  isImapPassword: boolean,
): ImapConnectOptions {
  const defaults = getImapDefaults(application.providerId);
  const host = application.imapHost ?? defaults.host;
  const port = application.imapPort ?? defaults.port;
  const username = application.imapUsername ?? application.providerEmail ?? '';
  if (isImapPassword) {
    return { host, port, username, auth: { method: 'PLAIN', password: application.imapPassword ?? '' } };
  }
  return { host, port, username, auth: { method: 'XOAUTH2', accessToken } };
}

export { IMAP_PROVIDER_DEFAULTS, buildImapConnectOptions, getImapDefaults };
