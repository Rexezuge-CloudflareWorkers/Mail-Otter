import { CONNECTION_METHOD_IMAP_PASSWORD } from '../constants/Providers';
import type { ConnectedApplication, ConnectedApplicationMetadata } from './ConnectedApplication';

function isImapPasswordApplication(application: Pick<ConnectedApplicationMetadata, 'connectionMethod'>): boolean {
  return application.connectionMethod === CONNECTION_METHOD_IMAP_PASSWORD;
}

function requiresProviderMailbox(application: Pick<ConnectedApplicationMetadata, 'connectionMethod' | 'providerEmail'>): boolean {
  return !isImapPasswordApplication(application) && !application.providerEmail;
}

function isApplicationActive(application: Pick<ConnectedApplicationMetadata, 'status'>): boolean {
  return application.status === 'connected';
}

function hasCredentials(application: ConnectedApplication): boolean {
  return Boolean(application.credentials);
}

export { isApplicationActive, isImapPasswordApplication, requiresProviderMailbox, hasCredentials };
