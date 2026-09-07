import { OneDriveIngestionService } from '@mail-otter/backend-services/drive';
import type { DriveIngestionResult } from '@mail-otter/backend-services/drive';
import type { ConnectedApplication } from '@mail-otter/shared/model';
import {
  BACKGROUND_TASK_TYPE_ONEDRIVE_SYNC,
  PROVIDER_MICROSOFT_OUTLOOK,
} from '@mail-otter/shared/constants';
import { BaseDriveSyncTask } from './BaseDriveSyncTask';
import type { BaseDriveSyncTaskEnv, DriveSyncConfig } from './BaseDriveSyncTask';

class OneDriveSyncTask extends BaseDriveSyncTask<OneDriveSyncTaskEnv> {
  protected config(): DriveSyncConfig {
    return {
      taskType: BACKGROUND_TASK_TYPE_ONEDRIVE_SYNC,
      featureFlag: 'onedrive',
      expectedProviderId: PROVIDER_MICROSOFT_OUTLOOK,
      unsupportedProviderMessage: 'Provider does not support OneDrive',
      noun: 'OneDrive',
    };
  }

  protected ingestForApplication(
    env: OneDriveSyncTaskEnv,
    application: ConnectedApplication,
    accessToken: string,
  ): Promise<DriveIngestionResult> {
    return new OneDriveIngestionService(env).ingestForApplication(application, accessToken);
  }
}

interface OneDriveSyncTaskEnv extends BaseDriveSyncTaskEnv {
  DB: D1Database;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  AI: Ai;
  EMAIL_CONTEXT_INDEX?: VectorizeIndex;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
  MAX_ATTACHMENT_SIZE_BYTES?: string;
  MAX_DRIVE_FILES_PER_SYNC?: string;
  AI_EMBEDDING_MODEL?: string;
  MAX_CONTEXT_MEMORY_CHARS?: string;
  AI_DAILY_NEURON_FALLBACK_THRESHOLD?: string;
}

export { OneDriveSyncTask };
