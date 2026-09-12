import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { BadRequestError, NotFoundError } from '@mail-otter/backend-errors';
import { WebhookSecurityUtil } from '@mail-otter/provider-clients/webhook';
import type { EmailQueueMessage } from '@mail-otter/shared/model';
import { BaseWebhookService } from './BaseWebhookService';

interface FastmailWebhookInput {
  applicationId: string;
  token: string | null;
  emailId: string;
  callbackBaseUrl?: string;
}

interface FastmailWebhookEnv {
  DB: D1Queryable;
  EMAIL_EVENTS_QUEUE: Queue<EmailQueueMessage>;
}

class FastmailWebhookService extends BaseWebhookService {
  public static async handleNotification(input: FastmailWebhookInput, env: FastmailWebhookEnv): Promise<void> {
    const { dao: subscriptionDAO, subscription } = await this.getSubscriptionByApplication(env.DB, input.applicationId);
    if (!subscription || !subscription.webhookSecretHash) {
      throw new NotFoundError('Fastmail webhook: application subscription not found or not configured.');
    }
    if (!input.token || !(await WebhookSecurityUtil.matchesSecret(input.token, subscription.webhookSecretHash))) {
      throw new BadRequestError('Fastmail webhook: invalid token.');
    }

    await this.enqueueAndTouch(
      env.EMAIL_EVENTS_QUEUE,
      subscriptionDAO,
      subscription.subscriptionId,
      {
        type: 'jmap-notification',
        applicationId: input.applicationId,
        emailId: input.emailId,
        callbackBaseUrl: input.callbackBaseUrl,
      },
    );
  }
}

export { FastmailWebhookService };
export type { FastmailWebhookEnv, FastmailWebhookInput };
