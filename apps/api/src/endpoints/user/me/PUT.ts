import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { BadRequestError } from '@mail-otter/backend-errors';
import { UserService } from '@mail-otter/backend-services/user';
import type { UserServiceEnv } from '@mail-otter/backend-services/user';
import { LocaleUtil } from '@mail-otter/shared/utils';
import { Tokens, createRequestScope } from '@mail-otter/backend-services/composition';

class UpdateCurrentUserRoute extends IUserRoute<UpdateCurrentUserRequest, UpdateCurrentUserResponse, UpdateCurrentUserEnv> {
  schema = {
    tags: ['User'],
    summary: 'Update current user preferences',
    responses: {
      '200': {
        description: 'Updated user metadata',
      },
    },
  };

  protected async handleRequest(
    request: UpdateCurrentUserRequest,
    env: UpdateCurrentUserEnv,
    cxt: RouteContext<UpdateCurrentUserEnv>,
  ): Promise<UpdateCurrentUserResponse> {
    const scope = createRequestScope(env);
    if (!request.preferredLanguage || typeof request.preferredLanguage !== 'string') {
      throw new BadRequestError('preferredLanguage is required.');
    }
    const candidate = request.preferredLanguage.trim().toLowerCase();
    const englishAliases = ['en', 'en-us', 'en_us', 'en-gb', 'en_gb'];
    if (!LocaleUtil.isSupported(request.preferredLanguage) && LocaleUtil.normalize(request.preferredLanguage) === 'en' && !englishAliases.includes(candidate)) {
      throw new BadRequestError('Unsupported language.');
    }
    const userEmail = this.getAuthenticatedUserEmailAddress(cxt);
    const normalized = await scope.get(Tokens.UserService).updatePreferredLanguage(userEmail, request.preferredLanguage);
    const summary = await scope.get(Tokens.UserService).getCurrentUserSummary(userEmail);
    return {
      email: userEmail,
      limits: summary.limits,
      aiUsage: summary.aiUsage,
      preferredLanguage: normalized,
    };
  }
}

interface UpdateCurrentUserRequest extends IRequest {
  preferredLanguage: string;
}

interface UpdateCurrentUserResponse extends IResponse {
  email: string;
  preferredLanguage: string | null;
  limits: {
    maxApplicationsPerUser: number;
    maxContextDocumentsPerApplication: number;
  };
  aiUsage: {
    estimatedNeurons: number;
    dailyNeuronLimit: number;
    fallbackThreshold: number;
  };
}

interface UpdateCurrentUserEnv extends IUserEnv, UserServiceEnv {}

export { UpdateCurrentUserRoute };
