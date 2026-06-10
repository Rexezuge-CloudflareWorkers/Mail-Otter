import { PROVIDER_GOOGLE_GMAIL, PROVIDER_MICROSOFT_OUTLOOK } from '@mail-otter/shared/constants';
import { ConnectedApplicationDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { BadRequestError } from '@mail-otter/backend-errors';
import type { ConnectedApplication } from '@mail-otter/shared/model';
import { GmailProviderUtil } from '@mail-otter/provider-clients/gmail';
import { OutlookProviderUtil } from '@mail-otter/provider-clients/outlook';
import { OAuth2AccessTokenService } from '../oauth2/OAuth2AccessTokenService';

interface ProviderFolder {
  id: string;
  name: string;
}

class FolderService {
  public static async listFolders(userEmail: string, applicationId: string, env: FolderServiceEnv): Promise<ProviderFolder[]> {
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = new ConnectedApplicationDAO(env.DB, masterKey);
    const application: ConnectedApplication | undefined = await applicationDAO.getByIdForUser(applicationId, userEmail);
    if (!application) {
      throw new BadRequestError('Connected application was not found.');
    }
    const accessToken: string = await OAuth2AccessTokenService.getAccessToken(application.applicationId, env);
    if (application.providerId === PROVIDER_GOOGLE_GMAIL) {
      const labels = await GmailProviderUtil.listLabels(accessToken);
      return labels.map((label) => ({ id: label.id, name: label.name }));
    }
    if (application.providerId === PROVIDER_MICROSOFT_OUTLOOK) {
      const folders = await OutlookProviderUtil.listMailFolders(accessToken);
      return folders.map((folder) => ({ id: folder.id, name: folder.displayName }));
    }
    throw new BadRequestError('Unsupported provider.');
  }
}

interface FolderServiceEnv {
  DB: D1Queryable;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string | undefined;
}

export { FolderService };
export type { FolderServiceEnv, ProviderFolder };
