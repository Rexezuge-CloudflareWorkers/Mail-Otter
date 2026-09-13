export {
  EmailProviderRegistry,
  createEmailProviderRegistry,
  getEmailProviderRegistryKey,
  resolveEmailProvider,
} from './EmailProviderRegistry';
export type { ProviderMap } from './EmailProviderRegistry';
export { InjectableEmailProviderRegistry } from './InjectableEmailProviderRegistry';
export { AbstractOAuthEmailProvider } from './AbstractOAuthEmailProvider';
export { ImapEmailProviderBase } from './ImapEmailProviderBase';
export { ConfigurableImapEmailProvider } from './ConfigurableImapEmailProvider';
export type { ImapProviderConfig } from './ConfigurableImapEmailProvider';
export { IMAP_PROVIDER_DEFAULTS, buildImapConnectOptions, getImapDefaults } from './ImapConnectionFactory';
export type {
  AnyProviderCredentials,
  IEmailProvider,
  ILabelProvider,
  ImapCursorWatchResult,
  ImapProviderCredentials,
  ProviderCredentials,
  ProviderFolder,
  ProviderMessageSummary,
  ProviderWatchResult,
  StartWatchInput,
  WebhookWatchResult,
} from './IEmailProvider';
