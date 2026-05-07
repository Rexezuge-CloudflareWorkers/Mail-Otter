import { ProviderSubscriptionDAO } from '@/dao';
import { BadRequestError, UnauthorizedError } from '@/error';
import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { ExtendedResponse, IEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IBaseRoute';
import type { ProviderSubscription } from '@mail-otter/shared/model';
import { WebhookSecurityUtil } from '@/utils';

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
    const validationToken: string | null = new URL(request.raw.url).searchParams.get('validationToken');
    if (validationToken) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/plain' },
        rawBody: validationToken,
      };
    }
    const applicationId: string | undefined = cxt.req.param('applicationId');
    if (!applicationId) throw new BadRequestError('Outlook lifecycle webhook is missing applicationId.');
    const subscriptionDAO = new ProviderSubscriptionDAO(env.DB);
    for (const notification of request.value || []) {
      const subscription: ProviderSubscription | undefined = await subscriptionDAO.getByExternalSubscriptionId(notification.subscriptionId);
      if (!subscription || subscription.applicationId !== applicationId) {
        throw new UnauthorizedError('Unknown Outlook subscription.');
      }
      if (notification.clientState && !(await WebhookSecurityUtil.matchesSecret(notification.clientState, subscription.clientStateHash))) {
        throw new UnauthorizedError('Invalid Outlook clientState.');
      }
      if (notification.lifecycleEvent === 'subscriptionRemoved' || notification.lifecycleEvent === 'missed') {
        await subscriptionDAO.markError(subscription.subscriptionId, `Outlook lifecycle event: ${notification.lifecycleEvent}`);
      }
    }
    return {
      statusCode: 202,
      body: { message: 'accepted' },
    };
  }
}

interface OutlookLifecycleWebhookRequest extends IRequest {
  value?:
    | Array<{
        subscriptionId: string;
        clientState?: string | undefined;
        lifecycleEvent?: string | undefined;
      }>
    | undefined;
}

interface OutlookLifecycleWebhookResponse extends IResponse {
  message: string;
}

interface OutlookLifecycleWebhookEnv extends IEnv {
  DB: D1Database;
}

export { OutlookLifecycleWebhookRoute };
