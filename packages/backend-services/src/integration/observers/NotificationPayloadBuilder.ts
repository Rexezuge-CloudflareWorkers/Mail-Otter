import { getBackendStrings } from '@mail-otter/shared/i18n';
import type { EmailSummaryNotification } from './IntegrationObserver';

const MAX_DETAILS = 10;
const SLACK_TITLE_MAX = 150;
const DISCORD_TITLE_MAX = 256;
const DISCORD_FIELD_MAX = 1024;
const DISCORD_DESCRIPTION_MAX = 4096;

// Shared payload construction for Slack/Discord/Webhook observers.
// Removes duplicated truncation, key-details bullet formatting, action
// formatting, and footer construction previously copied across observers.
class NotificationPayloadBuilder {
  public static truncate(text: string, max: number): string {
    return text.slice(0, max);
  }

  public static formatDetailsList(keyDetails: string[]): string {
    return keyDetails
      .slice(0, MAX_DETAILS)
      .map((d) => `• ${d}`)
      .join('\n');
  }

  public static formatSlackActions(actions: EmailSummaryNotification['actions']): string {
    return actions.map((a) => `• <${a.callbackUrl}|${a.title}> _(${a.type.replace('.', ' ')})_`).join('\n');
  }

  public static formatDiscordActions(actions: EmailSummaryNotification['actions']): string {
    return actions
      .map((a) => `[${a.title}](${a.callbackUrl})`)
      .join('\n')
      .slice(0, DISCORD_FIELD_MAX);
  }

  public static buildSlackPayload(n: EmailSummaryNotification, locale?: string | null): unknown {
    const strings = getBackendStrings(locale);
    const blocks: unknown[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: this.truncate(`${strings.notify.newEmailPrefix}${n.emailSubject}`, SLACK_TITLE_MAX) },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${strings.notify.slackFromLabel}* ${n.emailFrom || strings.notify.unknownFrom}\n*${strings.notify.slackSummaryLabel}* ${n.gist}`,
        },
      },
    ];

    if (n.keyDetails.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${strings.notify.slackDetailsLabel}*\n${this.formatDetailsList(n.keyDetails)}`,
        },
      });
    }

    if (n.actions.length > 0) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*${strings.notify.slackActionsLabel}*\n${this.formatSlackActions(n.actions)}` },
      });
    }

    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `${strings.notify.footerBrand} · <${n.applicationId}>` }],
    });

    return { blocks };
  }

  public static buildDiscordPayload(n: EmailSummaryNotification, locale?: string | null): unknown {
    const strings = getBackendStrings(locale);
    const fields: unknown[] = [{ name: strings.notify.discordFromField, value: n.emailFrom || strings.notify.unknownFrom, inline: true }];

    if (n.keyDetails.length > 0) {
      fields.push({
        name: strings.notify.discordDetailsField,
        value: this.formatDetailsList(n.keyDetails).slice(0, DISCORD_FIELD_MAX),
        inline: false,
      });
    }

    if (n.actions.length > 0) {
      fields.push({
        name: strings.notify.discordActionsField,
        value: this.formatDiscordActions(n.actions),
        inline: false,
      });
    }

    return {
      embeds: [
        {
          title: this.truncate(`${strings.notify.newEmailPrefix}${n.emailSubject}`, DISCORD_TITLE_MAX),
          description: n.gist.slice(0, DISCORD_DESCRIPTION_MAX),
          color: 0x58_65_f2,
          fields,
          footer: { text: `${strings.notify.footerBrand} · ${n.applicationId}` },
        },
      ],
    };
  }

  public static buildWebhookPayload(n: EmailSummaryNotification): unknown {
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

export { NotificationPayloadBuilder };
