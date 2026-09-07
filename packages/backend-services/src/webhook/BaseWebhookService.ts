import { ProviderSubscriptionDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import type { EmailQueueMessage, ProviderSubscription } from '@mail-otter/shared/model';
import { WebhookSecurityUtil } from '@mail-otter/provider-clients/webhook';

// Strategy base for webhook handlers: shared verify → enqueue → touch pipeline.
// Each provider keeps its own error semantics; this base supplies the mechanics.
class BaseWebhookService {
  protected static async getSubscriptionByApplication(
    db: D1Queryable,
    applicationId: string,
  ): Promise<{ dao: ProviderSubscriptionDAO; subscription: ProviderSubscription | undefined }> {
    const dao = new ProviderSubscriptionDAO(db);
    const subscription = await dao.getByApplication(applicationId);
    return { dao, subscription };
  }

  protected static async matchesSecret(
    token: string | null | undefined,
    hash: string | null | undefined,
  ): Promise<boolean> {
    return WebhookSecurityUtil.matchesSecret(token, hash);
  }

  protected static async enqueueAndTouch(
    queue: Queue<EmailQueueMessage>,
    dao: ProviderSubscriptionDAO,
    subscriptionId: string,
    message: EmailQueueMessage,
  ): Promise<void> {
    await queue.send(message);
    await dao.touchNotification(subscriptionId);
  }
}

export { BaseWebhookService };
