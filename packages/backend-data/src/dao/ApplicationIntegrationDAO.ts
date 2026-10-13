import { encryptData, decryptData } from '../crypto';
import { BadRequestError, NotFoundError } from '@rexezuge/errors';
import type { OutboundIntegration, OutboundIntegrationInternal, OutboundIntegrationType } from '@mail-otter/shared/model';
import { TimestampUtil, UUIDUtil } from '@mail-otter/shared/utils';
import { userScopeSql } from './userScope';
import type { UserScope, UserScopeSql } from './userScope';
import { EncryptedDAO } from './BaseDAO';

const MAX_INTEGRATIONS_PER_APPLICATION = 5;
const WEBHOOK_URL_PREFIX_LENGTH = 30;

class ApplicationIntegrationDAO extends EncryptedDAO {
  public async create(
    applicationId: string,
    integrationType: OutboundIntegrationType,
    name: string,
    webhookUrl: string,
  ): Promise<OutboundIntegration> {
    const count = await this.countByApplicationId(applicationId);
    if (count >= MAX_INTEGRATIONS_PER_APPLICATION) {
      throw new BadRequestError(`Maximum ${MAX_INTEGRATIONS_PER_APPLICATION} integrations allowed per mailbox.`);
    }
    const now = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const integrationId = UUIDUtil.getRandomUUID();
    const encrypted = await encryptData(webhookUrl, this.masterKey);
    const webhookUrlPrefix = ApplicationIntegrationDAO.maskUrl(webhookUrl);
    await this.run(
      `INSERT INTO application_integrations (integration_id, application_id, integration_type, name, encrypted_webhook_url, webhook_url_iv, webhook_url_prefix, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [integrationId, applicationId, integrationType, name, encrypted.encrypted, encrypted.iv, webhookUrlPrefix, now, now],
    );
    return this.toPublic({
      integration_id: integrationId,
      application_id: applicationId,
      integration_type: integrationType,
      name,
      encrypted_webhook_url: encrypted.encrypted,
      webhook_url_iv: encrypted.iv,
      webhook_url_prefix: webhookUrlPrefix,
      enabled: 1,
      created_at: now,
      updated_at: now,
      last_delivery_at: null,
      last_delivery_status: null,
      consecutive_failures: 0,
    });
  }

  public async listByApplicationId(applicationId: string): Promise<OutboundIntegration[]> {
    const rows = await this.all<OutboundIntegrationInternal>(
      'SELECT * FROM application_integrations WHERE application_id = ? ORDER BY created_at ASC',
      [applicationId],
    );
    return rows.map((row) => this.toPublic(row));
  }

  public async listEnabled(applicationId: string): Promise<OutboundIntegration[]> {
    const rows = await this.all<OutboundIntegrationInternal>(
      'SELECT * FROM application_integrations WHERE application_id = ? AND enabled = 1 ORDER BY created_at ASC',
      [applicationId],
    );
    return rows.map((row) => this.toPublic(row));
  }

  public async getByIdForUser(integrationId: string, scope: UserScope): Promise<OutboundIntegration | null> {
    const where: UserScopeSql = userScopeSql(scope, 'ca');
    const row = await this.first<OutboundIntegrationInternal>(
      `SELECT ai.* FROM application_integrations ai JOIN connected_applications ca ON ca.application_id = ai.application_id WHERE ai.integration_id = ? AND ${where.clause} LIMIT 1`,
      [integrationId, ...where.bindings],
    );
    return row ? this.toPublic(row) : null;
  }

  public async getApplicationIdForUser(integrationId: string, scope: UserScope): Promise<string | null> {
    const where: UserScopeSql = userScopeSql(scope, 'ca');
    const row = await this.first<{ application_id: string }>(
      `SELECT ai.application_id FROM application_integrations ai JOIN connected_applications ca ON ca.application_id = ai.application_id WHERE ai.integration_id = ? AND ${where.clause} LIMIT 1`,
      [integrationId, ...where.bindings],
    );
    return row?.application_id ?? null;
  }

  public async getDecryptedWebhookUrl(integrationId: string): Promise<string> {
    const row = await this.first<{ encrypted_webhook_url: string; webhook_url_iv: string }>(
      'SELECT encrypted_webhook_url, webhook_url_iv FROM application_integrations WHERE integration_id = ? LIMIT 1',
      [integrationId],
    );
    if (!row) throw new NotFoundError('Integration not found.');
    return decryptData(row.encrypted_webhook_url, row.webhook_url_iv, this.masterKey);
  }

  public async update(
    integrationId: string,
    patch: { name?: string; enabled?: boolean; webhookUrl?: string },
  ): Promise<OutboundIntegration> {
    const now = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const fields: string[] = ['updated_at = ?'];
    const bindings: unknown[] = [now];

    if (patch.name !== undefined) {
      fields.push('name = ?');
      bindings.push(patch.name);
    }
    if (patch.enabled !== undefined) {
      fields.push('enabled = ?');
      bindings.push(patch.enabled ? 1 : 0);
    }
    if (patch.webhookUrl !== undefined) {
      const encrypted = await encryptData(patch.webhookUrl, this.masterKey);
      fields.push('encrypted_webhook_url = ?', 'webhook_url_iv = ?', 'webhook_url_prefix = ?');
      bindings.push(encrypted.encrypted, encrypted.iv, ApplicationIntegrationDAO.maskUrl(patch.webhookUrl));
    }

    bindings.push(integrationId);
    await this.run(`UPDATE application_integrations SET ${fields.join(', ')} WHERE integration_id = ?`, [...bindings]);
    const row = await this.first<OutboundIntegrationInternal>('SELECT * FROM application_integrations WHERE integration_id = ? LIMIT 1', [
      integrationId,
    ]);
    if (!row) throw new NotFoundError('Integration not found after update.');
    return this.toPublic(row);
  }

  public async deleteById(integrationId: string): Promise<void> {
    await this.run('DELETE FROM application_integrations WHERE integration_id = ?', [integrationId]);
  }

  public async countByApplicationId(applicationId: string): Promise<number> {
    const row = await this.first<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM application_integrations WHERE application_id = ?', [
      applicationId,
    ]);
    return row?.cnt ?? 0;
  }

  private toPublic(row: OutboundIntegrationInternal): OutboundIntegration {
    return {
      integrationId: row.integration_id,
      applicationId: row.application_id,
      integrationType: row.integration_type as OutboundIntegrationType,
      name: row.name,
      maskedWebhookUrl: row.webhook_url_prefix ? `${row.webhook_url_prefix}...` : '',
      enabled: row.enabled !== 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastDeliveryAt: row.last_delivery_at ?? null,
      lastDeliveryStatus: (row.last_delivery_status as 'success' | 'failure' | null) ?? null,
      consecutiveFailures: row.consecutive_failures ?? 0,
    };
  }

  private static maskUrl(url: string): string {
    return url.slice(0, WEBHOOK_URL_PREFIX_LENGTH);
  }
}

export { ApplicationIntegrationDAO };
export { MAX_INTEGRATIONS_PER_APPLICATION };
