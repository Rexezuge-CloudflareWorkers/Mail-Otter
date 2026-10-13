import { TimestampUtil } from '@mail-otter/shared/utils';
import { BaseDAO } from './BaseDAO';
import { userScopeSql } from './userScope';
import type { UserScope, UserScopeSql } from './userScope';

// Provider-config / flag query concerns extracted from ConnectedApplicationDAO
// god-file. ConnectedApplicationDAO delegates to this helper (composition) to
// keep public signatures stable while reducing the facade size.
class ConnectedApplicationFlags extends BaseDAO {
  public async listApplicationIdsWithFeatureEnabled(featureName: string): Promise<string[]> {
    const rows: Array<{ application_id: string }> = await this.all<{ application_id: string }>(
      ` SELECT pac.application_id FROM provider_application_configs pac, json_each(pac.config_value) je JOIN connected_applications ca ON ca.application_id = pac.application_id WHERE pac.config_key = 'oauth2_enabled_features' AND je.value = ? AND ca.status = 'connected' `,
      [featureName],
    );
    return rows.map((row) => row.application_id);
  }

  public async listApplicationIdsWithProviderConfig(configKey: string, configValue: string): Promise<string[]> {
    const rows: Array<{ application_id: string }> = await this.all<{ application_id: string }>(
      ` SELECT pac.application_id FROM provider_application_configs pac JOIN connected_applications ca ON ca.application_id = pac.application_id WHERE pac.config_key = ? AND pac.config_value = ? AND ca.status = 'connected' `,
      [configKey, configValue],
    );
    return rows.map((row) => row.application_id);
  }

  public async getProviderConfig(applicationId: string, configKey: string): Promise<string | null> {
    const row: { config_value: string } | null = await this.first<{ config_value: string }>(
      'SELECT config_value FROM provider_application_configs WHERE application_id = ? AND config_key = ?',
      [applicationId, configKey],
    );
    return row?.config_value ?? null;
  }

  public async setProviderConfig(applicationId: string, configKey: string, configValue: string, now?: number): Promise<void> {
    const timestamp: number = now ?? TimestampUtil.getCurrentUnixTimestampInSeconds();
    await this.run(
      ` INSERT INTO provider_application_configs (application_id, config_key, config_value, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(application_id, config_key) DO UPDATE SET config_value = excluded.config_value, updated_at = excluded.updated_at `,
      [applicationId, configKey, configValue, timestamp, timestamp],
    );
  }

  public async deleteProviderConfig(applicationId: string, configKey: string): Promise<void> {
    await this.run('DELETE FROM provider_application_configs WHERE application_id = ? AND config_key = ?', [applicationId, configKey]);
  }

  public async getWatchedFolders(applicationId: string): Promise<Array<{ folderPath: string; folderName: string }>> {
    const rows: Array<{ folder_path: string; folder_name: string | null }> = await this.all<{
      folder_path: string;
      folder_name: string | null;
    }>('SELECT folder_path, folder_name FROM application_watched_folders WHERE application_id = ? ORDER BY folder_path ASC', [
      applicationId,
    ]);
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

  public async acknowledgeError(applicationId: string, scope: UserScope, errorType: 'processing' | 'context'): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const column: string = errorType === 'processing' ? 'last_error_acknowledged_at' : 'context_last_error_acknowledged_at';
    const where: UserScopeSql = userScopeSql(scope);
    await this.run(`UPDATE connected_applications SET ${column} = ?, updated_at = ? WHERE application_id = ? AND ${where.clause}`, [
      now,
      now,
      applicationId,
      ...where.bindings,
    ]);
  }

  public async replaceWatchedFolders(
    applicationId: string,
    folderIds: string[] | null,
    folderNames: Record<string, string> | undefined,
    now: number,
  ): Promise<void> {
    if (folderIds && folderIds.length > 0) {
      await this.run('DELETE FROM application_watched_folders WHERE application_id = ?', [applicationId]);
      const stmt = this.database.prepare(
        'INSERT INTO application_watched_folders (application_id, folder_path, folder_name, created_at) VALUES (?, ?, ?, ?)',
      );
      for (const folderPath of folderIds) {
        const folderName: string = folderNames?.[folderPath] || folderPath;
        await stmt.bind(applicationId, folderPath, folderName, now).run();
      }
    } else {
      await this.run('DELETE FROM application_watched_folders WHERE application_id = ?', [applicationId]);
    }
  }
}

export { ConnectedApplicationFlags };
