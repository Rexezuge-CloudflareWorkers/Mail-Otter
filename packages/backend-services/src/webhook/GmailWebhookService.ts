import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { BadRequestError, UnauthorizedError } from '@mail-otter/backend-errors';
import type { EmailQueueMessage } from '@mail-otter/shared/model';
import { WebhookSecurityUtil } from '@mail-otter/provider-clients/webhook';
import { BaseWebhookService } from './BaseWebhookService';

class GmailWebhookService extends BaseWebhookService {
  public static async handleNotification(input: GmailWebhookInput, env: GmailWebhookEnv): Promise<void> {
    const { dao: subscriptionDAO, subscription } = await this.getSubscriptionByApplication(env.DB, input.applicationId);
    if (!subscription || !(await this.matchesSecret(input.token, subscription.webhookSecretHash))) {
      throw new UnauthorizedError('Invalid Gmail webhook token.');
    }
    const decoded = JSON.parse(WebhookSecurityUtil.base64UrlDecodeToString(input.messageData)) as GmailNotificationData;
    if (!decoded.historyId) throw new BadRequestError('Gmail notification was missing historyId.');
    await this.enqueueAndTouch(
      env.EMAIL_EVENTS_QUEUE,
      subscriptionDAO,
      subscription.subscriptionId,
      {
        type: 'gmail-notification',
        applicationId: input.applicationId,
        notificationHistoryId: decoded.historyId,
        pubsubMessageId: input.pubsubMessageId,
        callbackBaseUrl: input.callbackBaseUrl,
      },
    );
  }
}

interface GmailWebhookInput {
  applicationId: string;
  token: string | null;
  messageData: string;
  pubsubMessageId?: string;
  callbackBaseUrl?: string;
}

interface GmailNotificationData {
  emailAddress?: string;
  historyId?: string;
}

interface GmailWebhookEnv {
  DB: D1Queryable;
  EMAIL_EVENTS_QUEUE: Queue<EmailQueueMessage>;
}

export { GmailWebhookService };
export type { GmailWebhookEnv, GmailWebhookInput, GmailNotificationData };
