import { EmailContentUtil } from '@mail-otter/provider-clients/email-content';
import { OutlookProviderUtil } from '@mail-otter/provider-clients/outlook';
import type { OutlookMessage } from '@mail-otter/provider-clients/outlook';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import type { ConnectedApplication } from '@mail-otter/shared/model';
import { EmailPipelineFactory } from '../EmailPipelineFactory';
import type { FetchedEmail } from '../EmailPipeline';
import { EmailFetchError, EmailMessageNotFoundError } from '../EmailPipeline';
import type { EmailProcessingEnv, EmailProcessingOptions, OutlookSummaryData } from './EmailProcessingTypes';
import { SummaryDeliveryService } from './SummaryDeliveryService';

/**
 * Outlook Strategy: fetch → pipeline → deliver (sink-to-inbox).
 * Extracted from `EmailProcessingUtil.generateOutlookSummary/sendOutlookSummary`.
 */
class OutlookMessageProcessor {
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
  ): Promise<OutlookSummaryData | null> {
    const pipeline = new EmailPipelineFactory(this.env.DB).create(this.env, enabledApplicationIds);
    return pipeline.runGenerate<OutlookMessage, OutlookSummaryData>(
      application,
      options,
      {
        fetchErrorPolicy: 'record-error',
        fetchMessage: async (): Promise<FetchedEmail<OutlookMessage> | null> => {
          let message: OutlookMessage;
          try {
            message = await OutlookProviderUtil.getMessage(accessToken, messageId);
          } catch (error: unknown) {
            if (OutlookProviderUtil.isMessageNotFoundError(error)) {
              throw new EmailMessageNotFoundError(messageId, 'Outlook message was deleted before Mail-Otter could process it.');
            }
            throw new EmailFetchError(messageId, error);
          }
          const from: string = message.from?.emailAddress?.address || message.sender?.emailAddress?.address || '';
          const subject: string = message.subject || '(no subject)';
          const isSummary: boolean =
            message.internetMessageHeaders?.some(
              (header: { name: string; value: string }): boolean =>
                header.name.toLowerCase() === 'x-mail-otter-summary' && header.value.toLowerCase() === 'true',
            ) ?? false;
          if (isSummary || EmailContentUtil.isFromMailbox(from, application.providerEmail)) return null;
          return {
            message,
            messageId: message.id,
            threadId: message.conversationId || null,
            from,
            subject,
            body: OutlookProviderUtil.getMessageText(message),
            hasAttachment: message.hasAttachments ?? false,
            fingerprintInput: message.internetMessageId,
          };
        },
      },
      {
        fetchAttachmentImages: (fetched: FetchedEmail<OutlookMessage>) =>
          OutlookProviderUtil.getImageAttachments(
            accessToken,
            fetched.message.id,
            ConfigurationManager.attachment.getMaxSizeBytes(this.env),
            ConfigurationManager.attachment.getMaxPerEmail(this.env),
          ),
        buildResult: (fetched: FetchedEmail<OutlookMessage>, result) => ({
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

  public async sendSummary(data: OutlookSummaryData): Promise<void> {
    const delivery = this.delivery ?? new SummaryDeliveryService(this.env);
    await delivery.sendSummaryTemplate(data.application, data.messageId, data.options.retryAttempt, async () => {
      await OutlookProviderUtil.sendSelfSummaryReply(data.accessToken, data.message, data.application.providerEmail!, data.summaryHtml);
    });
  }
}

export { OutlookMessageProcessor };
