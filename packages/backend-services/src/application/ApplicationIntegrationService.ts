import { NotFoundError } from '@mail-otter/backend-errors';
import type { IntegrationDeliveryLog, OutboundIntegration } from '@mail-otter/shared/model';
import type { ApplicationServiceDeps } from './ApplicationServiceTypes';

/**
 * Integrations slice of `ApplicationService`.
 */
class ApplicationIntegrationService {
  constructor(private readonly deps: Required<Pick<ApplicationServiceDeps, 'applicationDAO' | 'integrationDAO' | 'deliveryLogDAO' | 'integrationService'>>) {}

  public async listIntegrations(userEmail: string, applicationId: string): Promise<OutboundIntegration[]> {
    await this.assertOwnership(userEmail, applicationId);
    const integrationDAO = await this.deps.integrationDAO();
    return integrationDAO.listByApplicationId(applicationId);
  }

  public async createIntegration(
    userEmail: string,
    input: { applicationId: string; integrationType: OutboundIntegration['integrationType']; name: string; webhookUrl: string },
  ): Promise<OutboundIntegration> {
    await this.assertOwnership(userEmail, input.applicationId);
    const integrationDAO = await this.deps.integrationDAO();
    return integrationDAO.create(input.applicationId, input.integrationType, input.name, input.webhookUrl);
  }

  public async updateIntegration(
    userEmail: string,
    input: { integrationId: string; name?: string; enabled?: boolean; webhookUrl?: string },
  ): Promise<OutboundIntegration> {
    const dao = await this.deps.integrationDAO();
    const existing = await dao.getByIdForUser(input.integrationId, userEmail);
    if (!existing) throw new NotFoundError('Integration not found.');
    return dao.update(input.integrationId, { name: input.name, enabled: input.enabled, webhookUrl: input.webhookUrl });
  }

  public async deleteIntegration(userEmail: string, integrationId: string): Promise<void> {
    const dao = await this.deps.integrationDAO();
    const existing = await dao.getByIdForUser(integrationId, userEmail);
    if (!existing) throw new NotFoundError('Integration not found.');
    await dao.deleteById(integrationId);
  }

  public async testIntegration(userEmail: string, integrationId: string): Promise<void> {
    const dao = await this.deps.integrationDAO();
    const integration = await dao.getByIdForUser(integrationId, userEmail);
    if (!integration) throw new NotFoundError('Integration not found.');
    const integrationService = await this.deps.integrationService();
    await integrationService.sendTestNotification(integration);
  }

  public async listIntegrationDeliveries(userEmail: string, integrationId: string, limit: number): Promise<IntegrationDeliveryLog[]> {
    const integrationDao = await this.deps.integrationDAO();
    const integration = await integrationDao.getByIdForUser(integrationId, userEmail);
    if (!integration) throw new NotFoundError('Integration not found.');
    const logDao = await this.deps.deliveryLogDAO();
    return logDao.listByIntegrationId(integrationId, limit);
  }

  private async assertOwnership(userEmail: string, applicationId: string): Promise<void> {
    const dao = await this.deps.applicationDAO();
    const app = await dao.getMetadataByIdForUser(applicationId, userEmail);
    if (!app) throw new NotFoundError('Connected application not found.');
  }
}

export { ApplicationIntegrationService };
