import { ApplicationIntegrationDAO, ConnectedApplicationDAO, IntegrationDeliveryLogDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { getBackendStrings } from '@mail-otter/shared/i18n';
import type { OutboundIntegration } from '@mail-otter/shared/model';
import type { GmailSummaryData, ImapSummaryData, JmapSummaryData, OutlookSummaryData } from '../email/EmailProcessingUtil';
import type { DispatchResult, EmailSummaryNotification } from './observers/IntegrationObserver';
import { IntegrationObserverRegistry } from './observers/IntegrationObserverRegistry';

interface IntegrationServiceEnv {
  DB: D1Queryable;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
}

class IntegrationService {
  constructor(private readonly env: IntegrationServiceEnv) {}

  async sendToIntegrations(summaryData: GmailSummaryData | OutlookSummaryData | JmapSummaryData | ImapSummaryData): Promise<void> {
    const masterKey = await this.env.AES_ENCRYPTION_KEY_SECRET.get();
    const dao = new ApplicationIntegrationDAO(this.env.DB, masterKey);
    const integrations = await dao.listEnabled(summaryData.application.applicationId);
    if (integrations.length === 0) return;

    const notification: EmailSummaryNotification = {
      applicationId: summaryData.application.applicationId,
      emailSubject: summaryData.emailSubject,
      emailFrom: summaryData.emailFrom,
      gist: summaryData.rawSummary.gist,
      keyDetails: summaryData.rawSummary.keyDetails,
      actions: summaryData.actions.map((a) => ({
        type: a.action.actionType,
        title: a.action.title,
        description: a.action.description,
        riskLevel: a.action.riskLevel,
        callbackUrl: a.confirmationUrl,
      })),
      processedAt: Math.floor(Date.now() / 1000),
    };

    const logDao = new IntegrationDeliveryLogDAO(this.env.DB);
    const emailSubject = summaryData.emailSubject?.slice(0, 255) ?? null;

    const locale = summaryData.application.contentLanguage ?? null;

    await Promise.allSettled(
      integrations.map(async (integration) => {
        let result: DispatchResult;
        try {
          const webhookUrl = await dao.getDecryptedWebhookUrl(integration.integrationId);
          result = await this.dispatchToIntegration(integration, webhookUrl, notification, locale);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          result = { status: 'failure', httpStatus: null, errorMessage: msg };
        }
        if (result.status === 'failure') {
          console.warn(
            `[IntegrationService] Failed to dispatch to ${integration.integrationType} integration ${integration.integrationId}: HTTP ${result.httpStatus ?? 'n/a'}`,
          );
        }
        try {
          await logDao.create({
            integrationId: integration.integrationId,
            applicationId: integration.applicationId,
            status: result.status,
            httpStatus: result.httpStatus,
            errorMessage: result.errorMessage?.slice(0, 500) ?? null,
            emailSubject,
          });
        } catch (logError: unknown) {
          console.warn('[IntegrationService] Failed to write delivery log:', logError);
        }
      }),
    );
  }

  async sendTestNotification(integration: OutboundIntegration): Promise<void> {
    const masterKey = await this.env.AES_ENCRYPTION_KEY_SECRET.get();
    const dao = new ApplicationIntegrationDAO(this.env.DB, masterKey);
    const webhookUrl = await dao.getDecryptedWebhookUrl(integration.integrationId);
    const locale = await this.resolveApplicationLocale(integration.applicationId);
    const strings = getBackendStrings(locale);

    const testNotification: EmailSummaryNotification = {
      applicationId: integration.applicationId,
      emailSubject: strings.notify.testSubject,
      emailFrom: strings.notify.testFrom,
      gist: strings.notify.testGist,
      keyDetails: [strings.notify.testDetail1, strings.notify.testDetail2],
      actions: [],
      processedAt: Math.floor(Date.now() / 1000),
    };

    const result = await this.dispatchToIntegration(integration, webhookUrl, testNotification, locale);
    if (result.status === 'failure') {
      throw new Error(result.errorMessage ?? `Webhook returned HTTP ${result.httpStatus ?? 'error'}`);
    }
  }

  private async resolveApplicationLocale(applicationId: string): Promise<string> {
    try {
      const masterKey = await this.env.AES_ENCRYPTION_KEY_SECRET.get();
      const application = await new ConnectedApplicationDAO(this.env.DB, masterKey).getById(applicationId);
      return application?.contentLanguage ?? 'en';
    } catch {
      return 'en';
    }
  }

  private async dispatchToIntegration(integration: OutboundIntegration, webhookUrl: string, notification: EmailSummaryNotification, locale?: string | null): Promise<DispatchResult> {
    const observer = IntegrationObserverRegistry.get(integration.integrationType);
    if (!observer) {
      return { status: 'failure', httpStatus: null, errorMessage: `Unsupported integration type: ${integration.integrationType}` };
    }
    return observer.dispatch(webhookUrl, notification, locale);
  }
}

const IntegrationServiceFactory = {
  create(env: IntegrationServiceEnv): IntegrationService {
    return new IntegrationService(env);
  },
};

export { IntegrationService, IntegrationServiceFactory };
export type { IntegrationServiceEnv };
