import { BadRequestError } from '@mail-otter/backend-errors';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { ActionService } from '@mail-otter/backend-services/action';
import type { EmailActionExecution } from '@mail-otter/shared/model';

class ListEmailActionExecutionsRoute extends IUserRoute<
  ListEmailActionExecutionsRequest,
  ListEmailActionExecutionsResponse,
  ListEmailActionExecutionsEnv
> {
  schema = {
    tags: ['Actions'],
    summary: 'List execution audit rows for an email action',
    responses: {
      '200': { description: 'Email action executions' },
    },
  };

  protected async handleRequest(
    _request: ListEmailActionExecutionsRequest,
    env: ListEmailActionExecutionsEnv,
    cxt: RouteContext<ListEmailActionExecutionsEnv>,
  ): Promise<ListEmailActionExecutionsResponse> {
    const actionId: string | undefined = cxt.req.param('actionId');
    if (!actionId) throw new BadRequestError('Action audit request is missing actionId.');
    return ActionService.listExecutionsForUser(actionId, this.getAuthenticatedUserEmailAddress(cxt), env);
  }
}

type ListEmailActionExecutionsRequest = IRequest;

interface ListEmailActionExecutionsResponse extends IResponse {
  executions: EmailActionExecution[];
}

interface ListEmailActionExecutionsEnv extends IUserEnv {
  ACTION_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
}

export { ListEmailActionExecutionsRoute };
