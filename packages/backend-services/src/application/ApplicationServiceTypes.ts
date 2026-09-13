import type {
  AiDailyUsageDAO,
  ApplicationContextDAO,
  ApplicationIntegrationDAO,
  ConnectedApplicationDAO,
  IntegrationDeliveryLogDAO,
  OAuth2AccessTokenCacheDAO,
} from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import type { OutboundIntegrationType, SenderDomainFilters } from '@mail-otter/shared/model';
import type { IntegrationService } from '../integration/IntegrationService';
import type { OAuth2AccessTokenService } from '../oauth2/OAuth2AccessTokenService';
import type { WatchService } from '../subscription/WatchService';

interface ApplicationServiceDeps {
  applicationDAO?: () => Promise<ConnectedApplicationDAO>;
  contextDAO?: () => Promise<ApplicationContextDAO>;
  integrationDAO?: () => Promise<ApplicationIntegrationDAO>;
  deliveryLogDAO?: () => Promise<IntegrationDeliveryLogDAO>;
  usageDAO?: () => Promise<AiDailyUsageDAO>;
  tokenCacheDAO?: () => Promise<OAuth2AccessTokenCacheDAO>;
  watchService?: () => Promise<WatchService>;
  integrationService?: () => Promise<IntegrationService>;
  tokenService?: () => Promise<OAuth2AccessTokenService>;
}

interface ApplicationServiceEnv {
  DB: D1Queryable;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE?: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS?: DurableObjectNamespace;
  EMAIL_CONTEXT_INDEX?: Vectorize;
  AI?: Ai;
  MAX_APPLICATIONS_PER_USER?: string;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
  OUTLOOK_SUBSCRIPTION_TTL_DAYS?: string;
  AI_SUMMARY_MODEL?: string;
}

interface CreateUserApplicationInput {
  displayName: string;
  providerId: string;
  connectionMethod?: string;
  clientId?: string;
  clientSecret?: string;
  gmailPubsubTopicName?: string;
  imapHost?: string;
  imapPort?: number;
  imapUsername?: string;
  imapPassword?: string;
  smtpHost?: string;
  smtpPort?: number;
  enabledFeatures?: string[] | null;
  timeZone?: string | null;
  contentLanguage?: string | null;
  senderDomainFilters?: SenderDomainFilters | null;
}

interface UpdateUserApplicationInput extends CreateUserApplicationInput {
  applicationId: string;
  connectionMethod: string;
  autoExecuteActionTypes?: string[] | null;
}

interface UpdateWatchedFolderIdsInput {
  applicationId: string;
  folderIds: string[] | null;
  folderNames?: Record<string, string>;
}

interface CreateIntegrationInput {
  applicationId: string;
  integrationType: OutboundIntegrationType;
  name: string;
  webhookUrl: string;
}

interface UpdateIntegrationInput {
  integrationId: string;
  name?: string;
  enabled?: boolean;
  webhookUrl?: string;
}

export type {
  ApplicationServiceDeps,
  ApplicationServiceEnv,
  CreateIntegrationInput,
  CreateUserApplicationInput,
  UpdateIntegrationInput,
  UpdateUserApplicationInput,
  UpdateWatchedFolderIdsInput,
};
