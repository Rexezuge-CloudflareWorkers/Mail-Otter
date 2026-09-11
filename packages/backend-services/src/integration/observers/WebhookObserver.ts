import type { DispatchResult, EmailSummaryNotification, IntegrationObserver } from './IntegrationObserver';
import { postIntegrationJson } from './IntegrationObserver';
import { NotificationPayloadBuilder } from './NotificationPayloadBuilder';

class WebhookObserver implements IntegrationObserver {
  public readonly integrationType = 'webhook' as const;

  public async dispatch(webhookUrl: string, notification: EmailSummaryNotification): Promise<DispatchResult> {
    return postIntegrationJson(webhookUrl, NotificationPayloadBuilder.buildWebhookPayload(notification));
  }
}

export { WebhookObserver };
