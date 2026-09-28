import type { AccountIdentity } from '@mail-otter/backend-services/identity';
import { BadRequestError } from '@mail-otter/backend-errors';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { ContextAuditLog } from '@mail-otter/shared/model';
import { Tokens, createRequestScope } from '@mail-otter/backend-services/composition';

class ListContextDocumentAuditLogsRoute extends IUserRoute<
  ListContextDocumentAuditLogsRequest,
  ListContextDocumentAuditLogsResponse,
  ListContextDocumentAuditLogsEnv
> {
  schema = {
    tags: ['Applications'],
    summary: 'List audit logs for an indexed context document',
    responses: {
      '200': {
        description: 'Audit logs for the context document',
      },
    },
  };

  protected async handleRequest(
    _request: ListContextDocumentAuditLogsRequest,
    env: ListContextDocumentAuditLogsEnv,
    cxt: RouteContext<ListContextDocumentAuditLogsEnv>,
  ): Promise<ListContextDocumentAuditLogsResponse> {
    const scope = createRequestScope(env);
    const contextDocumentId: string | undefined = cxt.req.param('contextDocumentId');
    if (!contextDocumentId) {
      throw new BadRequestError('Context document id is required.');
    }

    const user: AccountIdentity = this.getAuthenticatedUser(cxt);
    return scope.get(Tokens.ContextService).listAuditLogs(user, contextDocumentId, this.getQueryParam(_request, 'cursor'));
  }
}

type ListContextDocumentAuditLogsRequest = IRequest;

interface ListContextDocumentAuditLogsResponse extends IResponse {
  logs: ContextAuditLog[];
  nextCursor?: string;
}

type ListContextDocumentAuditLogsEnv = IUserEnv;

export { ListContextDocumentAuditLogsRoute };
