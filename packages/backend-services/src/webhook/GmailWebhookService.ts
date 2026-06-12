import { ProviderSubscriptionDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { BadRequestError, UnauthorizedError } from '@mail-otter/backend-errors';
import type { EmailQueueMessage, ProviderSubscription } from '@mail-otter/shared/model';
import { WebhookSecurityUtil } from '@mail-otter/provider-clients/webhook';

class GmailWebhookService {
  public static async handleNotification(input: GmailWebhookInput, env: GmailWebhookEnv): Promise<void> {
    const subscriptionDAO = new ProviderSubscriptionDAO(env.DB);
    const subscription: ProviderSubscription | undefined = await subscriptionDAO.getByApplication(input.applicationId);
    if (!subscription || !(await WebhookSecurityUtil.matchesSecret(input.token, subscription.webhookSecretHash))) {
      throw new UnauthorizedError('Invalid Gmail webhook token.');
    }
    const decoded = JSON.parse(WebhookSecurityUtil.base64UrlDecodeToString(input.messageData)) as GmailNotificationData;
    if (!decoded.historyId) throw new BadRequestError('Gmail notification was missing historyId.');
    await env.EMAIL_EVENTS_QUEUE.send({
      type: 'gmail-notification',
      applicationId: input.applicationId,
      notificationHistoryId: decoded.historyId,
      pubsubMessageId: input.pubsubMessageId,
      callbackBaseUrl: input.callbackBaseUrl,
    });
    await subscriptionDAO.touchNotification(subscription.subscriptionId);
  }
}

interface GmailWebhookInput {
  applicationId: string;
  token: string | null;
  messageData: string;
  pubsubMessageId?: string | undefined;
  callbackBaseUrl?: string | undefined;
}

interface GmailNotificationData {
  emailAddress?: string | undefined;
  historyId?: string | undefined;
}

interface GmailWebhookEnv {
  DB: D1Queryable;
  EMAIL_EVENTS_QUEUE: Queue<EmailQueueMessage>;
}

export { GmailWebhookService };
export type { GmailWebhookEnv, GmailWebhookInput, GmailNotificationData };
