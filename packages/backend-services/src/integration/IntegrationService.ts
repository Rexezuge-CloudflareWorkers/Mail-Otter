import { ApplicationIntegrationDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import type { OutboundIntegration } from '@mail-otter/shared/model';
import type { GmailSummaryData, OutlookSummaryData } from '../email/EmailProcessingUtil';

interface IntegrationServiceEnv {
  DB: D1Queryable;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
}

interface EmailSummaryNotification {
  applicationId: string;
  emailSubject: string;
  emailFrom: string;
  gist: string;
  keyDetails: string[];
  actions: Array<{
    type: string;
    title: string;
    description: string;
    riskLevel: string;
    callbackUrl: string;
  }>;
  processedAt: number;
}

class IntegrationService {
  public static async sendToIntegrations(
    summaryData: GmailSummaryData | OutlookSummaryData,
    env: IntegrationServiceEnv,
  ): Promise<void> {
    const masterKey = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const dao = new ApplicationIntegrationDAO(env.DB, masterKey);
    const integrations = await dao.listEnabled(summaryData.application.applicationId);
    if (integrations.length === 0) return;

    const notification: EmailSummaryNotification = {
      applicationId: summaryData.application.applicationId,
      emailSubject: summaryData.emailSubject,
      emailFrom: summaryData.emailFrom,
      gist: summaryData.rawSummary.gist,
      keyDetails: summaryData.rawSummary.keyDetails,
      actions: summaryData.actions.map((a) => ({
        type: a.action.actionType,
        title: a.action.title,
        description: a.action.description,
        riskLevel: a.action.riskLevel,
        callbackUrl: a.confirmationUrl,
      })),
      processedAt: Math.floor(Date.now() / 1000),
    };

    await Promise.allSettled(
      integrations.map(async (integration) => {
        try {
          const webhookUrl = await dao.getDecryptedWebhookUrl(integration.integrationId);
          await IntegrationService.dispatchToIntegration(integration, webhookUrl, notification);
        } catch (error: unknown) {
          console.warn(
            `[IntegrationService] Failed to dispatch to ${integration.integrationType} integration ${integration.integrationId}:`,
            error,
          );
        }
      }),
    );
  }

  public static async sendTestNotification(
    integration: OutboundIntegration,
    env: IntegrationServiceEnv,
  ): Promise<void> {
    const masterKey = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const dao = new ApplicationIntegrationDAO(env.DB, masterKey);
    const webhookUrl = await dao.getDecryptedWebhookUrl(integration.integrationId);

    const testNotification: EmailSummaryNotification = {
      applicationId: integration.applicationId,
      emailSubject: 'Test Email From Mail-Otter',
      emailFrom: 'test@example.com',
      gist: 'This is a test notification from Mail-Otter to verify your integration is working.',
      keyDetails: ['Integration test triggered manually', 'No real email was processed'],
      actions: [],
      processedAt: Math.floor(Date.now() / 1000),
    };

    await IntegrationService.dispatchToIntegration(integration, webhookUrl, testNotification);
  }

  private static async dispatchToIntegration(
    integration: OutboundIntegration,
    webhookUrl: string,
    notification: EmailSummaryNotification,
  ): Promise<void> {
    switch (integration.integrationType) {
      case 'slack':
        await IntegrationService.postJson(webhookUrl, IntegrationService.buildSlackPayload(notification));
        break;
      case 'discord':
        await IntegrationService.postJson(webhookUrl, IntegrationService.buildDiscordPayload(notification));
        break;
      case 'webhook':
        await IntegrationService.postJson(webhookUrl, IntegrationService.buildWebhookPayload(notification));
        break;
    }
  }

  private static async postJson(url: string, payload: unknown): Promise<void> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.warn(`[IntegrationService] Webhook POST returned ${response.status}: ${url.slice(0, 50)}…`);
    }
  }

  private static buildSlackPayload(n: EmailSummaryNotification): unknown {
    const blocks: unknown[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: `New Email: ${n.emailSubject}`.slice(0, 150) },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*From:* ${n.emailFrom || '(unknown)'}\n*Summary:* ${n.gist}`,
        },
      },
    ];

    if (n.keyDetails.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Key Details:*\n${n.keyDetails
            .slice(0, 10)
            .map((d) => `• ${d}`)
            .join('\n')}`,
        },
      });
    }

    if (n.actions.length > 0) {
      const actionText = n.actions
        .map((a) => `• <${a.callbackUrl}|${a.title}> _(${a.type.replace('.', ' ')})_`)
        .join('\n');
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*Suggested Actions:*\n${actionText}` },
      });
    }

    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `Mail-Otter · <${n.applicationId}>` }],
    });

    return { blocks };
  }

  private static buildDiscordPayload(n: EmailSummaryNotification): unknown {
    const fields: unknown[] = [{ name: 'From', value: n.emailFrom || '(unknown)', inline: true }];

    if (n.keyDetails.length > 0) {
      fields.push({
        name: 'Key Details',
        value: n.keyDetails
          .slice(0, 10)
          .map((d) => `• ${d}`)
          .join('\n')
          .slice(0, 1024),
        inline: false,
      });
    }

    if (n.actions.length > 0) {
      fields.push({
        name: 'Suggested Actions',
        value: n.actions
          .map((a) => `[${a.title}](${a.callbackUrl})`)
          .join('\n')
          .slice(0, 1024),
        inline: false,
      });
    }

    return {
      embeds: [
        {
          title: `New Email: ${n.emailSubject}`.slice(0, 256),
          description: n.gist.slice(0, 4096),
          color: 0x5865f2,
          fields,
          footer: { text: `Mail-Otter · ${n.applicationId}` },
        },
      ],
    };
  }

  private static buildWebhookPayload(n: EmailSummaryNotification): unknown {
    return {
      event: 'email.processed',
      applicationId: n.applicationId,
      email: { subject: n.emailSubject, from: n.emailFrom },
      summary: { gist: n.gist, keyDetails: n.keyDetails },
      actions: n.actions.map((a) => ({
        type: a.type,
        title: a.title,
        description: a.description,
        riskLevel: a.riskLevel,
        callbackUrl: a.callbackUrl,
      })),
      processedAt: n.processedAt,
    };
  }
}

export { IntegrationService };
export type { IntegrationServiceEnv };
