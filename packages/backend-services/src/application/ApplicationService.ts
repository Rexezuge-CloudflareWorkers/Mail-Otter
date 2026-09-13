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
      contextDAO: () => Promise.resolve(new ApplicationContextDAO(db),),
      integrationDAO: async () => new ApplicationIntegrationDAO(db, await masterKey()),
      deliveryLogDAO: () => Promise.resolve(new IntegrationDeliveryLogDAO(db),),
      usageDAO: () => Promise.resolve(new AiDailyUsageDAO(db),),
      tokenCacheDAO: async () => new OAuth2AccessTokenCacheDAO(env.OAUTH2_TOKEN_CACHE as KVNamespace, await masterKey()),
      watchService: () => Promise.resolve(new WatchService(env as WatchServiceEnv),),
      integrationService: () => Promise.resolve(new IntegrationService(env),),
      tokenService: () => Promise.resolve(new OAuth2AccessTokenService(env as OAuth2AccessTokenServiceEnv),),
      ...deps,
    };
    this.crud = new ApplicationCrudService(env, full);
    this.rules = new ApplicationRulesService(env, full);
    this.integrations = new ApplicationIntegrationService(full);
  }

  public listUserApplications(userEmail: string, raw: Request): Promise<ApplicationResponse[]> {
    return this.crud.listUserApplications(userEmail, raw);
  }

  public createUserApplication(userEmail: string, input: CreateUserApplicationInput, raw: Request): Promise<ApplicationResponse> {
    return this.crud.createUserApplication(userEmail, input, raw);
  }

  public updateUserApplication(userEmail: string, input: UpdateUserApplicationInput, raw: Request): Promise<ApplicationResponse> {
    return this.crud.updateUserApplication(userEmail, input, raw);
  }

  public updateWatchedFolderIds(userEmail: string, input: UpdateWatchedFolderIdsInput, raw: Request): Promise<ApplicationResponse> {
    return this.crud.updateWatchedFolderIds(userEmail, input, raw);
  }

  public deleteUserApplication(userEmail: string, applicationId: string): Promise<void> {
    return this.crud.deleteUserApplication(userEmail, applicationId);
  }

  public getOwnedApplication(userEmail: string, applicationId: string) {
    return this.crud.getOwnedApplication(userEmail, applicationId);
  }

  public acknowledgeApplicationError(userEmail: string, applicationId: string, errorType: 'processing' | 'context', raw: Request) {
    return this.crud.acknowledgeApplicationError(userEmail, applicationId, errorType, raw);
  }

  public listIntegrations(userEmail: string, applicationId: string): Promise<OutboundIntegration[]> {
    return this.integrations.listIntegrations(userEmail, applicationId);
  }

  public createIntegration(userEmail: string, input: CreateIntegrationInput): Promise<OutboundIntegration> {
    return this.integrations.createIntegration(userEmail, input);
  }

  public updateIntegration(userEmail: string, input: UpdateIntegrationInput): Promise<OutboundIntegration> {
    return this.integrations.updateIntegration(userEmail, input);
  }

  public deleteIntegration(userEmail: string, integrationId: string): Promise<void> {
    return this.integrations.deleteIntegration(userEmail, integrationId);
  }

  public testIntegration(userEmail: string, integrationId: string): Promise<void> {
    return this.integrations.testIntegration(userEmail, integrationId);
  }

  public listIntegrationDeliveries(userEmail: string, integrationId: string, limit: number): Promise<IntegrationDeliveryLog[]> {
    return this.integrations.listIntegrationDeliveries(userEmail, integrationId, limit);
  }

  public listLabels(userEmail: string, applicationId: string): Promise<Array<{ id: string; name: string }>> {
    return this.rules.listLabels(userEmail, applicationId);
  }

  public getRules(userEmail: string, applicationId: string): Promise<EmailProcessingRule[]> {
    return this.rules.getRules(userEmail, applicationId);
  }

  public updateRules(userEmail: string, applicationId: string, rules: EmailProcessingRule[]) {
    return this.rules.updateRules(userEmail, applicationId, rules);
  }

  public suggestRule(userEmail: string, applicationId: string, description: string) {
    return this.rules.suggestRule(userEmail, applicationId, description);
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
