import { FastmailProviderUtil } from '@mail-otter/provider-clients/fastmail';
import type { JmapEmailResult } from '@mail-otter/provider-clients/fastmail';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import type { ConnectedApplication } from '@mail-otter/shared/model';
import { EmailPipelineFactory } from '../EmailPipelineFactory';
import type { FetchedEmail } from '../EmailPipeline';
import type { EmailProcessingEnv, EmailProcessingOptions, JmapSummaryData } from './EmailProcessingTypes';
import { SummaryDeliveryService } from './SummaryDeliveryService';

/**
 * JMAP (Fastmail) Strategy. Extracted from `EmailProcessingUtil`.
 */
class JmapMessageProcessor {
  constructor(
    private readonly env: EmailProcessingEnv,
    private readonly delivery?: SummaryDeliveryService,
  ) {}

  public async generateSummary(
    application: ConnectedApplication,
    accessToken: string,
    emailId: string,
    enabledApplicationIds: string[],
    options: EmailProcessingOptions = {},
  ): Promise<JmapSummaryData | null> {
    const pipeline = new EmailPipelineFactory(this.env.DB).create(this.env, enabledApplicationIds);
    return pipeline.runGenerate<JmapEmailResult, JmapSummaryData>(
      application,
      options,
      {
        fetchErrorPolicy: 'rethrow',
        fetchMessage: async (): Promise<FetchedEmail<JmapEmailResult> | null> => {
          const email = await FastmailProviderUtil.getEmail(accessToken, emailId);
          const subject = email.subject ?? '(no subject)';
          const from = email.from?.[0] ? `${email.from[0].name ?? ''} <${email.from[0].email}>`.trim() : '';
          const body =
            email.textBody
              ?.map((part) => email.bodyValues?.[part.partId]?.value ?? '')
              .join('\n')
              .trim() ?? '';
          return {
            message: email,
            messageId: email.id,
            threadId: email.threadId ?? null,
            from,
            subject,
            body,
            hasAttachment: (email.attachments?.length ?? 0) > 0,
            fingerprintInput: email.messageId?.[0] ?? null,
          };
        },
      },
      {
        fetchAttachmentImages: (fetched: FetchedEmail<JmapEmailResult>) =>
          FastmailProviderUtil.downloadImageAttachments(
            accessToken,
            fetched.message,
            ConfigurationManager.attachment.getMaxSizeBytes(this.env),
            ConfigurationManager.attachment.getMaxPerEmail(this.env),
          ),
        buildResult: (fetched: FetchedEmail<JmapEmailResult>, result) => ({
          email: fetched.message,
          ...result,
          emailSubject: fetched.subject,
          emailFrom: fetched.from,
          application,
          accessToken,
          emailId: fetched.message.id,
          options,
        }),
      },
    );
  }

  public async sendSummary(data: JmapSummaryData): Promise<void> {
    const delivery = this.delivery ?? new SummaryDeliveryService(this.env);
    await delivery.sendSummaryTemplate(data.application, data.emailId, data.options.retryAttempt, async () => {
      await FastmailProviderUtil.createDraftReply(data.accessToken, data.emailId, data.summaryHtml);
    });
  }
}

export { JmapMessageProcessor };
