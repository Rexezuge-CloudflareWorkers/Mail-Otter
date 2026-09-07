import { GoogleDriveIngestionService } from '@mail-otter/backend-services/drive';
import type { DriveIngestionResult } from '@mail-otter/backend-services/drive';
import type { ConnectedApplication } from '@mail-otter/shared/model';
import {
  BACKGROUND_TASK_TYPE_GOOGLE_DRIVE_SYNC,
  PROVIDER_GOOGLE_GMAIL,
} from '@mail-otter/shared/constants';
import { BaseDriveSyncTask } from './BaseDriveSyncTask';
import type { BaseDriveSyncTaskEnv, DriveSyncConfig } from './BaseDriveSyncTask';

class GoogleDriveSyncTask extends BaseDriveSyncTask<GoogleDriveSyncTaskEnv> {
  protected config(): DriveSyncConfig {
    return {
      taskType: BACKGROUND_TASK_TYPE_GOOGLE_DRIVE_SYNC,
      featureFlag: 'google_drive',
      expectedProviderId: PROVIDER_GOOGLE_GMAIL,
      unsupportedProviderMessage: 'Provider does not support Google Drive',
      noun: 'Drive',
    };
  }

  protected ingestForApplication(
    env: GoogleDriveSyncTaskEnv,
    application: ConnectedApplication,
    accessToken: string,
  ): Promise<DriveIngestionResult> {
    return new GoogleDriveIngestionService(env).ingestForApplication(application, accessToken);
  }
}

interface GoogleDriveSyncTaskEnv extends BaseDriveSyncTaskEnv {
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

export { GoogleDriveSyncTask };
