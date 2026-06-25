import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { ApplicationService } from '@mail-otter/backend-services/application';
import { BadRequestError } from '@mail-otter/backend-errors';
import type { IntegrationDeliveryLog } from '@mail-otter/shared/model';

class ListIntegrationDeliveriesRoute extends IUserRoute<ListIntegrationDeliveriesRequest, ListIntegrationDeliveriesResponse, ListIntegrationDeliveriesEnv> {
  schema = {
    tags: ['Integrations'],
    summary: 'List delivery logs for an outbound integration',
    responses: {
      '200': {
        description: 'Delivery log list',
      },
    },
  };

  protected async handleRequest(
    request: ListIntegrationDeliveriesRequest,
    env: ListIntegrationDeliveriesEnv,
    cxt: RouteContext<ListIntegrationDeliveriesEnv>,
  ): Promise<ListIntegrationDeliveriesResponse> {
    const integrationId = this.getQueryParam(request, 'integrationId') ?? '';
    if (!integrationId) throw new BadRequestError('integrationId is required.');
    const rawLimit = Number(this.getQueryParam(request, 'limit') ?? '20');
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 20, 1), 50);
    const logs = await new ApplicationService(env).listIntegrationDeliveries(
      this.getAuthenticatedUserEmailAddress(cxt),
      integrationId,
      limit,
    );
    return { logs };
  }
}

type ListIntegrationDeliveriesRequest = IRequest;

interface ListIntegrationDeliveriesResponse extends IResponse {
  logs: IntegrationDeliveryLog[];
}

type ListIntegrationDeliveriesEnv = IUserEnv;

export { ListIntegrationDeliveriesRoute };
