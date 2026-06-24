import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { ConnectedApplicationDAO } from '@mail-otter/backend-data/dao';
import { createD1SessionEnv } from '@mail-otter/backend-data/utils';
import { BadRequestError } from '@mail-otter/backend-errors';
import { DigestService } from '@mail-otter/backend-services/digest';
import { OAuth2AccessTokenService } from '@mail-otter/backend-services/oauth2';

class SendDigestNowRoute extends IUserRoute<SendDigestNowRequest, SendDigestNowResponse, SendDigestNowEnv> {
  schema = {
    tags: ['Applications'],
    summary: 'Manually trigger digest email for a connected application',
    responses: {
      '200': {
        description: 'Digest sent',
      },
    },
  };

  protected async handleRequest(
    request: SendDigestNowRequest,
    env: SendDigestNowEnv,
    cxt: RouteContext<SendDigestNowEnv>,
  ): Promise<SendDigestNowResponse> {
    const userEmail = this.getAuthenticatedUserEmailAddress(cxt);
    const sessionEnv = createD1SessionEnv(env);
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = new ConnectedApplicationDAO(sessionEnv.DB, masterKey);

    const application = await applicationDAO.getByIdForUser(request.applicationId, userEmail);
    if (!application) throw new BadRequestError('Connected application not found.');

    const accessToken = await new OAuth2AccessTokenService(env).getAccessToken(request.applicationId);
    const digestSvc = new DigestService(env, masterKey);

    await digestSvc.sendDigestForced(application, accessToken);
    return { sent: true };
  }
}

interface SendDigestNowRequest extends IRequest {
  applicationId: string;
}

interface SendDigestNowResponse extends IResponse {
  sent: boolean;
}

interface SendDigestNowEnv extends IUserEnv {
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string | undefined;
}

export { SendDigestNowRoute };
