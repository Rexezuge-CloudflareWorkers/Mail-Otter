import { CONNECTED_APPLICATION_STATUS_DRAFT, CONNECTION_METHOD_OAUTH2 } from '@mail-otter/shared/constants';
import { ConnectedApplicationDAO } from '@/dao';
import { BadRequestError } from '@/error';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type {
  ConnectedApplicationCredentials,
  ConnectedApplicationMetadata,
  OAuth2Credentials,
} from '@mail-otter/shared/model';
import { ApplicationResponseUtil } from '@/utils';
import type { ApplicationResponse } from '@/utils';

class UpdateApplicationRoute extends IUserRoute<UpdateApplicationRequest, UpdateApplicationResponse, UpdateApplicationEnv> {
  schema = {
    tags: ['Applications'],
    summary: 'Update connected mailbox application',
    responses: {
      '200': {
        description: 'Application updated',
      },
    },
  };

  protected async handleRequest(
    request: UpdateApplicationRequest,
    env: UpdateApplicationEnv,
    cxt: RouteContext<UpdateApplicationEnv>,
  ): Promise<UpdateApplicationResponse> {
    const userEmail: string = this.getAuthenticatedUserEmailAddress(cxt);
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const dao: ConnectedApplicationDAO = new ConnectedApplicationDAO(env.DB, masterKey);
    const existing = await dao.getByIdForUser(request.applicationId, userEmail);
    if (!existing) {
      throw new BadRequestError('Connected application was not found.');
    }
    if (existing.providerId !== request.providerId || existing.connectionMethod !== request.connectionMethod) {
      throw new BadRequestError('Provider and connection method cannot be changed after creation.');
    }

    const credentials: ConnectedApplicationCredentials = {
      clientId: request.clientId,
      clientSecret: request.clientSecret,
      refreshToken: (existing.credentials as OAuth2Credentials).refreshToken,
    };
    const application: ConnectedApplicationMetadata | undefined = await dao.updateForUser(
      request.applicationId,
      userEmail,
      request.displayName,
      credentials,
      CONNECTED_APPLICATION_STATUS_DRAFT,
      request.gmailPubsubTopicName || null,
    );
    if (!application) {
      throw new BadRequestError('Connected application was not found.');
    }
    return {
      application: await ApplicationResponseUtil.decorateApplication(application, env, request.raw),
    };
  }
}

interface UpdateApplicationRequest extends IRequest {
  applicationId: string;
  displayName: string;
  providerId: 'google-gmail' | 'microsoft-outlook';
  connectionMethod: typeof CONNECTION_METHOD_OAUTH2;
  clientId: string;
  clientSecret: string;
  gmailPubsubTopicName?: string | undefined;
}

interface UpdateApplicationResponse extends IResponse {
  application: ApplicationResponse;
}

type UpdateApplicationEnv = IUserEnv;

export { UpdateApplicationRoute };
