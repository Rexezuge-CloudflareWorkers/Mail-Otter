import { BadRequestError } from '@mail-otter/backend-errors';
import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { ExtendedResponse, IEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IBaseRoute';
import { OutlookWebhookService } from '@mail-otter/backend-services/webhook';

class OutlookLifecycleWebhookRoute extends IBaseRoute<
  OutlookLifecycleWebhookRequest,
  OutlookLifecycleWebhookResponse,
  OutlookLifecycleWebhookEnv
> {
  schema = {
    tags: ['Webhooks'],
    summary: 'Receive Microsoft Graph lifecycle notification',
    responses: {
      '202': {
        description: 'Lifecycle notification accepted',
      },
    },
  };

  protected async handleRequest(
    request: OutlookLifecycleWebhookRequest,
    env: OutlookLifecycleWebhookEnv,
    cxt: RouteContext<OutlookLifecycleWebhookEnv>,
  ): Promise<OutlookLifecycleWebhookResponse | ExtendedResponse<OutlookLifecycleWebhookResponse>> {
    const validationToken = this.getQueryParam(request, 'validationToken');
    if (validationToken) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/plain' },
        rawBody: validationToken,
      };
    }
    const applicationId: string | undefined = cxt.req.param('applicationId');
    if (!applicationId) throw new BadRequestError('Outlook lifecycle webhook is missing applicationId.');
    await OutlookWebhookService.handleLifecycleNotifications(applicationId, request.value || [], env);
    return {
      statusCode: 202,
      body: { message: 'accepted' },
    };
  }
}

interface OutlookLifecycleWebhookRequest extends IRequest {
  value?: Array<{
    subscriptionId: string;
    clientState?: string;
    lifecycleEvent?: string;
  }>;
}

interface OutlookLifecycleWebhookResponse extends IResponse {
  message: string;
}

interface OutlookLifecycleWebhookEnv extends IEnv {
  DB: D1Database;
}

export { OutlookLifecycleWebhookRoute };
