import type { UserScope } from '@mail-otter/backend-data/dao';
import { NotFoundError } from '@mail-otter/backend-errors';
import type { IntegrationDeliveryLog, OutboundIntegration } from '@mail-otter/shared/model';
import type { ApplicationServiceDeps } from './ApplicationServiceTypes';

/**
 * Integrations slice of `ApplicationService`.
 */
class ApplicationIntegrationService {
  constructor(
    private readonly deps: Required<
      Pick<ApplicationServiceDeps, 'applicationDAO' | 'integrationDAO' | 'deliveryLogDAO' | 'integrationService'>
    >,
  ) {}

  public async listIntegrations(scope: UserScope, applicationId: string): Promise<OutboundIntegration[]> {
    await this.assertOwnership(scope, applicationId);
    const integrationDAO = await this.deps.integrationDAO();
    return integrationDAO.listByApplicationId(applicationId);
  }

  public async createIntegration(
    scope: UserScope,
    input: { applicationId: string; integrationType: OutboundIntegration['integrationType']; name: string; webhookUrl: string },
  ): Promise<OutboundIntegration> {
    await this.assertOwnership(scope, input.applicationId);
    const integrationDAO = await this.deps.integrationDAO();
    return integrationDAO.create(input.applicationId, input.integrationType, input.name, input.webhookUrl);
  }

  public async updateIntegration(
    scope: UserScope,
    input: { integrationId: string; name?: string; enabled?: boolean; webhookUrl?: string },
  ): Promise<OutboundIntegration> {
    const dao = await this.deps.integrationDAO();
    const existing = await dao.getByIdForUser(input.integrationId, scope);
    if (!existing) throw new NotFoundError('Integration not found.');
    return dao.update(input.integrationId, { name: input.name, enabled: input.enabled, webhookUrl: input.webhookUrl });
  }

  public async deleteIntegration(scope: UserScope, integrationId: string): Promise<void> {
    const dao = await this.deps.integrationDAO();
    const existing = await dao.getByIdForUser(integrationId, scope);
    if (!existing) throw new NotFoundError('Integration not found.');
    await dao.deleteById(integrationId);
  }

  public async testIntegration(scope: UserScope, integrationId: string): Promise<void> {
    const dao = await this.deps.integrationDAO();
    const integration = await dao.getByIdForUser(integrationId, scope);
    if (!integration) throw new NotFoundError('Integration not found.');
    const integrationService = await this.deps.integrationService();
    await integrationService.sendTestNotification(integration);
  }

  public async listIntegrationDeliveries(scope: UserScope, integrationId: string, limit: number): Promise<IntegrationDeliveryLog[]> {
    const integrationDao = await this.deps.integrationDAO();
    const integration = await integrationDao.getByIdForUser(integrationId, scope);
    if (!integration) throw new NotFoundError('Integration not found.');
    const logDao = await this.deps.deliveryLogDAO();
    return logDao.listByIntegrationId(integrationId, limit);
  }

  private async assertOwnership(scope: UserScope, applicationId: string): Promise<void> {
    const dao = await this.deps.applicationDAO();
    const app = await dao.getMetadataByIdForUser(applicationId, scope);
    if (!app) throw new NotFoundError('Connected application not found.');
  }
}

export { ApplicationIntegrationService };
