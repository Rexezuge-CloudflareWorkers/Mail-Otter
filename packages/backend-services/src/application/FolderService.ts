import { ConnectedApplicationDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { BadRequestError } from '@mail-otter/backend-errors';
import type { ConnectedApplication } from '@mail-otter/shared/model';
import { EmailProviderRegistry } from '../provider/EmailProviderRegistry';
import type { ProviderFolder } from '../provider/IEmailProvider';
import { OAuth2AccessTokenService } from '../oauth2/OAuth2AccessTokenService';

class FolderService {
  constructor(private readonly env: FolderServiceEnv) {}

  async listFolders(userEmail: string, applicationId: string): Promise<ProviderFolder[]> {
    const masterKey: string = await this.env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = new ConnectedApplicationDAO(this.env.DB, masterKey);
    const application: ConnectedApplication | undefined = await applicationDAO.getByIdForUser(applicationId, userEmail);
    if (!application) {
      throw new BadRequestError('Connected application was not found.');
    }
    const accessToken: string = await new OAuth2AccessTokenService(this.env).getAccessToken(application.applicationId);
    return EmailProviderRegistry.get(application.providerId).listFolders(accessToken);
  }
}

const FolderServiceFactory = {
  create(env: FolderServiceEnv): FolderService {
    return new FolderService(env);
  },
};

interface FolderServiceEnv {
  DB: D1Queryable;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
}

export { FolderService, FolderServiceFactory };
export type { FolderServiceEnv,  };

export {type ProviderFolder} from '../provider/IEmailProvider';