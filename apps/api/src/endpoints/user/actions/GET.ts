import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { ActionService } from '@mail-otter/backend-services/action';
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
    const url = new URL(request.raw.url);
    return ActionService.listActionsForUser(
      this.getAuthenticatedUserEmailAddress(cxt),
      {
        applicationId: url.searchParams.get('applicationId') || undefined,
        status: (url.searchParams.get('status') || undefined) as EmailActionStatus | undefined,
        cursor: url.searchParams.get('cursor') || undefined,
      },
      env,
    );
  }
}

type ListEmailActionsRequest = IRequest;

interface ListEmailActionsResponse extends IResponse {
  actions: EmailAction[];
  nextCursor?: string | undefined;
}

interface ListEmailActionsEnv extends IUserEnv {
  ACTION_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
}

export { ListEmailActionsRoute };
