import { BadRequestError } from '@mail-otter/backend-errors';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { ActionService } from '@mail-otter/backend-services/action';
import type { EmailAction } from '@mail-otter/shared/model';

class ScheduleEmailActionRoute extends IUserRoute<ScheduleEmailActionRequest, ScheduleEmailActionResponse, ScheduleEmailActionEnv> {
  schema = {
    tags: ['Actions'],
    summary: 'Schedule a pending email action for auto-execution at a future time',
    responses: {
      '200': { description: 'Updated email action' },
    },
  };

  protected async handleRequest(
    request: ScheduleEmailActionRequest,
    env: ScheduleEmailActionEnv,
    cxt: RouteContext<ScheduleEmailActionEnv>,
  ): Promise<ScheduleEmailActionResponse> {
    const actionId: string | undefined = cxt.req.param('actionId');
    if (!actionId) throw new BadRequestError('Action schedule request is missing actionId.');
    // IBaseRoute pre-parses the body into `request` (consuming the raw stream),
    // so prefer the parsed value and only re-read the raw body for direct
    // handleRequest callers.
    let rawValue: string | null;
    if (request.scheduledFor === undefined) {
      const fallback = await request.raw.json<{ scheduledFor: string | null }>().catch(() => ({ scheduledFor: null }));
      rawValue = fallback.scheduledFor;
    } else {
      rawValue = request.scheduledFor;
    }
    const scheduledFor: Date | null = rawValue ? new Date(rawValue) : null;
    const action = await ActionService.scheduleAction(env, actionId, this.getAuthenticatedUserEmailAddress(cxt), scheduledFor);
    return { action };
  }
}

interface ScheduleEmailActionRequest extends IRequest {
  scheduledFor?: string | null;
}

interface ScheduleEmailActionResponse extends IResponse {
  action: EmailAction;
}

interface ScheduleEmailActionEnv extends IUserEnv {
  ACTION_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  ACTION_SIGNING_SECRET: SecretsStoreSecret;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
}

export { ScheduleEmailActionRoute };
