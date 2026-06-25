import type { ConnectedApplication, EmailProcessingRule } from '@mail-otter/shared/model';
import { EmailProviderRegistry } from '../provider/EmailProviderRegistry';
import type { IEmailProvider } from '../provider/IEmailProvider';
import { OAuth2AccessTokenService } from '../oauth2/OAuth2AccessTokenService';
import type { OAuth2AccessTokenServiceEnv } from '../oauth2/OAuth2AccessTokenService';

type ProviderOrganizationEnv = OAuth2AccessTokenServiceEnv;

class ProviderOrganizationService {
  constructor(private readonly env: ProviderOrganizationEnv) {}

  async executePostProcessingRules(
    application: ConnectedApplication,
    messageId: string,
    matchedRules: EmailProcessingRule[],
  ): Promise<void> {
    const accessToken = await new OAuth2AccessTokenService(this.env).getAccessToken(application.applicationId);
    const provider = EmailProviderRegistry.get(application.providerId, application.connectionMethod);

    const results = await Promise.allSettled(
      matchedRules.map((rule) => this.executeRule(provider, accessToken, messageId, rule)),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('[ProviderOrganizationService] Post-processing rule execution failed:', result.reason);
      }
    }
  }

  private async executeRule(
    provider: IEmailProvider,
    accessToken: string,
    messageId: string,
    rule: EmailProcessingRule,
  ): Promise<void> {
    try {
      switch (rule.action.type) {
        case 'apply_label': {
          if (!provider.applyLabel) {
            console.warn(`[ProviderOrganizationService] Provider ${provider.providerId} does not support applyLabel`);
            return;
          }
          await provider.applyLabel(accessToken, messageId, rule.action.labelName);
          break;
        }
        case 'archive_message': {
          if (!provider.archiveMessage) {
            console.warn(`[ProviderOrganizationService] Provider ${provider.providerId} does not support archiveMessage`);
            return;
          }
          await provider.archiveMessage(accessToken, messageId);
          break;
        }
        case 'mark_read': {
          if (!provider.markRead) {
            console.warn(`[ProviderOrganizationService] Provider ${provider.providerId} does not support markRead`);
            return;
          }
          await provider.markRead(accessToken, messageId);
          break;
        }
        case 'star_message': {
          if (!provider.starMessage) {
            console.warn(`[ProviderOrganizationService] Provider ${provider.providerId} does not support starMessage`);
            return;
          }
          await provider.starMessage(accessToken, messageId);
          break;
        }
        default: {
          break;
        }
      }
    } catch (error: unknown) {
      console.error(`[ProviderOrganizationService] Rule "${rule.name}" (${rule.action.type}) failed for message ${messageId}:`, error);
      throw error;
    }
  }
}

export { ProviderOrganizationService };
export type { ProviderOrganizationEnv };
