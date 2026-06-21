import { AiDailyUsageDAO, ApplicationContextDAO, ConnectedApplicationDAO, EmailActionDAO, ProcessedMessageDAO } from '@mail-otter/backend-data/dao';
import type { ApplicationContextUserCounts, EmailActionCounts, ProcessedMessageStatusCounts } from '@mail-otter/backend-data/dao';
import { BadRequestError } from '@mail-otter/backend-errors';
import { TimestampUtil } from '@mail-otter/shared/utils';

// TODO: Migrate to Cloudflare Analytics Engine for time-series queries once historical D1 data
// is no longer needed. Write data points via writeDataPoint() at event time (fire-and-forget)
// and query via the Analytics Engine SQL API. Note: requires a new binding + Cloudflare API
// token secret, and the dashboard will start empty (no D1 backfill). See plan notes for details.
class AnalyticsService {
  public static async getAnalytics(
    userEmail: string,
    input: { days: number; applicationId?: string | undefined },
    env: AnalyticsServiceEnv,
  ): Promise<AnalyticsResponse> {
    const { days, applicationId } = input;

    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();

    if (applicationId) {
      const app = await new ConnectedApplicationDAO(env.DB, masterKey).getMetadataByIdForUser(applicationId, userEmail);
      if (!app) throw new BadRequestError('Connected application was not found.');
    }

    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const sinceUnixSeconds: number = now - days * 86400;
    const startDate: string = new Date(sinceUnixSeconds * 1000).toISOString().slice(0, 10);
    const endDate: string = new Date(now * 1000).toISOString().slice(0, 10);

    const actionKey: string = await env.ACTION_ENCRYPTION_KEY_SECRET.get();

    const [aiRows, processingCounts, actionCounts, contextCounts] = await Promise.all([
      new AiDailyUsageDAO(env.DB).getByDateRange(startDate, endDate),
      new ProcessedMessageDAO(env.DB).getStatusCountsByDateRange(sinceUnixSeconds, now, applicationId),
      new EmailActionDAO(env.DB, actionKey).getCountsByUserAndDateRange(userEmail, sinceUnixSeconds, now, applicationId),
      new ApplicationContextDAO(env.DB).getCountsByUserEmail(userEmail, applicationId),
    ]);

    const aiTotal = aiRows.reduce(
      (acc, row) => ({
        estimatedNeurons: acc.estimatedNeurons + row.estimatedNeurons,
        requestCount: acc.requestCount + row.requestCount,
      }),
      { estimatedNeurons: 0, requestCount: 0 },
    );

    return {
      aiUsage: {
        daily: aiRows.map((row) => ({ date: row.usageDate, estimatedNeurons: row.estimatedNeurons, requestCount: row.requestCount })),
        total: aiTotal,
      },
      processing: processingCounts,
      actions: actionCounts,
      context: contextCounts,
    };
  }
}

interface AnalyticsServiceEnv {
  DB: D1Database;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  ACTION_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
}

interface AnalyticsResponse {
  aiUsage: {
    daily: Array<{ date: string; estimatedNeurons: number; requestCount: number }>;
    total: { estimatedNeurons: number; requestCount: number };
  };
  processing: ProcessedMessageStatusCounts;
  actions: EmailActionCounts;
  context: ApplicationContextUserCounts;
}

export { AnalyticsService };
export type { AnalyticsResponse, AnalyticsServiceEnv };
