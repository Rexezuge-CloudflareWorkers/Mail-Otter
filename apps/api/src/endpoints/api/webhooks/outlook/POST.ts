import { ProviderSubscriptionDAO } from '@/dao';
import { BadRequestError, UnauthorizedError } from '@/error';
import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { ExtendedResponse, IEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IBaseRoute';
import type { EmailQueueMessage, ProviderSubscription } from '@mail-otter/shared/model';
import { WebhookSecurityUtil } from '@/utils';

class OutlookWebhookRoute extends IBaseRoute<OutlookWebhookRequest, OutlookWebhookResponse, OutlookWebhookEnv> {
  schema = {
    tags: ['Webhooks'],
    summary: 'Receive Microsoft Graph Outlook notification',
    responses: {
      '202': {
        description: 'Notification accepted',
      },
    },
  };

  protected async handleRequest(
    request: OutlookWebhookRequest,
    env: OutlookWebhookEnv,
    cxt: RouteContext<OutlookWebhookEnv>,
  ): Promise<OutlookWebhookResponse | ExtendedResponse<OutlookWebhookResponse>> {
    const validationToken: string | null = new URL(request.raw.url).searchParams.get('validationToken');
    if (validationToken) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/plain' },
        rawBody: validationToken,
      };
    }
    const applicationId: string | undefined = cxt.req.param('applicationId');
    if (!applicationId) throw new BadRequestError('Outlook webhook is missing applicationId.');
    const subscriptionDAO = new ProviderSubscriptionDAO(env.DB);
    for (const notification of request.value || []) {
      const subscription: ProviderSubscription | undefined = await subscriptionDAO.getByExternalSubscriptionId(notification.subscriptionId);
      if (!subscription || subscription.applicationId !== applicationId) {
        throw new UnauthorizedError('Unknown Outlook subscription.');
      }
      if (!(await WebhookSecurityUtil.matchesSecret(notification.clientState, subscription.clientStateHash))) {
        throw new UnauthorizedError('Invalid Outlook clientState.');
      }
      const messageId: string | undefined = notification.resourceData?.id || OutlookWebhookRoute.extractMessageId(notification.resource);
      if (!messageId) continue;
      const queueMessage: EmailQueueMessage = {
        type: 'outlook-notification',
        applicationId,
        subscriptionId: notification.subscriptionId,
        messageId,
      };
      await env.EMAIL_EVENTS_QUEUE.send(queueMessage);
      await subscriptionDAO.touchNotification(subscription.subscriptionId);
    }
    return {
      statusCode: 202,
      body: { message: 'accepted' },
    };
  }

  private static extractMessageId(resource: string | undefined): string | undefined {
    if (!resource) return undefined;
    const match: RegExpMatchArray | null = resource.match(/messages\/([^/]+)$/i);
    return match?.[1];
  }
}

interface OutlookWebhookRequest extends IRequest {
  value?: OutlookNotification[] | undefined;
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

interface OutlookWebhookResponse extends IResponse {
  message: string;
}

interface OutlookWebhookEnv extends IEnv {
  DB: D1Database;
  EMAIL_EVENTS_QUEUE: Queue<EmailQueueMessage>;
}

export { OutlookWebhookRoute };
