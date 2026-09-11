export {
  EmailProviderRegistry,
  createEmailProviderRegistry,
  getEmailProviderRegistryKey,
  resolveEmailProvider,
} from './EmailProviderRegistry';
export type { ProviderMap } from './EmailProviderRegistry';
export { AbstractOAuthEmailProvider } from './AbstractOAuthEmailProvider';
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
