import { BadRequestError } from '@mail-otter/backend-errors';
import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { ExtendedResponse, IEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IBaseRoute';
import type { EmailQueueMessage } from '@mail-otter/shared/model';
import { OutlookWebhookService } from '@mail-otter/backend-services/webhook';
import { BaseUrlUtil } from '@mail-otter/shared/utils';

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
    await OutlookWebhookService.handleNotifications(applicationId, request.value || [], env, BaseUrlUtil.getBaseUrl(request.raw));
    return {
      statusCode: 202,
      body: { message: 'accepted' },
    };
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
