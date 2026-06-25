import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, RouteContext } from '@/endpoints/IUserRoute';
import { AnalyticsService } from '@mail-otter/backend-services/analytics';
import type { AnalyticsResponse } from '@mail-otter/backend-services/analytics';

class GetAnalyticsRoute extends IUserRoute<GetAnalyticsRequest, GetAnalyticsResponse, GetAnalyticsEnv> {
  schema = {
    tags: ['Analytics'],
    summary: 'Get analytics summary for the authenticated user',
    responses: {
      '200': { description: 'Analytics summary' },
    },
  };

  protected async handleRequest(
    request: GetAnalyticsRequest,
    env: GetAnalyticsEnv,
    cxt: RouteContext<GetAnalyticsEnv>,
  ): Promise<GetAnalyticsResponse> {
    const userEmail: string = this.getAuthenticatedUserEmailAddress(cxt);
    const daysParam: string | undefined = this.getQueryParam(request, 'days');
    const days: number = Math.min(Math.max(daysParam ? (Number(daysParam) || 30) : 30, 1), 365);
    const applicationId: string | undefined = this.getQueryParam(request, 'applicationId');

    return new AnalyticsService(env).getAnalytics(userEmail, { days, applicationId });
  }
}

type GetAnalyticsRequest = IRequest;
type GetAnalyticsResponse = AnalyticsResponse;

interface GetAnalyticsEnv extends IUserEnv {
  ACTION_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
}

export { GetAnalyticsRoute };
