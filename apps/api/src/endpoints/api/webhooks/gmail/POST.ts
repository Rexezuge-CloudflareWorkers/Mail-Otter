import { BadRequestError } from '@mail-otter/backend-errors';
import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { IEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IBaseRoute';
import type { EmailQueueMessage } from '@mail-otter/shared/model';
import { GmailWebhookService } from '@mail-otter/backend-services/webhook';
import { BaseUrlUtil } from '@mail-otter/shared/utils';

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
    await GmailWebhookService.handleNotification(
      {
        applicationId,
        token,
        messageData: request.message.data,
        pubsubMessageId: request.message.messageId,
        callbackBaseUrl: BaseUrlUtil.getBaseUrl(request.raw),
      },
      env,
    );
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

interface GmailWebhookResponse extends IResponse {
  message: string;
}

interface GmailWebhookEnv extends IEnv {
  DB: D1Database;
  EMAIL_EVENTS_QUEUE: Queue<EmailQueueMessage>;
}

export { GmailWebhookRoute };
