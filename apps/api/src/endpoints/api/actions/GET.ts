import { BadRequestError } from '@mail-otter/backend-errors';
import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { ExtendedResponse, IEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IBaseRoute';
import { ActionService } from '@mail-otter/backend-services/action';
import type { ActionHtmlResponse } from '@mail-otter/backend-services/action';

class GetActionConfirmationRoute extends IBaseRoute<GetActionConfirmationRequest, GetActionConfirmationResponse, GetActionConfirmationEnv> {
  schema = {
    tags: ['Actions'],
    summary: 'Show public action confirmation page',
    responses: {
      '200': { description: 'Action confirmation HTML' },
    },
  };

  protected async handleRequest(
    request: GetActionConfirmationRequest,
    env: GetActionConfirmationEnv,
    cxt: RouteContext<GetActionConfirmationEnv>,
  ): Promise<ExtendedResponse<GetActionConfirmationResponse>> {
    const actionId: string | undefined = cxt.req.param('actionId');
    if (!actionId) throw new BadRequestError('Action callback is missing actionId.');
    const token: string = new URL(request.raw.url).searchParams.get('token') || '';
    const response: ActionHtmlResponse = await ActionService.getConfirmationResponse(actionId, token, env);
    return { statusCode: response.statusCode as 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }, rawBody: response.html };
  }
}

type GetActionConfirmationRequest = IRequest;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface GetActionConfirmationResponse extends IResponse {}

interface GetActionConfirmationEnv extends IEnv {
  DB: D1Database;
  ACTION_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  ACTION_SIGNING_SECRET: SecretsStoreSecret;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string | undefined;
}

export { GetActionConfirmationRoute };
