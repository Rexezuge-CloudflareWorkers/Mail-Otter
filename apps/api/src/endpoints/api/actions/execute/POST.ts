import { BadRequestError } from '@mail-otter/backend-errors';
import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { ExtendedResponse, IEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IBaseRoute';
import { ActionService } from '@mail-otter/backend-services/action';
import type { ActionHtmlResponse } from '@mail-otter/backend-services/action';

class ExecuteActionCallbackRoute extends IBaseRoute<ExecuteActionCallbackRequest, ExecuteActionCallbackResponse, ExecuteActionCallbackEnv> {
  schema = {
    tags: ['Actions'],
    summary: 'Execute a confirmed public email action',
    responses: {
      '200': { description: 'Action result HTML' },
    },
  };

  protected async handleRequest(
    request: ExecuteActionCallbackRequest,
    env: ExecuteActionCallbackEnv,
    cxt: RouteContext<ExecuteActionCallbackEnv>,
  ): Promise<ExtendedResponse<ExecuteActionCallbackResponse>> {
    const actionId: string | undefined = cxt.req.param('actionId');
    if (!actionId) throw new BadRequestError('Action callback is missing actionId.');
    const token: string = this.getQueryParam(request, 'token') ?? '';
    const response: ActionHtmlResponse = await ActionService.executeActionWithToken(actionId, token, request.raw, env);
    return { statusCode: response.statusCode as 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }, rawBody: response.html };
  }
}

type ExecuteActionCallbackRequest = IRequest;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface ExecuteActionCallbackResponse extends IResponse {}

interface ExecuteActionCallbackEnv extends IEnv {
  DB: D1Database;
  ACTION_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  ACTION_SIGNING_SECRET: SecretsStoreSecret;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
}

export { ExecuteActionCallbackRoute };
