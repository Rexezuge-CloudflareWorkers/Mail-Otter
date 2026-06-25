import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { OAuth2AuthorizationService } from '@mail-otter/backend-services/oauth2';

class CreateOAuth2AuthorizationRoute extends IUserRoute<
  CreateOAuth2AuthorizationRequest,
  CreateOAuth2AuthorizationResponse,
  CreateOAuth2AuthorizationEnv
> {
  schema = {
    tags: ['Applications'],
    summary: 'Create OAuth2 authorization URL',
    responses: {
      '200': {
        description: 'OAuth2 authorization URL created',
      },
    },
  };

  protected async handleRequest(
    request: CreateOAuth2AuthorizationRequest,
    env: CreateOAuth2AuthorizationEnv,
    cxt: RouteContext<CreateOAuth2AuthorizationEnv>,
  ): Promise<CreateOAuth2AuthorizationResponse> {
    return new OAuth2AuthorizationService(env).createAuthorization(this.getAuthenticatedUserEmailAddress(cxt), request.applicationId, request.raw);
  }
}

interface CreateOAuth2AuthorizationRequest extends IRequest {
  applicationId: string;
}

interface CreateOAuth2AuthorizationResponse extends IResponse {
  authorizationUrl: string;
  redirectUri: string;
  expiresAt: number;
}

interface CreateOAuth2AuthorizationEnv extends IUserEnv {
  OAUTH2_STATE_EXPIRY_MINUTES?: string;
}

export { CreateOAuth2AuthorizationRoute };
