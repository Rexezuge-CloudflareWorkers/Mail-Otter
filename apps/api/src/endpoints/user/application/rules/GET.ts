import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { ApplicationService } from '@mail-otter/backend-services/application';
import type { EmailProcessingRule } from '@mail-otter/shared/model';

class GetApplicationRulesRoute extends IUserRoute<GetApplicationRulesRequest, GetApplicationRulesResponse, GetApplicationRulesEnv> {
  schema = {
    tags: ['Rules'],
    summary: 'List email processing rules for a mailbox',
    responses: {
      '200': {
        description: 'Rules list',
      },
    },
  };

  protected async handleRequest(
    request: GetApplicationRulesRequest,
    env: GetApplicationRulesEnv,
    cxt: RouteContext<GetApplicationRulesEnv>,
  ): Promise<GetApplicationRulesResponse> {
    const applicationId = this.getQueryParam(request, 'applicationId') ?? '';
    const rules = await ApplicationService.getRules(this.getAuthenticatedUserEmailAddress(cxt), applicationId, env);
    return { rules };
  }
}

type GetApplicationRulesRequest = IRequest;

interface GetApplicationRulesResponse extends IResponse {
  rules: EmailProcessingRule[];
}

type GetApplicationRulesEnv = IUserEnv;

export { GetApplicationRulesRoute };
