import { EmailContentUtil } from '@mail-otter/provider-clients/email-content';
import { GmailProviderUtil } from '@mail-otter/provider-clients/gmail';
import type { GmailMessage } from '@mail-otter/provider-clients/gmail';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import type { ConnectedApplication } from '@mail-otter/shared/model';
import { EmailPipelineFactory } from '../EmailPipelineFactory';
import type { FetchedEmail } from '../EmailPipeline';
import { EmailMessageNotFoundError } from '../EmailPipeline';
import type { EmailProcessingEnv, EmailProcessingOptions, GmailSummaryData } from './EmailProcessingTypes';
import { SummaryDeliveryService } from './SummaryDeliveryService';

/**
 * Gmail Strategy: fetch → pipeline → deliver.
 *
 * Extracted from `EmailProcessingUtil.generateGmailSummary/sendGmailSummary`.
 * Depends only on the pipeline factory + delivery Template Method.
 */
class GmailMessageProcessor {
  constructor(
    private readonly env: EmailProcessingEnv,
    private readonly delivery?: SummaryDeliveryService,
  ) {}

  public async generateSummary(
    application: ConnectedApplication,
    accessToken: string,
    messageId: string,
    enabledApplicationIds: string[],
    options: EmailProcessingOptions = {},
  ): Promise<GmailSummaryData | null> {
    const pipeline = new EmailPipelineFactory(this.env.DB).create(this.env, enabledApplicationIds);
    return pipeline.runGenerate<GmailMessage, GmailSummaryData>(
      application,
      options,
      {
        fetchErrorPolicy: 'rethrow',
        fetchMessage: async (): Promise<FetchedEmail<GmailMessage> | null> => {
          let message: GmailMessage;
          try {
            message = await GmailProviderUtil.getMessage(accessToken, messageId);
          } catch (error: unknown) {
            if (GmailProviderUtil.isMessageNotFoundError(error)) {
              throw new EmailMessageNotFoundError(messageId, 'Gmail message was deleted before Mail-Otter could process it.');
            }
            throw error;
          }
          const headers = message.payload?.headers;
          const subject: string = EmailContentUtil.getHeader(headers, 'Subject') || '(no subject)';
          const from: string = EmailContentUtil.getHeader(headers, 'From') || '';
          const isSummary: boolean = EmailContentUtil.getHeader(headers, 'X-Mail-Otter-Summary')?.toLowerCase() === 'true';
          if (isSummary || EmailContentUtil.isFromMailbox(from, application.providerEmail)) return null;
          const extracted = EmailContentUtil.extractGmailText(message.payload);
          const hasAttachment: boolean =
            message.payload?.parts?.some((p: { filename?: string }) => Boolean(p.filename && p.filename.length > 0)) ?? false;
          return {
            message,
            messageId: message.id,
            threadId: message.threadId,
            from,
            subject,
            body: extracted.text,
            hasAttachment,
            fingerprintInput: EmailContentUtil.getHeader(headers, 'Message-ID'),
          };
        },
      },
      {
        fetchAttachmentImages: (fetched: FetchedEmail<GmailMessage>) =>
          GmailProviderUtil.getImageAttachments(
            accessToken,
            fetched.message.id,
            fetched.message.payload,
            ConfigurationManager.attachment.getMaxSizeBytes(this.env),
            ConfigurationManager.attachment.getMaxPerEmail(this.env),
          ),
        buildResult: (fetched: FetchedEmail<GmailMessage>, result) => ({
          message: fetched.message,
          ...result,
          emailSubject: fetched.subject,
          emailFrom: fetched.from,
          application,
          accessToken,
          messageId,
          options,
        }),
      },
    );
  }

  public async processMessage(
    application: ConnectedApplication,
    accessToken: string,
    messageId: string,
    enabledApplicationIds: string[],
    options: EmailProcessingOptions = {},
  ): Promise<void> {
    const data = await this.generateSummary(application, accessToken, messageId, enabledApplicationIds, options);
    if (data) await this.sendSummary(data);
  }

  public async sendSummary(data: GmailSummaryData): Promise<void> {
    const delivery = this.delivery ?? new SummaryDeliveryService(this.env);
    await delivery.sendSummaryTemplate(data.application, data.messageId, data.options.retryAttempt, async () => {
      await GmailProviderUtil.sendSummaryReply(data.accessToken, data.application.providerEmail!, data.message, data.summaryHtml);
    });
  }
}

export { GmailMessageProcessor };
