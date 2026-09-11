import type { ConnectedApplication, ProviderId } from '../types';

// Mailbox vocabulary: the management UI's simplified view of a ConnectedApplication.
// `toMailbox` projects backend state for display; `fromMailbox` rebuilds backend
// state (e.g. for optimistic updates), with `overrides` filling backend-only fields.

interface Mailbox {
  mailboxId: string;
  name: string;
  provider: ProviderId;
  email: string;
  connectionMethod: 'oauth2' | 'imap-password';
  status: 'draft' | 'connected' | 'error';
  timeZone: string | null;
  contentLanguage: string | null;
}

function toMailbox(application: ConnectedApplication): Mailbox {
  return {
    mailboxId: application.applicationId,
    name: application.displayName,
    provider: application.providerId,
    email: application.providerEmail ?? application.userEmail,
    connectionMethod: application.connectionMethod,
    status: application.status,
    timeZone: application.timeZone ?? null,
    contentLanguage: application.contentLanguage ?? null,
  };
}

function fromMailbox(mailbox: Mailbox, overrides?: Partial<ConnectedApplication>): ConnectedApplication {
  return {
    applicationId: mailbox.mailboxId,
    userEmail: mailbox.email,
    providerEmail: mailbox.email,
    displayName: mailbox.name,
    providerId: mailbox.provider,
    connectionMethod: mailbox.connectionMethod,
    status: mailbox.status,
    timeZone: mailbox.timeZone,
    contentLanguage: mailbox.contentLanguage,
    contextIndexingEnabled: false,
    ragRetrievalEnabled: false,
    attachmentVisionEnabled: false,
    updatedAt: 0,
    ...overrides,
  };
}

export { fromMailbox, toMailbox };
export type { Mailbox };
