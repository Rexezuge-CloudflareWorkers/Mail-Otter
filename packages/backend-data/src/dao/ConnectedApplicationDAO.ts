import {
  CONNECTED_APPLICATION_STATUS_CONNECTED,
  CONNECTED_APPLICATION_STATUS_DRAFT,
  CONNECTED_APPLICATION_STATUS_ERROR,
  CONNECTION_METHOD_IMAP_PASSWORD,
  CONNECTION_METHOD_OAUTH2,
} from '@mail-otter/shared/constants';
import { decryptData, encryptData } from '../crypto';
import { DatabaseError } from '@mail-otter/backend-errors';
import { executeD1WithRetry } from '../utils';
import type {
  ConnectedApplication,
  ConnectedApplicationCredentials,
  ConnectedApplicationInternal,
  ConnectedApplicationMetadata,
  EmailProcessingRule,
  OAuth2Credentials,
  SenderDomainFilters,
} from '@mail-otter/shared/model';
import { TimestampUtil, TimeZoneUtil, UUIDUtil } from '@mail-otter/shared/utils';
import { EncryptedDAO } from './BaseDAO';

class ConnectedApplicationDAO extends EncryptedDAO {

  public async create(
    userEmail: string,
    displayName: string,
    providerId: string,
    connectionMethod: string,
    credentials: ConnectedApplicationCredentials,
    status: string,
    gmailPubsubTopicName?: string | null,
    enabledFeatures?: string[] | null,
    timeZone?: string | null,
    imapConfig?: { host?: string | null; port?: number | null; username?: string | null; smtpHost?: string | null; smtpPort?: number | null } | null,
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
    if (timeZone) {
      await this.setProviderConfig(applicationId, 'calendar_time_zone', TimeZoneUtil.normalize(timeZone), now);
    }
    if (imapConfig) {
      await this.saveImapConfig(applicationId, imapConfig, now);
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
          SELECT application_id, user_email, provider_email, display_name, provider_id, connection_method, encrypted_credentials, credentials_iv, status, context_indexing_enabled, rag_retrieval_enabled, max_context_documents, last_error_acknowledged_at, context_last_error_acknowledged_at, created_at, updated_at
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
    timeZone?: string | null,
    imapConfig?: { host?: string | null; port?: number | null; username?: string | null; smtpHost?: string | null; smtpPort?: number | null } | null,
    autoExecuteActionTypes?: string[] | null,
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
    if (senderDomainFilters != null && senderDomainFilters.includeRules.length > 0) {
      await this.setProviderConfig(applicationId, 'sender_domain_filters', JSON.stringify(senderDomainFilters), now);
    } else if (senderDomainFilters !== undefined) {
      await this.deleteProviderConfig(applicationId, 'sender_domain_filters');
    }
    if (timeZone) {
      await this.setProviderConfig(applicationId, 'calendar_time_zone', TimeZoneUtil.normalize(timeZone), now);
    } else if (timeZone === null) {
      await this.deleteProviderConfig(applicationId, 'calendar_time_zone');
    }
    if (imapConfig) {
      await this.saveImapConfig(applicationId, imapConfig, now);
    }
    if (autoExecuteActionTypes && autoExecuteActionTypes.length > 0) {
      await this.setProviderConfig(applicationId, 'auto_execute_action_types', JSON.stringify(autoExecuteActionTypes), now);
    } else if (autoExecuteActionTypes !== undefined) {
      await this.deleteProviderConfig(applicationId, 'auto_execute_action_types');
    }
    return this.getMetadataByIdForUser(applicationId, userEmail);
  }

  public async markImapConnected(applicationId: string, providerEmail: string): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `UPDATE connected_applications SET provider_email = ?, status = ?, updated_at = ? WHERE application_id = ? AND connection_method = ?`,
          )
          .bind(providerEmail, CONNECTED_APPLICATION_STATUS_CONNECTED, now, applicationId, CONNECTION_METHOD_IMAP_PASSWORD)
          .run(),
      'mark IMAP application connected',
    );
  }

  private async saveImapConfig(
    applicationId: string,
    config: { host?: string | null; port?: number | null; username?: string | null; smtpHost?: string | null; smtpPort?: number | null },
    now: number,
  ): Promise<void> {
    const entries: Array<[string, string | null]> = [
      ['imap_host', config.host ?? null],
      ['imap_port', config.port == null ? null : String(config.port)],
      ['imap_username', config.username ?? null],
      ['smtp_host', config.smtpHost ?? null],
      ['smtp_port', config.smtpPort == null ? null : String(config.smtpPort)],
    ];
    for (const [key, value] of entries) {
      if (value == null) {
        await this.deleteProviderConfig(applicationId, key);
      } else {
        await this.setProviderConfig(applicationId, key, value, now);
      }
    }
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

  public async updateRagRetrievalForUser(
    applicationId: string,
    userEmail: string,
    ragRetrievalEnabled: boolean,
  ): Promise<ConnectedApplicationMetadata | undefined> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              UPDATE connected_applications
              SET rag_retrieval_enabled = ?, updated_at = ?
              WHERE application_id = ? AND user_email = ?
            `,
          )
          .bind(ragRetrievalEnabled ? 1 : 0, now, applicationId, userEmail)
          .run(),
      'update rag retrieval setting',
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

  public async listApplicationIdsWithProviderConfig(configKey: string, configValue: string): Promise<string[]> {
    const rows: Array<{ application_id: string }> = await this.database
      .prepare(
        `
          SELECT pac.application_id
          FROM provider_application_configs pac
          JOIN connected_applications ca ON ca.application_id = pac.application_id
          WHERE pac.config_key = ? AND pac.config_value = ? AND ca.status = 'connected'
        `,
      )
      .bind(configKey, configValue)
      .all<{ application_id: string }>()
      .then((result: D1Result<{ application_id: string }>): Array<{ application_id: string }> => result.results || []);
    return rows.map((row) => row.application_id);
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
          SELECT application_id, user_email, provider_email, display_name, provider_id, connection_method, encrypted_credentials, credentials_iv, status, context_indexing_enabled, rag_retrieval_enabled, max_context_documents, last_error_acknowledged_at, context_last_error_acknowledged_at, created_at, updated_at
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
    const credentials: ConnectedApplicationCredentials = JSON.parse(decryptedCredentials) as ConnectedApplicationCredentials;
    const metadata = await this.toMetadata(row);
    const imapPassword: string | null = row.connection_method === CONNECTION_METHOD_IMAP_PASSWORD
      ? ((credentials as { imapPassword?: string }).imapPassword ?? null)
      : null;
    return {
      ...metadata,
      ...((imapPassword != null) && { imapPassword }),
      credentials,
    };
  }

  private async toMetadata(row: ConnectedApplicationInternal): Promise<ConnectedApplicationMetadata> {
    const status: ConnectedApplicationMetadata['status'] =
      row.status === CONNECTED_APPLICATION_STATUS_CONNECTED
        ? CONNECTED_APPLICATION_STATUS_CONNECTED
        : row.status === CONNECTED_APPLICATION_STATUS_ERROR
          ? CONNECTED_APPLICATION_STATUS_ERROR
          : CONNECTED_APPLICATION_STATUS_DRAFT;
    const [watchedFolders, gmailPubsubTopicName, enabledFeaturesJson, senderDomainFiltersJson, timeZone, emailProcessingRulesJson, imapHost, imapPortStr, imapUsername, smtpHost, smtpPortStr, autoExecuteActionTypesJson]: [
      Array<{ folderPath: string; folderName: string }>,
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
    ] = await Promise.all([
      this.getWatchedFolders(row.application_id),
      this.getProviderConfig(row.application_id, 'gmail_pubsub_topic_name'),
      this.getProviderConfig(row.application_id, 'oauth2_enabled_features'),
      this.getProviderConfig(row.application_id, 'sender_domain_filters'),
      this.getProviderConfig(row.application_id, 'calendar_time_zone'),
      this.getProviderConfig(row.application_id, 'email_processing_rules'),
      this.getProviderConfig(row.application_id, 'imap_host'),
      this.getProviderConfig(row.application_id, 'imap_port'),
      this.getProviderConfig(row.application_id, 'imap_username'),
      this.getProviderConfig(row.application_id, 'smtp_host'),
      this.getProviderConfig(row.application_id, 'smtp_port'),
      this.getProviderConfig(row.application_id, 'auto_execute_action_types'),
    ]);
    // Lazily migrate legacy excludeRules (stored in sender_domain_filters) into email processing rules
    let senderDomainFilters: SenderDomainFilters | null = null;
    let resolvedRulesJson: string | null = emailProcessingRulesJson;
    if (senderDomainFiltersJson) {
      const parsed = JSON.parse(senderDomainFiltersJson) as { includeRules?: string[]; excludeRules?: string[] };
      const legacyExcludes = parsed.excludeRules ?? [];
      const includeRules = parsed.includeRules ?? [];
      if (legacyExcludes.length > 0) {
        const migratedRules: EmailProcessingRule[] = legacyExcludes.map((pattern) => ({
          ruleId: UUIDUtil.getRandomUUID(),
          name: `Block ${pattern}`,
          enabled: true,
          conditions: { operator: 'any' as const, matchers: [{ field: 'from' as const, op: 'matches_sender' as const, value: pattern }] },
          action: { type: 'skip' as const },
        }));
        const existingRules: EmailProcessingRule[] = emailProcessingRulesJson ? (JSON.parse(emailProcessingRulesJson) as EmailProcessingRule[]) : [];
        const merged = [...existingRules, ...migratedRules];
        resolvedRulesJson = JSON.stringify(merged);
        await this.setProviderConfig(row.application_id, 'email_processing_rules', resolvedRulesJson);
        if (includeRules.length > 0) {
          await this.setProviderConfig(row.application_id, 'sender_domain_filters', JSON.stringify({ includeRules }));
          senderDomainFilters = { includeRules };
        } else {
          await this.deleteProviderConfig(row.application_id, 'sender_domain_filters');
        }
      } else {
        senderDomainFilters = includeRules.length > 0 ? { includeRules } : null;
      }
    }

    return {
      applicationId: row.application_id,
      userEmail: row.user_email,
      providerEmail: row.provider_email,
      displayName: row.display_name,
      providerId: row.provider_id,
      connectionMethod: row.connection_method,
      status,
      contextIndexingEnabled: row.context_indexing_enabled !== 0,
      ragRetrievalEnabled: row.rag_retrieval_enabled !== 0,
      maxContextDocuments: row.max_context_documents ?? null,
      enabledFeatures: enabledFeaturesJson ? (JSON.parse(enabledFeaturesJson) as string[]) : null,
      timeZone: timeZone ?? null,
      senderDomainFilters,
      emailProcessingRules: resolvedRulesJson ? (JSON.parse(resolvedRulesJson) as EmailProcessingRule[]) : null,
      watchedFolders: watchedFolders.length > 0 ? watchedFolders.map((f) => ({ id: f.folderPath, name: f.folderName })) : null,
      lastErrorAcknowledgedAt: row.last_error_acknowledged_at ?? null,
      contextLastErrorAcknowledgedAt: row.context_last_error_acknowledged_at ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      gmailPubsubTopicName: gmailPubsubTopicName ?? undefined,
      imapHost: imapHost ?? null,
      imapPort: imapPortStr == null ? null : Number(imapPortStr),
      imapUsername: imapUsername ?? null,
      smtpHost: smtpHost ?? null,
      smtpPort: smtpPortStr == null ? null : Number(smtpPortStr),
      autoExecuteActionTypes: autoExecuteActionTypesJson ? (JSON.parse(autoExecuteActionTypesJson) as string[]) : null,
    };
  }

  public async updateEmailProcessingRulesForUser(
    applicationId: string,
    userEmail: string,
    rules: EmailProcessingRule[],
  ): Promise<ConnectedApplicationMetadata | undefined> {
    if (rules.length > 0) {
      await this.setProviderConfig(applicationId, 'email_processing_rules', JSON.stringify(rules));
    } else {
      await this.deleteProviderConfig(applicationId, 'email_processing_rules');
    }
    return this.getMetadataByIdForUser(applicationId, userEmail);
  }

  public async acknowledgeErrorForUser(
    applicationId: string,
    userEmail: string,
    errorType: 'processing' | 'context',
  ): Promise<ConnectedApplicationMetadata | undefined> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const column: string = errorType === 'processing' ? 'last_error_acknowledged_at' : 'context_last_error_acknowledged_at';
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(`UPDATE connected_applications SET ${column} = ?, updated_at = ? WHERE application_id = ? AND user_email = ?`)
          .bind(now, now, applicationId, userEmail)
          .run(),
      'acknowledge application error',
    );
    return this.getMetadataByIdForUser(applicationId, userEmail);
  }
}

export { ConnectedApplicationDAO };
