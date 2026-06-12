import { ProviderSubscriptionDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { UnauthorizedError } from '@mail-otter/backend-errors';
import type { EmailQueueMessage, ProviderSubscription } from '@mail-otter/shared/model';
import { WebhookSecurityUtil } from '@mail-otter/provider-clients/webhook';

class OutlookWebhookService {
  public static async handleNotifications(
    applicationId: string,
    notifications: OutlookNotification[],
    env: OutlookWebhookEnv,
    callbackBaseUrl?: string | undefined,
  ): Promise<void> {
    const subscriptionDAO = new ProviderSubscriptionDAO(env.DB);
    for (const notification of notifications) {
      const subscription: ProviderSubscription = await OutlookWebhookService.getAuthorizedSubscription(
        applicationId,
        notification.subscriptionId,
        notification.clientState,
        subscriptionDAO,
        true,
      );
      const messageId: string | undefined = notification.resourceData?.id || OutlookWebhookService.extractMessageId(notification.resource);
      if (!messageId) continue;
      await env.EMAIL_EVENTS_QUEUE.send({
        type: 'outlook-notification',
        applicationId,
        subscriptionId: notification.subscriptionId,
        messageId,
        callbackBaseUrl,
      });
      await subscriptionDAO.touchNotification(subscription.subscriptionId);
    }
  }

  public static async handleLifecycleNotifications(
    applicationId: string,
    notifications: OutlookLifecycleNotification[],
    env: OutlookLifecycleWebhookEnv,
  ): Promise<void> {
    const subscriptionDAO = new ProviderSubscriptionDAO(env.DB);
    for (const notification of notifications) {
      const subscription: ProviderSubscription = await OutlookWebhookService.getAuthorizedSubscription(
        applicationId,
        notification.subscriptionId,
        notification.clientState,
        subscriptionDAO,
        Boolean(notification.clientState),
      );
      if (notification.lifecycleEvent === 'subscriptionRemoved' || notification.lifecycleEvent === 'missed') {
        await subscriptionDAO.markError(subscription.subscriptionId, `Outlook lifecycle event: ${notification.lifecycleEvent}`);
      }
    }
  }

  public static extractMessageId(resource: string | undefined): string | undefined {
    if (!resource) return undefined;
    const messagesSegment: string = '/messages/';
    const segmentIndex: number = resource.toLowerCase().lastIndexOf(messagesSegment);
    if (segmentIndex === -1) return undefined;
    const messageId: string = resource.slice(segmentIndex + messagesSegment.length);
    return messageId.includes('/') ? undefined : messageId;
  }

  private static async getAuthorizedSubscription(
    applicationId: string,
    externalSubscriptionId: string,
    clientState: string | undefined,
    subscriptionDAO: ProviderSubscriptionDAO,
    requireClientState: boolean,
  ): Promise<ProviderSubscription> {
    const subscription: ProviderSubscription | undefined = await subscriptionDAO.getByExternalSubscriptionId(externalSubscriptionId);
    if (!subscription || subscription.applicationId !== applicationId) {
      throw new UnauthorizedError('Unknown Outlook subscription.');
    }
    if (requireClientState && !(await WebhookSecurityUtil.matchesSecret(clientState, subscription.clientStateHash))) {
      throw new UnauthorizedError('Invalid Outlook clientState.');
    }
    return subscription;
  }
}

interface OutlookNotification {
  subscriptionId: string;
  clientState?: string | undefined;
  changeType?: string | undefined;
  resource?: string | undefined;
  resourceData?:
    | {
        id?: string | undefined;
      }
    | undefined;
}

interface OutlookLifecycleNotification {
  subscriptionId: string;
  clientState?: string | undefined;
  lifecycleEvent?: string | undefined;
}

interface OutlookLifecycleWebhookEnv {
  DB: D1Queryable;
}

interface OutlookWebhookEnv extends OutlookLifecycleWebhookEnv {
  EMAIL_EVENTS_QUEUE: Queue<EmailQueueMessage>;
}

export { OutlookWebhookService };
export type { OutlookLifecycleNotification, OutlookLifecycleWebhookEnv, OutlookNotification, OutlookWebhookEnv };
