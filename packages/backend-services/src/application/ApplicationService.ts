import {
  AiDailyUsageDAO,
  ApplicationContextDAO,
  ApplicationIntegrationDAO,
  ConnectedApplicationDAO,
  IntegrationDeliveryLogDAO,
  OAuth2AccessTokenCacheDAO,
} from '@mail-otter/backend-data/dao';
import type { EmailProcessingRule, IntegrationDeliveryLog, OutboundIntegration } from '@mail-otter/shared/model';
import { IntegrationService } from '../integration/IntegrationService';
import { WatchService } from '../subscription/WatchService';
import type { WatchServiceEnv } from '../subscription/WatchService';
import { OAuth2AccessTokenService } from '../oauth2/OAuth2AccessTokenService';
import type { OAuth2AccessTokenServiceEnv } from '../oauth2/OAuth2AccessTokenService';
import type { UserScope } from '@mail-otter/backend-data/dao';
import type { ApplicationResponse } from './ApplicationResponseUtil';
import { ApplicationCrudService } from './ApplicationCrudService';
import { ApplicationRulesService } from './ApplicationRulesService';
import { ApplicationIntegrationService } from './ApplicationIntegrationService';
import type {
  ApplicationServiceDeps,
  ApplicationServiceEnv,
  CreateIntegrationInput,
  CreateUserApplicationInput,
  UpdateIntegrationInput,
  UpdateUserApplicationInput,
  UpdateWatchedFolderIdsInput,
} from './ApplicationServiceTypes';

/**
 * Thin facade over the application domain slices (CRUD / rules / integrations).
 *
 * Previously a 443-line god-class mixing all three concerns. New code may
 * import the slices directly; this facade preserves the existing public API
 * used by routes and tests.
 */
class ApplicationService {
  private readonly crud: ApplicationCrudService;
  private readonly rules: ApplicationRulesService;
  private readonly integrations: ApplicationIntegrationService;

  constructor(
    private readonly env: ApplicationServiceEnv,
    deps: ApplicationServiceDeps = {},
  ) {
    const db = env.DB;
    const masterKey = (): Promise<string> => env.AES_ENCRYPTION_KEY_SECRET.get();
    const full: Required<ApplicationServiceDeps> = {
      applicationDAO: async () => new ConnectedApplicationDAO(db, await masterKey()),
      contextDAO: () => Promise.resolve(new ApplicationContextDAO(db)),
      integrationDAO: async () => new ApplicationIntegrationDAO(db, await masterKey()),
      deliveryLogDAO: () => Promise.resolve(new IntegrationDeliveryLogDAO(db)),
      usageDAO: () => Promise.resolve(new AiDailyUsageDAO(db)),
      tokenCacheDAO: async () => new OAuth2AccessTokenCacheDAO(env.OAUTH2_TOKEN_CACHE as KVNamespace, await masterKey()),
      watchService: () => Promise.resolve(new WatchService(env as WatchServiceEnv)),
      integrationService: () => Promise.resolve(new IntegrationService(env)),
      tokenService: () => Promise.resolve(new OAuth2AccessTokenService(env as OAuth2AccessTokenServiceEnv)),
      ...deps,
    };
    this.crud = new ApplicationCrudService(env, full);
    this.rules = new ApplicationRulesService(env, full);
    this.integrations = new ApplicationIntegrationService(full);
  }

  public listUserApplications(scope: UserScope, raw: Request): Promise<ApplicationResponse[]> {
    return this.crud.listUserApplications(scope, raw);
  }

  public createUserApplication(scope: UserScope, input: CreateUserApplicationInput, raw: Request): Promise<ApplicationResponse> {
    return this.crud.createUserApplication(scope, input, raw);
  }

  public updateUserApplication(scope: UserScope, input: UpdateUserApplicationInput, raw: Request): Promise<ApplicationResponse> {
    return this.crud.updateUserApplication(scope, input, raw);
  }

  public updateWatchedFolderIds(scope: UserScope, input: UpdateWatchedFolderIdsInput, raw: Request): Promise<ApplicationResponse> {
    return this.crud.updateWatchedFolderIds(scope, input, raw);
  }

  public deleteUserApplication(scope: UserScope, applicationId: string): Promise<void> {
    return this.crud.deleteUserApplication(scope, applicationId);
  }

  public getOwnedApplication(scope: UserScope, applicationId: string) {
    return this.crud.getOwnedApplication(scope, applicationId);
  }

  public acknowledgeApplicationError(scope: UserScope, applicationId: string, errorType: 'processing' | 'context', raw: Request) {
    return this.crud.acknowledgeApplicationError(scope, applicationId, errorType, raw);
  }

  public listIntegrations(scope: UserScope, applicationId: string): Promise<OutboundIntegration[]> {
    return this.integrations.listIntegrations(scope, applicationId);
  }

  public createIntegration(scope: UserScope, input: CreateIntegrationInput): Promise<OutboundIntegration> {
    return this.integrations.createIntegration(scope, input);
  }

  public updateIntegration(scope: UserScope, input: UpdateIntegrationInput): Promise<OutboundIntegration> {
    return this.integrations.updateIntegration(scope, input);
  }

  public deleteIntegration(scope: UserScope, integrationId: string): Promise<void> {
    return this.integrations.deleteIntegration(scope, integrationId);
  }

  public testIntegration(scope: UserScope, integrationId: string): Promise<void> {
    return this.integrations.testIntegration(scope, integrationId);
  }

  public listIntegrationDeliveries(scope: UserScope, integrationId: string, limit: number): Promise<IntegrationDeliveryLog[]> {
    return this.integrations.listIntegrationDeliveries(scope, integrationId, limit);
  }

  public listLabels(scope: UserScope, applicationId: string): Promise<Array<{ id: string; name: string }>> {
    return this.rules.listLabels(scope, applicationId);
  }

  public getRules(scope: UserScope, applicationId: string): Promise<EmailProcessingRule[]> {
    return this.rules.getRules(scope, applicationId);
  }

  public updateRules(scope: UserScope, applicationId: string, rules: EmailProcessingRule[]) {
    return this.rules.updateRules(scope, applicationId, rules);
  }

  public suggestRule(scope: UserScope, applicationId: string, description: string) {
    return this.rules.suggestRule(scope, applicationId, description);
  }
}

const ApplicationServiceFactory = {
  create(env: ApplicationServiceEnv): ApplicationService {
    return new ApplicationService(env);
  },
};

export { ApplicationService, ApplicationServiceFactory };
export { ApplicationResponseUtil } from './ApplicationResponseUtil';
export type {
  ApplicationServiceDeps,
  ApplicationServiceEnv,
  CreateIntegrationInput,
  CreateUserApplicationInput,
  UpdateIntegrationInput,
  UpdateUserApplicationInput,
  UpdateWatchedFolderIdsInput,
} from './ApplicationServiceTypes';

export { type ApplicationResponse } from './ApplicationResponseUtil';
