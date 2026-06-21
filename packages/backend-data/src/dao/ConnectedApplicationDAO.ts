import {
  CONNECTED_APPLICATION_STATUS_CONNECTED,
  CONNECTED_APPLICATION_STATUS_DRAFT,
  CONNECTED_APPLICATION_STATUS_ERROR,
  CONNECTION_METHOD_OAUTH2,
} from '@mail-otter/shared/constants';
import { decryptData, encryptData } from '../crypto';
import { DatabaseError } from '@mail-otter/backend-errors';
import { executeD1WithRetry } from '../utils';
import type { D1Queryable } from '../utils';
import type {
  ConnectedApplication,
  ConnectedApplicationCredentials,
  ConnectedApplicationInternal,
  ConnectedApplicationMetadata,
  OAuth2Credentials,
  SenderDomainFilters,
} from '@mail-otter/shared/model';
import { TimestampUtil, UUIDUtil } from '@mail-otter/shared/utils';

class ConnectedApplicationDAO {
  protected readonly database: D1Queryable;
  protected readonly masterKey: string;

  constructor(database: D1Queryable, masterKey: string) {
    this.database = database;
    this.masterKey = masterKey;
  }

  public async create(
    userEmail: string,
    displayName: string,
    providerId: string,
    connectionMethod: string,
    credentials: ConnectedApplicationCredentials,
    status: string,
    gmailPubsubTopicName?: string | null,
    enabledFeatures?: string[] | null,
  ): Promise<ConnectedApplicationMetadata> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const applicationId: string = UUIDUtil.getRandomUUID();
    const encrypted = await encryptData(JSON.stringify(credentials), this.masterKey);
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              INSERT INTO connected_applications
                (application_id, user_email, provider_email, display_name, provider_id, connection_method, encrypted_credentials, credentials_iv, status, context_indexing_enabled, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
          )
          .bind(
            applicationId,
            userEmail,
            null,
            displayName,
            providerId,
            connectionMethod,
            encrypted.encrypted,
            encrypted.iv,
            status,
            1,
            now,
            now,
          )
          .run(),
      'create connected application',
    );
    if (gmailPubsubTopicName) {
      await this.setProviderConfig(applicationId, 'gmail_pubsub_topic_name', gmailPubsubTopicName, now);
    }
    if (enabledFeatures && enabledFeatures.length > 0) {
      await this.setProviderConfig(applicationId, 'oauth2_enabled_features', JSON.stringify(enabledFeatures), now);
    }
    const application: ConnectedApplicationMetadata | undefined = await this.getMetadataByIdForUser(applicationId, userEmail);
    if (!application) {
      throw new DatabaseError('Failed to load connected application after create.');
    }
    return application;
  }

  public async listMetadataByUserEmail(userEmail: string): Promise<ConnectedApplicationMetadata[]> {
    const rows: ConnectedApplicationInternal[] = await this.database
      .prepare(
        `
          SELECT application_id, user_email, provider_email, display_name, provider_id, connection_method, encrypted_credentials, credentials_iv, status, context_indexing_enabled, max_context_documents, created_at, updated_at
          FROM connected_applications
          WHERE user_email = ?
          ORDER BY updated_at DESC, created_at DESC
        `,
      )
      .bind(userEmail)
      .all<ConnectedApplicationInternal>()
      .then((result: D1Result<ConnectedApplicationInternal>): ConnectedApplicationInternal[] => result.results || []);
    return Promise.all(rows.map((row: ConnectedApplicationInternal): Promise<ConnectedApplicationMetadata> => this.toMetadata(row)));
  }

  public async countByUserEmail(userEmail: string): Promise<number> {
    const row: { count: number } | null = await this.database
      .prepare('SELECT COUNT(*) AS count FROM connected_applications WHERE user_email = ?')
      .bind(userEmail)
      .first<{ count: number }>();
    return row?.count ?? 0;
  }

  public async listContextEnabledApplicationIdsByUserEmail(userEmail: string): Promise<string[]> {
    const rows: Array<{ application_id: string }> = await this.database
      .prepare(
        `
          SELECT application_id
          FROM connected_applications
          WHERE user_email = ? AND context_indexing_enabled = 1
        `,
      )
      .bind(userEmail)
      .all<{ application_id: string }>()
      .then((result: D1Result<{ application_id: string }>): Array<{ application_id: string }> => result.results || []);
    return rows.map((row: { application_id: string }): string => row.application_id);
  }

  public async getMetadataByIdForUser(applicationId: string, userEmail: string): Promise<ConnectedApplicationMetadata | undefined> {
    const row: ConnectedApplicationInternal | undefined = await this.getRowById(applicationId, userEmail);
    return row ? await this.toMetadata(row) : undefined;
  }

  public async getById(applicationId: string): Promise<ConnectedApplication | undefined> {
    const row: ConnectedApplicationInternal | undefined = await this.getRowById(applicationId);
    return row ? await this.toApplication(row) : undefined;
  }

  public async getByIdForUser(applicationId: string, userEmail: string): Promise<ConnectedApplication | undefined> {
    const row: ConnectedApplicationInternal | undefined = await this.getRowById(applicationId, userEmail);
    return row ? await this.toApplication(row) : undefined;
  }

  public async updateForUser(
    applicationId: string,
    userEmail: string,
    displayName: string,
    credentials: ConnectedApplicationCredentials,
    status: string,
    gmailPubsubTopicName?: string | null,
    enabledFeatures?: string[] | null,
    senderDomainFilters?: SenderDomainFilters | null,
  ): Promise<ConnectedApplicationMetadata | undefined> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const encrypted = await encryptData(JSON.stringify(credentials), this.masterKey);
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              UPDATE connected_applications
              SET display_name = ?, encrypted_credentials = ?, credentials_iv = ?, status = ?, updated_at = ?
              WHERE application_id = ? AND user_email = ?
            `,
          )
          .bind(displayName, encrypted.encrypted, encrypted.iv, status, now, applicationId, userEmail)
          .run(),
      'update connected application',
    );
    if (gmailPubsubTopicName) {
      await this.setProviderConfig(applicationId, 'gmail_pubsub_topic_name', gmailPubsubTopicName, now);
    } else if (gmailPubsubTopicName === null) {
      await this.deleteProviderConfig(applicationId, 'gmail_pubsub_topic_name');
    }
    if (enabledFeatures && enabledFeatures.length > 0) {
      await this.setProviderConfig(applicationId, 'oauth2_enabled_features', JSON.stringify(enabledFeatures), now);
    } else if (enabledFeatures !== undefined) {
      await this.deleteProviderConfig(applicationId, 'oauth2_enabled_features');
    }
    if (senderDomainFilters != null && (senderDomainFilters.includeRules.length > 0 || senderDomainFilters.excludeRules.length > 0)) {
      await this.setProviderConfig(applicationId, 'sender_domain_filters', JSON.stringify(senderDomainFilters), now);
    } else if (senderDomainFilters !== undefined) {
      await this.deleteProviderConfig(applicationId, 'sender_domain_filters');
    }
    return this.getMetadataByIdForUser(applicationId, userEmail);
  }

  public async markOAuth2Connected(applicationId: string, refreshToken: string, providerEmail: string): Promise<void> {
    const application: ConnectedApplication | undefined = await this.getById(applicationId);
    if (!application || application.connectionMethod !== CONNECTION_METHOD_OAUTH2) {
      throw new DatabaseError('OAuth2 application was not found.');
    }

    const credentials: OAuth2Credentials = {
      ...(application.credentials as OAuth2Credentials),
      refreshToken,
    };
    const encrypted = await encryptData(JSON.stringify(credentials), this.masterKey);
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              UPDATE connected_applications
              SET encrypted_credentials = ?, credentials_iv = ?, provider_email = ?, status = ?, updated_at = ?
              WHERE application_id = ?
            `,
          )
          .bind(encrypted.encrypted, encrypted.iv, providerEmail, CONNECTED_APPLICATION_STATUS_CONNECTED, now, applicationId)
          .run(),
      'mark OAuth2 application connected',
    );
  }

  public async updateOAuth2RefreshToken(applicationId: string, refreshToken: string): Promise<void> {
    const application: ConnectedApplication | undefined = await this.getById(applicationId);
    if (!application || application.connectionMethod !== CONNECTION_METHOD_OAUTH2) return;
    const credentials: OAuth2Credentials = {
      ...(application.credentials as OAuth2Credentials),
      refreshToken,
    };
    const encrypted = await encryptData(JSON.stringify(credentials), this.masterKey);
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare('UPDATE connected_applications SET encrypted_credentials = ?, credentials_iv = ? WHERE application_id = ?')
          .bind(encrypted.encrypted, encrypted.iv, applicationId)
          .run(),
      'update OAuth2 refresh token',
    );
  }

  public async markError(applicationId: string, _message: string): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare('UPDATE connected_applications SET status = ?, updated_at = ? WHERE application_id = ?')
          .bind(CONNECTED_APPLICATION_STATUS_ERROR, now, applicationId)
          .run(),
      'mark connected application error',
    );
  }

  public async updateContextIndexingForUser(
    applicationId: string,
    userEmail: string,
    contextIndexingEnabled: boolean,
  ): Promise<ConnectedApplicationMetadata | undefined> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              UPDATE connected_applications
              SET context_indexing_enabled = ?, updated_at = ?
              WHERE application_id = ? AND user_email = ?
            `,
          )
          .bind(contextIndexingEnabled ? 1 : 0, now, applicationId, userEmail)
          .run(),
      'update context indexing setting',
    );
    return this.getMetadataByIdForUser(applicationId, userEmail);
  }

  public async updateWatchedFolderIdsForUser(
    applicationId: string,
    userEmail: string,
    folderIds: string[] | null,
    folderNames?: Record<string, string>,
  ): Promise<ConnectedApplicationMetadata | undefined> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    if (folderIds && folderIds.length > 0) {
      await executeD1WithRetry(
        (): Promise<D1Result> =>
          this.database
            .prepare('DELETE FROM application_watched_folders WHERE application_id = ?')
            .bind(applicationId)
            .run(),
        'clear watched folders',
      );
      const stmt = this.database.prepare(
        'INSERT INTO application_watched_folders (application_id, folder_path, folder_name, created_at) VALUES (?, ?, ?, ?)',
      );
      for (const folderPath of folderIds) {
        const folderName: string = folderNames?.[folderPath] || folderPath;
        await executeD1WithRetry(
          (): Promise<D1Result> => stmt.bind(applicationId, folderPath, folderName, now).run(),
          'insert watched folder',
        );
      }
    } else {
      await executeD1WithRetry(
        (): Promise<D1Result> =>
          this.database
            .prepare('DELETE FROM application_watched_folders WHERE application_id = ?')
            .bind(applicationId)
            .run(),
        'clear watched folders',
      );
    }
    return this.getMetadataByIdForUser(applicationId, userEmail);
  }

  public async updateMaxContextDocumentsForUser(
    applicationId: string,
    userEmail: string,
    maxContextDocuments: number | null,
  ): Promise<ConnectedApplicationMetadata | undefined> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              UPDATE connected_applications
              SET max_context_documents = ?, updated_at = ?
              WHERE application_id = ? AND user_email = ?
            `,
          )
          .bind(maxContextDocuments, now, applicationId, userEmail)
          .run(),
      'update max context documents',
    );
    return this.getMetadataByIdForUser(applicationId, userEmail);
  }

  public async deleteForUser(applicationId: string, userEmail: string): Promise<void> {
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare('DELETE FROM connected_applications WHERE application_id = ? AND user_email = ?')
          .bind(applicationId, userEmail)
          .run(),
      'delete connected application',
    );
  }

  public async getProviderConfig(applicationId: string, configKey: string): Promise<string | null> {
    const row: { config_value: string } | null = await this.database
      .prepare('SELECT config_value FROM provider_application_configs WHERE application_id = ? AND config_key = ?')
      .bind(applicationId, configKey)
      .first<{ config_value: string }>();
    return row?.config_value ?? null;
  }

  public async setProviderConfig(applicationId: string, configKey: string, configValue: string, now?: number): Promise<void> {
    const timestamp: number = now ?? TimestampUtil.getCurrentUnixTimestampInSeconds();
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              INSERT INTO provider_application_configs (application_id, config_key, config_value, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(application_id, config_key) DO UPDATE SET config_value = excluded.config_value, updated_at = excluded.updated_at
            `,
          )
          .bind(applicationId, configKey, configValue, timestamp, timestamp)
          .run(),
      'set provider config',
    );
  }

  public async deleteProviderConfig(applicationId: string, configKey: string): Promise<void> {
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare('DELETE FROM provider_application_configs WHERE application_id = ? AND config_key = ?')
          .bind(applicationId, configKey)
          .run(),
      'delete provider config',
    );
  }

  public async getWatchedFolders(applicationId: string): Promise<Array<{ folderPath: string; folderName: string }>> {
    const rows: Array<{ folder_path: string; folder_name: string | null }> = await this.database
      .prepare('SELECT folder_path, folder_name FROM application_watched_folders WHERE application_id = ? ORDER BY folder_path ASC')
      .bind(applicationId)
      .all<{ folder_path: string; folder_name: string | null }>()
      .then((result: D1Result<{ folder_path: string; folder_name: string | null }>): Array<{ folder_path: string; folder_name: string | null }> => result.results || []);
    return rows.map((row: { folder_path: string; folder_name: string | null }): { folderPath: string; folderName: string } => ({
      folderPath: row.folder_path,
      folderName: row.folder_name || row.folder_path,
    }));
  }

  private async getRowById(applicationId: string, userEmail?: string): Promise<ConnectedApplicationInternal | undefined> {
    const whereUser: string = userEmail ? ' AND user_email = ?' : '';
    const bindings: string[] = userEmail ? [applicationId, userEmail] : [applicationId];
    const row: ConnectedApplicationInternal | null = await this.database
      .prepare(
        `
          SELECT application_id, user_email, provider_email, display_name, provider_id, connection_method, encrypted_credentials, credentials_iv, status, context_indexing_enabled, max_context_documents, created_at, updated_at
          FROM connected_applications
          WHERE application_id = ?${whereUser}
          LIMIT 1
        `,
      )
      .bind(...bindings)
      .first<ConnectedApplicationInternal>();
    return row ?? undefined;
  }

  private async toApplication(row: ConnectedApplicationInternal): Promise<ConnectedApplication> {
    const decryptedCredentials: string = await decryptData(row.encrypted_credentials, row.credentials_iv, this.masterKey);
    return {
      ...(await this.toMetadata(row)),
      credentials: JSON.parse(decryptedCredentials) as ConnectedApplicationCredentials,
    };
  }

  private async toMetadata(row: ConnectedApplicationInternal): Promise<ConnectedApplicationMetadata> {
    const status: ConnectedApplicationMetadata['status'] =
      row.status === CONNECTED_APPLICATION_STATUS_CONNECTED
        ? CONNECTED_APPLICATION_STATUS_CONNECTED
        : row.status === CONNECTED_APPLICATION_STATUS_ERROR
          ? CONNECTED_APPLICATION_STATUS_ERROR
          : CONNECTED_APPLICATION_STATUS_DRAFT;
    const [watchedFolders, gmailPubsubTopicName, enabledFeaturesJson, senderDomainFiltersJson]: [
      Array<{ folderPath: string; folderName: string }>,
      string | null,
      string | null,
      string | null,
    ] = await Promise.all([
      this.getWatchedFolders(row.application_id),
      this.getProviderConfig(row.application_id, 'gmail_pubsub_topic_name'),
      this.getProviderConfig(row.application_id, 'oauth2_enabled_features'),
      this.getProviderConfig(row.application_id, 'sender_domain_filters'),
    ]);
    return {
      applicationId: row.application_id,
      userEmail: row.user_email,
      providerEmail: row.provider_email,
      displayName: row.display_name,
      providerId: row.provider_id,
      connectionMethod: row.connection_method,
      status,
      contextIndexingEnabled: row.context_indexing_enabled !== 0,
      maxContextDocuments: row.max_context_documents ?? null,
      enabledFeatures: enabledFeaturesJson ? (JSON.parse(enabledFeaturesJson) as string[]) : null,
      senderDomainFilters: senderDomainFiltersJson ? (JSON.parse(senderDomainFiltersJson) as SenderDomainFilters) : null,
      watchedFolders: watchedFolders.length > 0 ? watchedFolders.map((f) => ({ id: f.folderPath, name: f.folderName })) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      gmailPubsubTopicName: gmailPubsubTopicName ?? undefined,
    };
  }
}

export { ConnectedApplicationDAO };
