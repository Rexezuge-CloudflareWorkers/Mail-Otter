import type { DispatchResult, EmailSummaryNotification, IntegrationObserver } from './IntegrationObserver';
import { postIntegrationJson } from './IntegrationObserver';
import { NotificationPayloadBuilder } from './NotificationPayloadBuilder';

class DiscordObserver implements IntegrationObserver {
  public readonly integrationType = 'discord' as const;

  public async dispatch(webhookUrl: string, notification: EmailSummaryNotification, locale?: string | null): Promise<DispatchResult> {
    return postIntegrationJson(webhookUrl, NotificationPayloadBuilder.buildDiscordPayload(notification, locale));
  }
}

export { DiscordObserver };
