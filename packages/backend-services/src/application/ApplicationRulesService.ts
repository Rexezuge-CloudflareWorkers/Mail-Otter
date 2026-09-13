import type { ConnectedApplicationDAO } from '@mail-otter/backend-data/dao';
import { BadRequestError, NotFoundError } from '@mail-otter/backend-errors';
import type { EmailProcessingRule } from '@mail-otter/shared/model';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { EmailRuleSuggestionUtil } from '../email/EmailRuleSuggestionUtil';
import { AiUsageUtil } from '../email/AiUsageUtil';
import type { AiTextGenerationUsage } from '../email/WorkersAiResponseUtil';
import { EmailProviderRegistry } from '../provider/EmailProviderRegistry';
import type { ApplicationServiceDeps, ApplicationServiceEnv } from './ApplicationServiceTypes';

/**
 * Rules + labels slice of `ApplicationService`.
 */
class ApplicationRulesService {
  constructor(
    private readonly env: ApplicationServiceEnv,
    private readonly deps: Required<Pick<ApplicationServiceDeps, 'applicationDAO' | 'usageDAO' | 'tokenService'>>,
  ) {}

  public async listLabels(userEmail: string, applicationId: string): Promise<Array<{ id: string; name: string }>> {
    await this.assertOwnership(userEmail, applicationId);
    if (!this.env.OAUTH2_TOKEN_CACHE || !this.env.OAUTH2_TOKEN_REFRESHERS) return [];
    try {
      const tokenService = await this.deps.tokenService();
      const accessToken = await tokenService.getAccessToken(applicationId);
      const dao: ConnectedApplicationDAO = await this.deps.applicationDAO();
      const app = await dao.getMetadataByIdForUser(applicationId, userEmail);
      if (!app) return [];
      const provider = EmailProviderRegistry.get(app.providerId, app.connectionMethod);
      return (await provider.listLabels?.(accessToken)) ?? [];
    } catch (error: unknown) {
      console.warn('[ApplicationService] listLabels failed:', error);
      return [];
    }
  }

  public async getRules(userEmail: string, applicationId: string): Promise<EmailProcessingRule[]> {
    await this.assertOwnership(userEmail, applicationId);
    const dao = await this.deps.applicationDAO();
    const app = await dao.getMetadataByIdForUser(applicationId, userEmail);
    return app?.emailProcessingRules ?? [];
  }

  public async updateRules(userEmail: string, applicationId: string, rules: EmailProcessingRule[]) {
    await this.assertOwnership(userEmail, applicationId);
    const dao = await this.deps.applicationDAO();
    const updated = await dao.updateEmailProcessingRulesForUser(applicationId, userEmail, rules);
    if (!updated) throw new NotFoundError('Connected application not found.');
    return updated;
  }

  public async suggestRule(userEmail: string, applicationId: string, description: string): Promise<Omit<EmailProcessingRule, 'ruleId'>> {
    if (!this.env.AI) throw new BadRequestError('AI is not configured.');
    await this.assertOwnership(userEmail, applicationId);
    const model = ConfigurationManager.getEmailSummaryModel(this.env);
    const { rule, usage } = await EmailRuleSuggestionUtil.suggestWithUsage(this.env.AI, model, description);
    await this.recordRuleSuggestionUsage(model, usage, description, rule);
    return rule;
  }

  private async recordRuleSuggestionUsage(
    model: string,
    usage: AiTextGenerationUsage | undefined,
    description: string,
    rule: Omit<EmailProcessingRule, 'ruleId'>,
  ): Promise<void> {
    try {
      const estimate = AiUsageUtil.estimateTextGenerationUsage(model, usage, description, JSON.stringify(rule));
      const usageDAO = await this.deps.usageDAO();
      await usageDAO.incrementUsage({
        usageDate: AiUsageUtil.getCurrentUtcUsageDate(),
        estimatedNeurons: estimate.estimatedNeurons,
        promptTokens: estimate.promptTokens,
        completionTokens: estimate.completionTokens,
      });
    } catch (error: unknown) {
      console.warn('Failed to record rule suggestion usage estimate:', error);
    }
  }

  private async assertOwnership(userEmail: string, applicationId: string): Promise<void> {
    const dao = await this.deps.applicationDAO();
    const app = await dao.getMetadataByIdForUser(applicationId, userEmail);
    if (!app) throw new NotFoundError('Connected application not found.');
  }
}

export { ApplicationRulesService };
