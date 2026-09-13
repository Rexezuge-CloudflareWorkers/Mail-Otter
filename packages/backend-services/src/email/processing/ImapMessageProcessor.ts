import { EmailContentUtil } from '@mail-otter/provider-clients/email-content';
import type { ImapClient, ImapFetchResult } from '@mail-otter/provider-clients/imap';
import { getBackendStrings } from '@mail-otter/shared/i18n';
import type { ConnectedApplication } from '@mail-otter/shared/model';
import { EmailPipelineFactory } from '../EmailPipelineFactory';
import type { FetchedEmail } from '../EmailPipeline';
import type { EmailProcessingEnv, EmailProcessingOptions, ImapSummaryData } from './EmailProcessingTypes';
import { SummaryDeliveryService } from './SummaryDeliveryService';

/**
 * IMAP Strategy (all imap-password providers). Extracted from `EmailProcessingUtil`.
 *
 * Note: the caller owns the connected `ImapClient` lifecycle (connect/close);
 * this processor only fetches + delivers within one step.
 */
class ImapMessageProcessor {
  constructor(
    private readonly env: EmailProcessingEnv,
    private readonly delivery?: SummaryDeliveryService,
  ) {}

  public async generateSummary(
    application: ConnectedApplication,
    uid: number,
    imapClient: ImapClient,
    enabledApplicationIds: string[],
    options: EmailProcessingOptions = {},
  ): Promise<ImapSummaryData | null> {
    const pipeline = new EmailPipelineFactory(this.env.DB).create(this.env, enabledApplicationIds);
    return pipeline.runGenerate<ImapFetchResult, ImapSummaryData>(
      application,
      options,
      {
        fetchErrorPolicy: 'rethrow',
        fetchMessage: async (): Promise<FetchedEmail<ImapFetchResult> | null> => {
          const [headerResult] = await imapClient.fetchHeaders([uid]);
          if (!headerResult) return null;
          const subject = headerResult.subject ?? '(no subject)';
          const from = headerResult.from ?? '';
          const rawBody = await imapClient.fetchBody(uid);
          const body = EmailContentUtil.extractTextFromRaw(rawBody);
          return {
            message: headerResult,
            messageId: headerResult.messageId,
            threadId: null,
            from,
            subject,
            body,
            hasAttachment: false,
            fingerprintInput: headerResult.messageId,
          };
        },
      },
      {
        fetchAttachmentImages: (): Promise<never[]> => Promise.resolve([]),
        buildResult: (fetched: FetchedEmail<ImapFetchResult>, result) => ({
          ...result,
          emailSubject: fetched.subject,
          emailFrom: fetched.from,
          application,
          messageId: fetched.messageId,
          uid,
          options,
        }),
      },
    );
  }

  public async sendSummary(data: ImapSummaryData, imapClient: ImapClient): Promise<void> {
    const delivery = this.delivery ?? new SummaryDeliveryService(this.env);
    await delivery.sendSummaryTemplate(data.application, data.messageId, data.options.retryAttempt, async () => {
      const summaryPrefix = getBackendStrings(data.application.contentLanguage ?? null).summary.summarySubjectPrefix;
      const summaryRfc2822 = [
        `From: ${data.application.providerEmail ?? data.application.userEmail}`,
        `To: ${data.application.providerEmail ?? data.application.userEmail}`,
        `Subject: ${summaryPrefix}${data.emailSubject}`,
        `X-Mail-Otter-Summary: true`,
        `Content-Type: text/html; charset=utf-8`,
        '',
        data.summaryHtml,
      ].join('\r\n');
      await imapClient.append('INBOX', summaryRfc2822);
    });
  }
}

export { ImapMessageProcessor };
