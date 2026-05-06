import { ProviderSubscriptionDAO } from '@/dao';
import { BadRequestError, UnauthorizedError } from '@/error';
import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { IEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IBaseRoute';
import type { EmailQueueMessage, ProviderSubscription } from '@mail-otter/shared/model';
import { WebhookSecurityUtil } from '@/utils';

class GmailWebhookRoute extends IBaseRoute<GmailWebhookRequest, GmailWebhookResponse, GmailWebhookEnv> {
  schema = {
    tags: ['Webhooks'],
    summary: 'Receive Gmail Pub/Sub push notification',
    responses: {
      '200': {
        description: 'Notification accepted',
      },
    },
  };

  protected async handleRequest(
    request: GmailWebhookRequest,
    env: GmailWebhookEnv,
    cxt: RouteContext<GmailWebhookEnv>,
  ): Promise<GmailWebhookResponse> {
    const applicationId: string | undefined = cxt.req.param('applicationId');
    if (!applicationId) throw new BadRequestError('Gmail webhook is missing applicationId.');
    const token: string | null = new URL(request.raw.url).searchParams.get('token');
    const subscriptionDAO = new ProviderSubscriptionDAO(env.DB);
    const subscription: ProviderSubscription | undefined = await subscriptionDAO.getByApplication(applicationId);
    if (!subscription || !(await WebhookSecurityUtil.matchesSecret(token, subscription.webhookSecretHash))) {
      throw new UnauthorizedError('Invalid Gmail webhook token.');
    }
    const decoded = JSON.parse(WebhookSecurityUtil.base64UrlDecodeToString(request.message.data)) as GmailNotificationData;
    if (!decoded.historyId) throw new BadRequestError('Gmail notification was missing historyId.');
    const queueMessage: EmailQueueMessage = {
      type: 'gmail-notification',
      applicationId,
      notificationHistoryId: decoded.historyId,
      pubsubMessageId: request.message.messageId,
    };
    await env.EMAIL_EVENTS_QUEUE.send(queueMessage);
    await subscriptionDAO.touchNotification(subscription.subscriptionId);
    return { message: 'accepted' };
  }
}

interface GmailWebhookRequest extends IRequest {
  message: {
    data: string;
    messageId?: string | undefined;
    publishTime?: string | undefined;
  };
  subscription?: string | undefined;
}

interface GmailNotificationData {
  emailAddress?: string | undefined;
  historyId?: string | undefined;
}

interface GmailWebhookResponse extends IResponse {
  message: string;
}

interface GmailWebhookEnv extends IEnv {
  DB: D1Database;
  EMAIL_EVENTS_QUEUE: Queue<EmailQueueMessage>;
}

export { GmailWebhookRoute };
