import {
  AiDailyUsageDAO,
  ApplicationContextDAO,
  ApplicationIntegrationDAO,
  ConnectedApplicationDAO,
  IntegrationDeliveryLogDAO,
  ProviderSubscriptionDAO,
  UserDAO,
} from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { Container } from '@mail-otter/backend-runtime/di';
// NOTE: service imports use the package entry points (`@mail-otter/...`)
// rather than relative file paths so route unit tests mocking those modules
// (`vi.mock('@mail-otter/backend-services/application', ...)`) keep working
// after migration to `scope.get(...)`. Runtime behavior is identical.
import { AnalyticsService } from '@mail-otter/backend-services/analytics';
import { ApplicationService, FolderService } from '@mail-otter/backend-services/application';
import { DigestConfigService } from '@mail-otter/backend-services/digest';
import { ContextService } from '@mail-otter/backend-services/email';
import { IntegrationService } from '@mail-otter/backend-services/integration';
import { OAuth2AccessTokenService, OAuth2AuthorizationService } from '@mail-otter/backend-services/oauth2';
import { InjectableEmailProviderRegistry } from '../provider/InjectableEmailProviderRegistry';
import { WatchService } from '@mail-otter/backend-services/subscription';
import { UserService } from '@mail-otter/backend-services/user';
import { Tokens } from './tokens';

// Minimal structural env for scope creation. Secrets are resolved lazily and
// memoized — requests that never touch encrypted state pay no Secrets Store
// round-trip.
//
// NOTE: no `[key: string]: unknown` index signature on purpose — interfaces
// (e.g. endpoint `*Env`) do not carry an implicit index signature, so a target
// with one would reject every `createRequestScope(env)` call site. Extra
// bindings are still assignable structurally; services receive `env as never`.
interface RequestScopeEnv {
  DB: D1Queryable;
  AES_ENCRYPTION_KEY_SECRET: { get(): Promise<string> };
  ACTION_ENCRYPTION_KEY_SECRET?: { get(): Promise<string> };
}

interface RequestKeys {
  masterKey: string;
  actionKey: string;
}

function memoize<T>(fn: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => (pending ??= fn());
}

// Composition root: builds a per-request child scope wiring DAOs → services.
// Replaces the 50 scattered `new XService(env)` / `new XDAO(db, key)` call
// sites in apps/api and apps/background.
function createRequestScope(env: RequestScopeEnv): Container {
  const scope = new Container();
  scope.bindValue(Tokens.Env, env);
  scope.bindValue(Tokens.Db, env.DB);
  scope.bindValue(Tokens.ProviderRegistry, InjectableEmailProviderRegistry.withDefaults());

  const masterKey = memoize(() => env.AES_ENCRYPTION_KEY_SECRET.get());
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
  scope.bindValue(Tokens.ApplicationDAO, applicationDAO);
  scope.bindValue(Tokens.ApplicationContextDAO, contextDAO);
  scope.bindValue(Tokens.ApplicationIntegrationDAO, integrationDAO);
  scope.bindValue(Tokens.IntegrationDeliveryLogDAO, deliveryLogDAO);
  scope.bindValue(Tokens.AiDailyUsageDAO, usageDAO);
  scope.bindValue(Tokens.ProviderSubscriptionDAO, subscriptionDAO);
  scope.bindValue(Tokens.UserDAO, userDAO);

  scope.bind(
    Tokens.ApplicationService,
    () =>
      new ApplicationService(env as never, {
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
  scope.bind(Tokens.ContextService, () => new ContextService(env as never, { contextDAO, applicationDAO }));
  scope.bind(
    Tokens.WatchService,
    () =>
      new WatchService(env as never, {
        subscriptionDAO,
        applicationDAO,
        tokenService: () => Promise.resolve(scope.get(Tokens.OAuth2AccessTokenService)),
      }),
  );
  scope.bind(
    Tokens.IntegrationService,
    () =>
      new IntegrationService(env as never, {
        integrationDAO,
        deliveryLogDAO,
        applicationDAO,
      }),
  );
  scope.bind(Tokens.UserService, () => new UserService(env as never, { userDAO, usageDAO }));
  scope.bind(Tokens.DigestConfigService, () => new DigestConfigService(applicationDAO));
  scope.bind(Tokens.FolderService, () => new FolderService(env as never));
  scope.bind(Tokens.AnalyticsService, () => new AnalyticsService(env as never));
  scope.bind(Tokens.OAuth2AccessTokenService, () => new OAuth2AccessTokenService(env as never));
  scope.bind(Tokens.OAuth2AuthorizationService, () => new OAuth2AuthorizationService(env as never));

  return scope;
}

export { createRequestScope };
export type { RequestKeys, RequestScopeEnv };
