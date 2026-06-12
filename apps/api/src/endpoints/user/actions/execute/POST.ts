import { BadRequestError } from '@mail-otter/backend-errors';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { ActionService } from '@mail-otter/backend-services/action';
import type { EmailAction } from '@mail-otter/shared/model';

class ExecuteUserEmailActionRoute extends IUserRoute<ExecuteUserEmailActionRequest, ExecuteUserEmailActionResponse, ExecuteUserEmailActionEnv> {
  schema = {
    tags: ['Actions'],
    summary: 'Execute an email action from the authenticated UI',
    responses: {
      '200': { description: 'Executed email action' },
    },
  };

  protected async handleRequest(
    request: ExecuteUserEmailActionRequest,
    env: ExecuteUserEmailActionEnv,
    cxt: RouteContext<ExecuteUserEmailActionEnv>,
  ): Promise<ExecuteUserEmailActionResponse> {
    const actionId: string | undefined = cxt.req.param('actionId');
    if (!actionId) throw new BadRequestError('Action execution request is missing actionId.');
    return {
      action: await ActionService.executeActionForUser(actionId, this.getAuthenticatedUserEmailAddress(cxt), request.raw, env),
    };
  }
}

type ExecuteUserEmailActionRequest = IRequest;

interface ExecuteUserEmailActionResponse extends IResponse {
  action: EmailAction;
}

interface ExecuteUserEmailActionEnv extends IUserEnv {
  ACTION_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  ACTION_SIGNING_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string | undefined;
}

export { ExecuteUserEmailActionRoute };
