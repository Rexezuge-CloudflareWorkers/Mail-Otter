import type { DispatchResult, EmailSummaryNotification, IntegrationObserver } from './IntegrationObserver';
import { postIntegrationJson } from './IntegrationObserver';
import { NotificationPayloadBuilder } from './NotificationPayloadBuilder';

class SlackObserver implements IntegrationObserver {
  public readonly integrationType = 'slack' as const;

  public async dispatch(webhookUrl: string, notification: EmailSummaryNotification, locale?: string | null): Promise<DispatchResult> {
    return postIntegrationJson(webhookUrl, NotificationPayloadBuilder.buildSlackPayload(notification, locale));
  }
}

export { SlackObserver };
