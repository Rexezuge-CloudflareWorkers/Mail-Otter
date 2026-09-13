import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { Tokens, createRequestScope } from '@mail-otter/backend-services/composition';
import type { EmailAction } from '@mail-otter/shared/model';
import type { EmailActionStatus } from '@mail-otter/shared/constants';

class ListEmailActionsRoute extends IUserRoute<ListEmailActionsRequest, ListEmailActionsResponse, ListEmailActionsEnv> {
  schema = {
    tags: ['Actions'],
    summary: 'List email actions for the authenticated user',
    responses: {
      '200': { description: 'Email actions' },
    },
  };

  protected async handleRequest(
    request: ListEmailActionsRequest,
    env: ListEmailActionsEnv,
    cxt: RouteContext<ListEmailActionsEnv>,
  ): Promise<ListEmailActionsResponse> {
    const showSnoozedRaw = this.getQueryParam(request, 'showSnoozed');
    const scope = createRequestScope(env);
    return scope.get(Tokens.ActionService).listActionsForUser(
      this.getAuthenticatedUserEmailAddress(cxt),
      {
        applicationId: this.getQueryParam(request, 'applicationId'),
        status: this.getQueryParam(request, 'status') as EmailActionStatus | undefined,
        cursor: this.getQueryParam(request, 'cursor'),
        showSnoozed: showSnoozedRaw === 'true',
      },
      env,
    );
  }
}

type ListEmailActionsRequest = IRequest;

interface ListEmailActionsResponse extends IResponse {
  actions: EmailAction[];
  nextCursor?: string;
}

interface ListEmailActionsEnv extends IUserEnv {
  ACTION_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
}

export { ListEmailActionsRoute };
