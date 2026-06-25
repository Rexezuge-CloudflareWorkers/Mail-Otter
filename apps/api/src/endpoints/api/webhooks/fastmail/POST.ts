import { BadRequestError } from '@mail-otter/backend-errors';
import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { IEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IBaseRoute';
import type { EmailQueueMessage } from '@mail-otter/shared/model';
import { FastmailWebhookService } from '@mail-otter/backend-services/webhook';
import { BaseUrlUtil } from '@mail-otter/shared/utils';

class FastmailWebhookRoute extends IBaseRoute<FastmailWebhookRequest, FastmailWebhookResponse, FastmailWebhookEnv> {
  schema = {
    tags: ['Webhooks'],
    summary: 'Receive Fastmail JMAP push notification',
    responses: {
      '200': {
        description: 'Notification accepted',
      },
    },
  };

  protected async handleRequest(
    request: FastmailWebhookRequest,
    env: FastmailWebhookEnv,
    cxt: RouteContext<FastmailWebhookEnv>,
  ): Promise<FastmailWebhookResponse> {
    const applicationId: string | undefined = cxt.req.param('applicationId');
    if (!applicationId) throw new BadRequestError('Fastmail webhook is missing applicationId.');
    const token: string | null = this.getQueryParam(request, 'token') ?? null;
    if (!request.emailId) throw new BadRequestError('Fastmail webhook body is missing emailId.');
    await FastmailWebhookService.handleNotification(
      {
        applicationId,
        token,
        emailId: request.emailId,
        callbackBaseUrl: BaseUrlUtil.getBaseUrl(request.raw),
      },
      env,
    );
    return { message: 'accepted' };
  }
}

interface FastmailWebhookRequest extends IRequest {
  emailId: string;
  type?: string;
}

interface FastmailWebhookResponse extends IResponse {
  message: string;
}

interface FastmailWebhookEnv extends IEnv {
  DB: D1Database;
  EMAIL_EVENTS_QUEUE: Queue<EmailQueueMessage>;
}

export { FastmailWebhookRoute };
