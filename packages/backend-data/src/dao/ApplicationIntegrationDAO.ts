import { encryptData, decryptData } from '../crypto';
import { executeD1WithRetry } from '../utils';
import { BadRequestError } from '@mail-otter/backend-errors';
import type { OutboundIntegration, OutboundIntegrationInternal, OutboundIntegrationType } from '@mail-otter/shared/model';
import { TimestampUtil, UUIDUtil } from '@mail-otter/shared/utils';
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
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `INSERT INTO application_integrations
               (integration_id, application_id, integration_type, name, encrypted_webhook_url, webhook_url_iv, webhook_url_prefix, enabled, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          )
          .bind(integrationId, applicationId, integrationType, name, encrypted.encrypted, encrypted.iv, webhookUrlPrefix, now, now)
          .run(),
      'create application integration',
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
    const rows = await this.database
      .prepare('SELECT * FROM application_integrations WHERE application_id = ? ORDER BY created_at ASC')
      .bind(applicationId)
      .all<OutboundIntegrationInternal>()
      .then((r) => r.results ?? []);
    return rows.map((row) => this.toPublic(row));
  }

  public async listEnabled(applicationId: string): Promise<OutboundIntegration[]> {
    const rows = await this.database
      .prepare('SELECT * FROM application_integrations WHERE application_id = ? AND enabled = 1 ORDER BY created_at ASC')
      .bind(applicationId)
      .all<OutboundIntegrationInternal>()
      .then((r) => r.results ?? []);
    return rows.map((row) => this.toPublic(row));
  }

  public async getByIdForUser(integrationId: string, userEmail: string): Promise<OutboundIntegration | null> {
    const row = await this.database
      .prepare(
        `SELECT ai.* FROM application_integrations ai
         JOIN connected_applications ca ON ca.application_id = ai.application_id
         WHERE ai.integration_id = ? AND ca.user_email = ?
         LIMIT 1`,
      )
      .bind(integrationId, userEmail)
      .first<OutboundIntegrationInternal>();
    return row ? this.toPublic(row) : null;
  }

  public async getApplicationIdForUser(integrationId: string, userEmail: string): Promise<string | null> {
    const row = await this.database
      .prepare(
        `SELECT ai.application_id FROM application_integrations ai
         JOIN connected_applications ca ON ca.application_id = ai.application_id
         WHERE ai.integration_id = ? AND ca.user_email = ?
         LIMIT 1`,
      )
      .bind(integrationId, userEmail)
      .first<{ application_id: string }>();
    return row?.application_id ?? null;
  }

  public async getDecryptedWebhookUrl(integrationId: string): Promise<string> {
    const row = await this.database
      .prepare('SELECT encrypted_webhook_url, webhook_url_iv FROM application_integrations WHERE integration_id = ? LIMIT 1')
      .bind(integrationId)
      .first<{ encrypted_webhook_url: string; webhook_url_iv: string }>();
    if (!row) throw new BadRequestError('Integration not found.');
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
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(`UPDATE application_integrations SET ${fields.join(', ')} WHERE integration_id = ?`)
          .bind(...bindings)
          .run(),
      'update application integration',
    );
    const row = await this.database
      .prepare('SELECT * FROM application_integrations WHERE integration_id = ? LIMIT 1')
      .bind(integrationId)
      .first<OutboundIntegrationInternal>();
    if (!row) throw new BadRequestError('Integration not found after update.');
    return this.toPublic(row);
  }

  public async deleteById(integrationId: string): Promise<void> {
    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare('DELETE FROM application_integrations WHERE integration_id = ?')
          .bind(integrationId)
          .run(),
      'delete application integration',
    );
  }

  public async countByApplicationId(applicationId: string): Promise<number> {
    const row = await this.database
      .prepare('SELECT COUNT(*) AS cnt FROM application_integrations WHERE application_id = ?')
      .bind(applicationId)
      .first<{ cnt: number }>();
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
