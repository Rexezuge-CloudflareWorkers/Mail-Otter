import { ProviderSubscriptionDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { BadRequestError } from '@mail-otter/backend-errors';
import { WebhookSecurityUtil } from '@mail-otter/provider-clients/webhook';
import type { EmailQueueMessage } from '@mail-otter/shared/model';

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

class FastmailWebhookService {
  public static async handleNotification(input: FastmailWebhookInput, env: FastmailWebhookEnv): Promise<void> {
    const subscriptionDAO = new ProviderSubscriptionDAO(env.DB);
    const subscription = await subscriptionDAO.getByApplication(input.applicationId);
    if (!subscription || !subscription.webhookSecretHash) {
      throw new BadRequestError('Fastmail webhook: application subscription not found or not configured.');
    }
    if (!input.token || !(await WebhookSecurityUtil.matchesSecret(input.token, subscription.webhookSecretHash))) {
      throw new BadRequestError('Fastmail webhook: invalid token.');
    }

    await env.EMAIL_EVENTS_QUEUE.send({
      type: 'jmap-notification',
      applicationId: input.applicationId,
      emailId: input.emailId,
      callbackBaseUrl: input.callbackBaseUrl,
    });

    await subscriptionDAO.touchNotification(subscription.subscriptionId);
  }
}

export { FastmailWebhookService };
export type { FastmailWebhookEnv, FastmailWebhookInput };
