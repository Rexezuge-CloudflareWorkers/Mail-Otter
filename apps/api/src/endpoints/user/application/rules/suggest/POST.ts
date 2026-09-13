import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { EmailProcessingRule } from '@mail-otter/shared/model';
import { Tokens, createRequestScope } from '@mail-otter/backend-services/composition';

class SuggestApplicationRuleRoute extends IUserRoute<SuggestApplicationRuleRequest, SuggestApplicationRuleResponse, SuggestApplicationRuleEnv> {
  schema = {
    tags: ['Rules'],
    summary: 'Generate an email processing rule from a natural language description',
    responses: {
      '200': {
        description: 'Suggested rule',
      },
    },
  };

  protected async handleRequest(
    request: SuggestApplicationRuleRequest,
    env: SuggestApplicationRuleEnv,
    cxt: RouteContext<SuggestApplicationRuleEnv>,
  ): Promise<SuggestApplicationRuleResponse> {
    const scope = createRequestScope(env);
    const rule = await scope.get(Tokens.ApplicationService).suggestRule(this.getAuthenticatedUserEmailAddress(cxt), request.applicationId, request.description);
    return { rule };
  }
}

interface SuggestApplicationRuleRequest extends IRequest {
  applicationId: string;
  description: string;
}

interface SuggestApplicationRuleResponse extends IResponse {
  rule: Omit<EmailProcessingRule, 'ruleId'>;
}

interface SuggestApplicationRuleEnv extends IUserEnv {
  AI: Ai;
  AI_SUMMARY_MODEL?: string;
}

export { SuggestApplicationRuleRoute };
