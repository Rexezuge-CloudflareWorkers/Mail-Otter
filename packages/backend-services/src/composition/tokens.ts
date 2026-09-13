import type {
  AiDailyUsageDAO,
  ApplicationContextDAO,
  ApplicationIntegrationDAO,
  ConnectedApplicationDAO,
  IntegrationDeliveryLogDAO,
  ProviderSubscriptionDAO,
  UserDAO,
} from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import type { Token } from '@mail-otter/backend-runtime/di';
import type { AnalyticsService } from '../analytics/AnalyticsService';
import type { ApplicationService } from '../application/ApplicationService';
import type { FolderService } from '../application/FolderService';
import type { DigestConfigService } from '../digest/DigestConfigService';
import type { ContextService } from '../email/ContextService';
import type { IntegrationService } from '../integration/IntegrationService';
import type { OAuth2AccessTokenService } from '../oauth2/OAuth2AccessTokenService';
import type { OAuth2AuthorizationService } from '../oauth2/OAuth2AuthorizationService';
import type { InjectableEmailProviderRegistry } from '../provider/InjectableEmailProviderRegistry';
import type { WatchService } from '../subscription/WatchService';
import type { UserService } from '../user/UserService';

// Central token registry for the per-request composition root
// (`requestScope.ts`). Call sites resolve services via
// `scope.get(Tokens.ApplicationService)` instead of `new X(env)`.
//
// Tokens carry their value type (`Token<T>`) so `scope.get(...)` infers the
// service type without an explicit generic at call sites.
interface RequestScopeEnvShape {
  DB: D1Queryable;
  AES_ENCRYPTION_KEY_SECRET: { get(): Promise<string> };
  ACTION_ENCRYPTION_KEY_SECRET?: { get(): Promise<string> };
}

interface RequestKeysShape {
  masterKey: string;
  actionKey: string;
}

const Tokens = {
  Env: Symbol('Env') as Token<RequestScopeEnvShape>,
  Db: Symbol('Db') as Token<D1Queryable>,
  Keys: Symbol('Keys') as Token<() => Promise<RequestKeysShape>>,
  ProviderRegistry: Symbol('ProviderRegistry') as Token<InjectableEmailProviderRegistry>,
  ApplicationDAO: Symbol('ApplicationDAO') as Token<() => Promise<ConnectedApplicationDAO>>,
  ApplicationContextDAO: Symbol('ApplicationContextDAO') as Token<() => Promise<ApplicationContextDAO>>,
  ApplicationIntegrationDAO: Symbol('ApplicationIntegrationDAO') as Token<() => Promise<ApplicationIntegrationDAO>>,
  IntegrationDeliveryLogDAO: Symbol('IntegrationDeliveryLogDAO') as Token<() => Promise<IntegrationDeliveryLogDAO>>,
  AiDailyUsageDAO: Symbol('AiDailyUsageDAO') as Token<() => Promise<AiDailyUsageDAO>>,
  ProviderSubscriptionDAO: Symbol('ProviderSubscriptionDAO') as Token<() => Promise<ProviderSubscriptionDAO>>,
  UserDAO: Symbol('UserDAO') as Token<() => Promise<UserDAO>>,
  ApplicationService: Symbol('ApplicationService') as Token<ApplicationService>,
  ContextService: Symbol('ContextService') as Token<ContextService>,
  WatchService: Symbol('WatchService') as Token<WatchService>,
  IntegrationService: Symbol('IntegrationService') as Token<IntegrationService>,
  UserService: Symbol('UserService') as Token<UserService>,
  DigestConfigService: Symbol('DigestConfigService') as Token<DigestConfigService>,
  FolderService: Symbol('FolderService') as Token<FolderService>,
  AnalyticsService: Symbol('AnalyticsService') as Token<AnalyticsService>,
  OAuth2AccessTokenService: Symbol('OAuth2AccessTokenService') as Token<OAuth2AccessTokenService>,
  OAuth2AuthorizationService: Symbol('OAuth2AuthorizationService') as Token<OAuth2AuthorizationService>,
} satisfies Record<string, Token<unknown>>;

export { Tokens };
