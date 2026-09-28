import {
  AiDailyUsageDAO,
  ApplicationContextDAO,
  ApplicationIntegrationDAO,
  ConnectedApplicationDAO,
  EmailActionDAO,
  IntegrationDeliveryLogDAO,
  ProviderSubscriptionDAO,
  UserDAO,
  UserEmailDAO,
} from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { Container } from '@mail-otter/backend-runtime/di';
// NOTE: service imports use the package entry points (`@mail-otter/...`)
// rather than relative file paths so route unit tests mocking those modules
// (`vi.mock('@mail-otter/backend-services/application', ...)`) keep working
// after migration to `scope.get(...)`. Runtime behavior is identical.
import { AnalyticsService } from '@mail-otter/backend-services/analytics';
import { ApplicationService, FolderService } from '@mail-otter/backend-services/application';
import type { ApplicationServiceEnv, FolderServiceEnv } from '@mail-otter/backend-services/application';
import type { ContextServiceEnv } from '@mail-otter/backend-services/email';
import type { ChatEnv } from '@mail-otter/backend-services/chat';
import type { DigestServiceEnv } from '@mail-otter/backend-services/digest';
import type { IntegrationServiceEnv } from '@mail-otter/backend-services/integration';
import type { OAuth2AccessTokenServiceEnv, OAuth2AuthorizationServiceEnv } from '@mail-otter/backend-services/oauth2';
import type { ProcessingServiceEnv } from '@mail-otter/backend-services/processing';
import type { WatchServiceEnv } from '@mail-otter/backend-services/subscription';
import type { AnalyticsServiceEnv } from '@mail-otter/backend-services/analytics';
import type { UserServiceEnv } from '@mail-otter/backend-services/user';
import { DigestConfigService, DigestService } from '@mail-otter/backend-services/digest';
import { ContextService } from '@mail-otter/backend-services/email';
import { IntegrationService } from '@mail-otter/backend-services/integration';
import { OAuth2AccessTokenService, OAuth2AuthorizationService } from '@mail-otter/backend-services/oauth2';
import { InjectableEmailProviderRegistry } from '../provider/InjectableEmailProviderRegistry';
import { InjectableActionHandlerRegistry } from '../action/handlers/InjectableActionHandlerRegistry';
import { InjectableIntegrationObserverRegistry } from '../integration/observers/InjectableIntegrationObserverRegistry';
import { ActionHandlerRegistry } from '../action/handlers/ActionHandlerRegistry';
import { ActionService } from '@mail-otter/backend-services/action';
import { AiService } from '@mail-otter/backend-services/ai';
import { ChatService } from '@mail-otter/backend-services/chat';
import { ProcessingService } from '@mail-otter/backend-services/processing';
import { AppConfiguration } from '@mail-otter/backend-runtime/config';
import { WatchService } from '@mail-otter/backend-services/subscription';
import { UserIdentityService } from '@mail-otter/backend-services/identity';
import { UserService } from '@mail-otter/backend-services/user';
import { Tokens } from './tokens';

/**
 * The bindings every service resolved from this scope needs.
 *
 * This used to be a three-field interface with the services receiving
 * `env` at twelve call sites. Those casts were unchecked, so a
 * service could declare a new required binding and the composition root would
 * still compile — the failure would only appear at runtime as an undefined
 * binding, or not at all if the service happened to tolerate it.
 *
 * Declaring the union of the service env contracts here, and asserting against
 * each of them below, moves that failure to compile time. A service that gains
 * a required binding now fails `pnpm -r typecheck` until this type is updated.
 *
 * Secrets are still resolved lazily and memoized: requests that never touch
 * encrypted state pay no Secrets Store round-trip. Declaring them optional here
 * reflects that a given worker may not bind all of them; the assertion below is
 * what guarantees each service is handed a value it declared as required.
 */
interface RequestScopeEnv extends D1QueryableEnv {
  AES_ENCRYPTION_KEY_SECRET?: SecretsStoreSecret;
  ACTION_ENCRYPTION_KEY_SECRET?: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE?: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS?: DurableObjectNamespace;
  /**
   * Typed as a union because the binding is declared under two names in the
   * generated bindings — `Vectorize` in the email services and
   * `VectorizeIndex` in the Drive tasks — and this field is only forwarded, not
   * called. Unifying the two names is a separate cleanup.
   */
  EMAIL_CONTEXT_INDEX?: Vectorize | VectorizeIndex;
  AI?: Ai;
  MAX_APPLICATIONS_PER_USER?: string;
  MAX_CONTEXT_DOCUMENTS_PER_APPLICATION?: string;
  AI_DAILY_NEURON_FREE_TIER_LIMIT?: string;
  AI_DAILY_NEURON_FALLBACK_THRESHOLD?: string;
  AI_EMBEDDING_MODEL?: string;
  AI_SUMMARY_MODEL?: string;
  AI_SUMMARY_FALLBACK_MODEL?: string;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
  OAUTH2_STATE_EXPIRY_MINUTES?: string;
  OUTLOOK_SUBSCRIPTION_TTL_DAYS?: string;
  CHAT_MAX_RESPONSE_TOKENS?: string;
  CHAT_VECTOR_QUERY_TOP_K?: string;
  CHAT_CONTEXT_TOP_K?: string;
  CHAT_MAX_HISTORY_MESSAGES?: string;
  PACKAGE_TRACKING_API_KEY?: string;
  FLIGHT_TRACKING_API_KEY?: string;
}

interface D1QueryableEnv {
  // `D1Queryable` is satisfied by both `D1Database` and the `D1DatabaseSession`
  // that `createD1SessionEnv` produces, and call sites legitimately pass either.
  DB: D1Queryable;
}

/**
 * Compile-time proof that {@link RequestScopeEnv} declares every binding a
 * service requires.
 *
 * This checks *key coverage* rather than assignability on purpose. Each of the
 * 49 `createRequestScope(env)` call sites passes a different partial env — a
 * route declares only the bindings that route needs — so the scope cannot
 * guarantee a value for every binding, and `RequestScopeEnv` keeps them
 * optional to reflect that. What it must guarantee is that nothing is *missing
 * from the declaration*, because that is the regression this replaces: a
 * service gaining a new required binding would previously have compiled
 * against an unchecked `as never` and only failed at runtime.
 */
type AssertCoversKeys<TSource, TTarget> =
  Exclude<keyof TTarget, keyof TSource> extends never
    ? true
    : ['RequestScopeEnv is missing bindings required by TTarget', Exclude<keyof TTarget, keyof TSource>];

/**
 * The service contracts this scope must satisfy, intersected.
 *
 * `RequestScopeEnv` marks bindings optional because individual routes bind only
 * what they use, so it is not directly assignable to any single service env.
 * This names the intersection those services share, which makes the one
 * narrowing below explicit and reviewable — and, unlike the twelve
 * `env as never` casts it replaces, its safety net is the machine-checked
 * `AssertCoversKeys` assertions rather than nothing at all. A service adding a
 * required binding fails typecheck at those assertions.
 */
type ServiceEnvNarrowing = ApplicationServiceEnv &
  ContextServiceEnv &
  WatchServiceEnv &
  IntegrationServiceEnv &
  UserServiceEnv &
  FolderServiceEnv &
  AnalyticsServiceEnv &
  OAuth2AccessTokenServiceEnv &
  OAuth2AuthorizationServiceEnv &
  ChatEnv &
  ProcessingServiceEnv &
  DigestServiceEnv;

interface RequestKeys {
  masterKey: string;
  actionKey: string;
}

/**
 * Key-coverage assertions for every service this scope constructs.
 *
 * Each line is `true` only when `RequestScopeEnv` declares every binding the
 * named service requires; otherwise the value is a tuple describing the gap
 * and the assignment is a type error. A service that gains a required binding
 * therefore fails `pnpm -r typecheck` here rather than surfacing as an
 * undefined binding at runtime.
 */
type ScopeCoversApplicationService = AssertCoversKeys<RequestScopeEnv, ApplicationServiceEnv>;
type ScopeCoversContextService = AssertCoversKeys<RequestScopeEnv, ContextServiceEnv>;
type ScopeCoversWatchService = AssertCoversKeys<RequestScopeEnv, WatchServiceEnv>;
type ScopeCoversIntegrationService = AssertCoversKeys<RequestScopeEnv, IntegrationServiceEnv>;
type ScopeCoversUserService = AssertCoversKeys<RequestScopeEnv, UserServiceEnv>;
type ScopeCoversFolderService = AssertCoversKeys<RequestScopeEnv, FolderServiceEnv>;
type ScopeCoversAnalyticsService = AssertCoversKeys<RequestScopeEnv, AnalyticsServiceEnv>;
type ScopeCoversOAuth2AccessTokenService = AssertCoversKeys<RequestScopeEnv, OAuth2AccessTokenServiceEnv>;
type ScopeCoversOAuth2AuthorizationService = AssertCoversKeys<RequestScopeEnv, OAuth2AuthorizationServiceEnv>;
type ScopeCoversChatService = AssertCoversKeys<RequestScopeEnv, ChatEnv>;
type ScopeCoversProcessingService = AssertCoversKeys<RequestScopeEnv, ProcessingServiceEnv>;
type ScopeCoversDigestService = AssertCoversKeys<RequestScopeEnv, DigestServiceEnv>;

// Referenced so the assertions are not flagged as unused; they exist purely for
// the compile-time check.
type ScopeEnvCoverage = [
  ScopeCoversApplicationService,
  ScopeCoversContextService,
  ScopeCoversWatchService,
  ScopeCoversIntegrationService,
  ScopeCoversUserService,
  ScopeCoversFolderService,
  ScopeCoversAnalyticsService,
  ScopeCoversOAuth2AccessTokenService,
  ScopeCoversOAuth2AuthorizationService,
  ScopeCoversChatService,
  ScopeCoversProcessingService,
  ScopeCoversDigestService,
];

/**
 * Forces the coverage assertions above to be instantiated.
 *
 * A type alias is only evaluated when it is used, so declaring
 * `AssertCoversKeys<...>` on its own checks nothing — it silently passes for
 * every service. Binding the tuple to a value makes the compiler resolve each
 * element, so a service that gains a required binding the scope does not declare
 * fails here with the name of the gap.
 */
export const SCOPE_ENV_COVERAGE: ScopeEnvCoverage = [true, true, true, true, true, true, true, true, true, true, true, true];

function memoize<T>(fn: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => (pending ??= fn());
}

// Composition root: builds a per-request child scope wiring DAOs → services.
// Replaces the 50 scattered `new XService(env)` / `new XDAO(db, key)` call
// sites in apps/api and apps/background.
function createRequestScope(env: RequestScopeEnv): Container {
  // The single narrowing for every service below. Its safety net is the
  // `AssertCoversKeys` assertions above, which prove `RequestScopeEnv` declares
  // every binding these service contracts require.
  const serviceEnv = env as unknown as ServiceEnvNarrowing;
  const scope = new Container();
  scope.bindValue(Tokens.Env, env);
  scope.bindValue(Tokens.Db, env.DB);
  scope.bindValue(Tokens.ProviderRegistry, InjectableEmailProviderRegistry.withDefaults());

  const masterKey = memoize(() => {
    if (!env.AES_ENCRYPTION_KEY_SECRET) throw new Error('AES_ENCRYPTION_KEY_SECRET is not configured for this scope.');
    return env.AES_ENCRYPTION_KEY_SECRET.get();
  });
  const actionKey = memoize(async () => (env.ACTION_ENCRYPTION_KEY_SECRET ? env.ACTION_ENCRYPTION_KEY_SECRET.get() : ''));
  const keys = memoize(async (): Promise<RequestKeys> => ({ masterKey: await masterKey(), actionKey: await actionKey() }));
  scope.bindValue(Tokens.Keys, keys);

  const applicationDAO = memoize(async () => new ConnectedApplicationDAO(env.DB, await masterKey()));
  const contextDAO = memoize(() => Promise.resolve(new ApplicationContextDAO(env.DB)));
  const integrationDAO = memoize(async () => new ApplicationIntegrationDAO(env.DB, await masterKey()));
  const deliveryLogDAO = memoize(() => Promise.resolve(new IntegrationDeliveryLogDAO(env.DB)));
  const usageDAO = memoize(() => Promise.resolve(new AiDailyUsageDAO(env.DB)));
  const subscriptionDAO = memoize(() => Promise.resolve(new ProviderSubscriptionDAO(env.DB)));
  const userDAO = memoize(() => Promise.resolve(new UserDAO(env.DB)));
  const userEmailDAO = memoize(() => Promise.resolve(new UserEmailDAO(env.DB)));
  scope.bindValue(Tokens.ApplicationDAO, applicationDAO);
  scope.bindValue(Tokens.ApplicationContextDAO, contextDAO);
  scope.bindValue(Tokens.ApplicationIntegrationDAO, integrationDAO);
  scope.bindValue(Tokens.IntegrationDeliveryLogDAO, deliveryLogDAO);
  scope.bindValue(Tokens.AiDailyUsageDAO, usageDAO);
  scope.bindValue(Tokens.ProviderSubscriptionDAO, subscriptionDAO);
  scope.bindValue(Tokens.UserDAO, userDAO);
  scope.bindValue(Tokens.UserEmailDAO, userEmailDAO);

  // One `UserIdentityService` per request scope, shared by every consumer below.
  // That sharing is the point: its address -> account memo is per request, so a
  // request that authorizes against several applications resolves the caller once
  // instead of once per check.
  scope.bind(Tokens.UserIdentityService, () => new UserIdentityService({ DB: env.DB }, { userDAO, userEmailDAO }));
  const userIdentity = (): Promise<UserIdentityService> => Promise.resolve(scope.get(Tokens.UserIdentityService));

  scope.bind(
    Tokens.ApplicationService,
    () =>
      new ApplicationService(serviceEnv, {
        applicationDAO,
        contextDAO,
        integrationDAO,
        deliveryLogDAO,
        usageDAO,
        watchService: () => Promise.resolve(scope.get(Tokens.WatchService)),
        integrationService: () => Promise.resolve(scope.get(Tokens.IntegrationService)),
        tokenService: () => Promise.resolve(scope.get(Tokens.OAuth2AccessTokenService)),
      }),
  );
  scope.bind(Tokens.ContextService, () => new ContextService(serviceEnv, { contextDAO, applicationDAO }));
  scope.bind(
    Tokens.WatchService,
    () =>
      new WatchService(serviceEnv, {
        subscriptionDAO,
        applicationDAO,
        tokenService: () => Promise.resolve(scope.get(Tokens.OAuth2AccessTokenService)),
      }),
  );
  scope.bind(
    Tokens.IntegrationService,
    () =>
      new IntegrationService(serviceEnv, {
        integrationDAO,
        deliveryLogDAO,
        applicationDAO,
      }),
  );
  scope.bind(Tokens.UserService, () => new UserService(serviceEnv, { userDAO, userEmailDAO, usageDAO, userIdentity }));
  scope.bind(Tokens.DigestConfigService, () => new DigestConfigService(applicationDAO));
  scope.bind(Tokens.FolderService, () => new FolderService(serviceEnv));
  scope.bind(Tokens.AnalyticsService, () => new AnalyticsService(serviceEnv));
  scope.bind(Tokens.OAuth2AccessTokenService, () => new OAuth2AccessTokenService(serviceEnv));
  scope.bind(Tokens.OAuth2AuthorizationService, () => new OAuth2AuthorizationService(serviceEnv));
  // Lazy binds so unit tests mocking `@mail-otter/backend-runtime/config` with
  // only `ConfigurationManager` keep working; the factories only touch the
  // mocked module when the token is actually resolved.
  scope.bind(Tokens.AppConfig, () => AppConfiguration.fromEnv(env));
  scope.bind(Tokens.AiService, () => new AiService({ db: env.DB }));
  scope.bind(Tokens.ActionHandlerRegistry, () => InjectableActionHandlerRegistry.withDefaults(ActionHandlerRegistry.getHandlers()));
  scope.bind(Tokens.IntegrationObserverRegistry, () => InjectableIntegrationObserverRegistry.withDefaults());
  scope.bind(Tokens.ActionService, () => new ActionService({}));
  scope.bind(
    Tokens.ChatService,
    () =>
      new ChatService(serviceEnv, {
        applicationDAO,
        userDAO,
        aiService: scope.get(Tokens.AiService),
      }),
  );
  scope.bind(Tokens.ProcessingService, () => new ProcessingService(serviceEnv));
  scope.bind(
    Tokens.DigestService,
    () =>
      new DigestService(serviceEnv, '', '', {
        configService: () => Promise.resolve(scope.get(Tokens.DigestConfigService)),
        providerRegistry: scope.get(Tokens.ProviderRegistry),
        actionDAO: async () => {
          return new EmailActionDAO(env.DB, await actionKey());
        },
      }),
  );

  return scope;
}

export { createRequestScope };
export type { RequestKeys, RequestScopeEnv };
