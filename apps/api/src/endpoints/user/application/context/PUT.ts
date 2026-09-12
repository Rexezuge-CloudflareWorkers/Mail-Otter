import { BadRequestError } from '@mail-otter/backend-errors';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { ContextService } from '@mail-otter/backend-services/email';
import type { ApplicationResponse } from '@mail-otter/backend-services/application';
import { Tokens, createRequestScope } from '@mail-otter/backend-services/composition';

class UpdateApplicationContextRoute extends IUserRoute<
  UpdateApplicationContextRequest,
  UpdateApplicationContextResponse,
  UpdateApplicationContextEnv
> {
  schema = {
    tags: ['Applications'],
    summary: 'Update connected application context settings',
    responses: {
      '200': {
        description: 'Application context settings updated',
      },
    },
  };

  protected async handleRequest(
    request: UpdateApplicationContextRequest,
    env: UpdateApplicationContextEnv,
    cxt: RouteContext<UpdateApplicationContextEnv>,
  ): Promise<UpdateApplicationContextResponse> {
    const scope = createRequestScope(env);
    if (request.maxContextDocuments != null) {
      if (request.maxContextDocuments < 1) {
        throw new BadRequestError('maxContextDocuments must be a positive integer.');
      }
      const globalMax: number = ConfigurationManager.getMaxContextDocumentsPerApplication(env);
      if (request.maxContextDocuments > globalMax) {
        throw new BadRequestError(`maxContextDocuments cannot exceed the global maximum of ${globalMax}.`);
      }
    }
    return {
      application: await scope.get(Tokens.ContextService).updateContextSettings(this.getAuthenticatedUserEmailAddress(cxt), request, request.raw),
    };
  }
}

interface UpdateApplicationContextRequest extends IRequest {
  applicationId: string;
  contextIndexingEnabled?: boolean;
  ragRetrievalEnabled?: boolean;
  maxContextDocuments?: number | null;
  attachmentVisionEnabled?: boolean;
}

interface UpdateApplicationContextResponse extends IResponse {
  application: ApplicationResponse;
}

interface UpdateApplicationContextEnv extends IUserEnv {
  MAX_CONTEXT_DOCUMENTS_PER_APPLICATION?: string;
}

export { UpdateApplicationContextRoute };
