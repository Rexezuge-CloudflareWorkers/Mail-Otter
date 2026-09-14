import { BadRequestError } from '@mail-otter/backend-errors';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { ActionService } from '@mail-otter/backend-services/action';
import type { EmailAction } from '@mail-otter/shared/model';

class SnoozeEmailActionRoute extends IUserRoute<SnoozeEmailActionRequest, SnoozeEmailActionResponse, SnoozeEmailActionEnv> {
  schema = {
    tags: ['Actions'],
    summary: 'Snooze a pending email action until a future time',
    responses: {
      '200': { description: 'Updated email action' },
    },
  };

  protected async handleRequest(
    request: SnoozeEmailActionRequest,
    env: SnoozeEmailActionEnv,
    cxt: RouteContext<SnoozeEmailActionEnv>,
  ): Promise<SnoozeEmailActionResponse> {
    const actionId: string | undefined = cxt.req.param('actionId');
    if (!actionId) throw new BadRequestError('Action snooze request is missing actionId.');
    // IBaseRoute pre-parses the body into `request` (consuming the raw stream),
    // so prefer the parsed value and only re-read the raw body for direct
    // handleRequest callers.
    let rawValue: string | null;
    if (request.snoozedUntil === undefined) {
      const fallback = await request.raw.json<{ snoozedUntil: string | null }>().catch(() => ({ snoozedUntil: null }));
      rawValue = fallback.snoozedUntil;
    } else {
      rawValue = request.snoozedUntil;
    }
    const snoozedUntil: Date | null = rawValue ? new Date(rawValue) : null;
    const action = await ActionService.snoozeAction(env, actionId, this.getAuthenticatedUserEmailAddress(cxt), snoozedUntil);
    return { action };
  }
}

interface SnoozeEmailActionRequest extends IRequest {
  snoozedUntil?: string | null;
}

interface SnoozeEmailActionResponse extends IResponse {
  action: EmailAction;
}

interface SnoozeEmailActionEnv extends IUserEnv {
  ACTION_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  ACTION_SIGNING_SECRET: SecretsStoreSecret;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
}

export { SnoozeEmailActionRoute };
