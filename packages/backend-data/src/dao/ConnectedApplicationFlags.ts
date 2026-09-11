import { executeD1WithRetry } from '../utils';
import { TimestampUtil } from '@mail-otter/shared/utils';
import { BaseDAO } from './BaseDAO';

// Provider-config / flag query concerns extracted from ConnectedApplicationDAO
// god-file. ConnectedApplicationDAO delegates to this helper (composition) to
// keep public signatures stable while reducing the facade size.
class ConnectedApplicationFlags extends BaseDAO {
  public async listApplicationIdsWithFeatureEnabled(featureName: string): Promise<string[]> {
    const rows: Array<{ application_id: string }> = await this.database
      .prepare(
        `
          SELECT pac.application_id
          FROM provider_application_configs pac, json_each(pac.config_value) je
          JOIN connected_applications ca ON ca.application_id = pac.application_id
          WHERE pac.config_key = 'oauth2_enabled_features'
            AND je.value = ?
            AND ca.status = 'connected'
        `,
      )
      .bind(featureName)
      .all<{ application_id: string }>()
      .then((result: D1Result<{ application_id: string }>): Array<{ application_id: string }> => result.results || []);
    return rows.map((row) => row.application_id);
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
      .then(
        (
          result: D1Result<{ folder_path: string; folder_name: string | null }>,
        ): Array<{ folder_path: string; folder_name: string | null }> => result.results || [],
      );
    return rows.map((row: { folder_path: string; folder_name: string | null }): { folderPath: string; folderName: string } => ({
      folderPath: row.folder_path,
      folderName: row.folder_name || row.folder_path,
    }));
  }

  public async saveImapConfig(
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

  public async acknowledgeError(applicationId: string, userEmail: string, errorType: 'processing' | 'context'): Promise<void> {
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
  }

  public async replaceWatchedFolders(
    applicationId: string,
    folderIds: string[] | null,
    folderNames: Record<string, string> | undefined,
    now: number,
  ): Promise<void> {
    if (folderIds && folderIds.length > 0) {
      await executeD1WithRetry(
        (): Promise<D1Result> =>
          this.database.prepare('DELETE FROM application_watched_folders WHERE application_id = ?').bind(applicationId).run(),
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
          this.database.prepare('DELETE FROM application_watched_folders WHERE application_id = ?').bind(applicationId).run(),
        'clear watched folders',
      );
    }
  }
}

export { ConnectedApplicationFlags };
