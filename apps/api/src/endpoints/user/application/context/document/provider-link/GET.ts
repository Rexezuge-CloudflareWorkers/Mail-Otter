import { BadRequestError } from '@mail-otter/backend-errors';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { ContextService } from '@mail-otter/backend-services/email';
import { Tokens, createRequestScope } from '@mail-otter/backend-services/composition';

class GetApplicationContextDocumentProviderLinkRoute extends IUserRoute<
  GetApplicationContextDocumentProviderLinkRequest,
  GetApplicationContextDocumentProviderLinkResponse,
  GetApplicationContextDocumentProviderLinkEnv
> {
  schema = {
    tags: ['Applications'],
    summary: 'Create a provider link for an indexed context document',
    responses: {
      '200': {
        description: 'Provider link for the indexed context document',
      },
    },
  };

  protected async handleRequest(
    _request: GetApplicationContextDocumentProviderLinkRequest,
    env: GetApplicationContextDocumentProviderLinkEnv,
    cxt: RouteContext<GetApplicationContextDocumentProviderLinkEnv>,
  ): Promise<GetApplicationContextDocumentProviderLinkResponse> {
    const scope = createRequestScope(env);
    const contextDocumentId: string | undefined = cxt.req.param('contextDocumentId');
    if (!contextDocumentId) {
      throw new BadRequestError('Context document id is required.');
    }

    const userEmail: string = this.getAuthenticatedUserEmailAddress(cxt);
    return {
      url: await scope.get(Tokens.ContextService).getDocumentProviderLink(userEmail, contextDocumentId),
    };
  }
}

type GetApplicationContextDocumentProviderLinkRequest = IRequest;

interface GetApplicationContextDocumentProviderLinkResponse extends IResponse {
  url: string;
}

type GetApplicationContextDocumentProviderLinkEnv = IUserEnv;

export { GetApplicationContextDocumentProviderLinkRoute };
