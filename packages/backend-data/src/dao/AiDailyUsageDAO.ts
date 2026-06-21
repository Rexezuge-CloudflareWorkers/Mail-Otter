import { executeD1WithRetry } from '../utils';
import type { D1Queryable } from '../utils';
import { TimestampUtil } from '@mail-otter/shared/utils';

class AiDailyUsageDAO {
  protected readonly database: D1Queryable;

  constructor(database: D1Queryable) {
    this.database = database;
  }

  public async getByDate(usageDate: string): Promise<AiDailyUsage | undefined> {
    const row: AiDailyUsageInternal | null = await this.database
      .prepare(
        `
          SELECT usage_date, estimated_neurons, prompt_tokens, completion_tokens,
                 embedding_tokens, request_count, created_at, updated_at
          FROM ai_daily_usage
          WHERE usage_date = ?
          LIMIT 1
        `,
      )
      .bind(usageDate)
      .first<AiDailyUsageInternal>();
    return row ? this.toUsage(row) : undefined;
  }

  public async getByDateRange(startDate: string, endDate: string): Promise<AiDailyUsage[]> {
    const rows: AiDailyUsageInternal[] = await this.database
      .prepare(
        `
          SELECT usage_date, estimated_neurons, prompt_tokens, completion_tokens,
                 embedding_tokens, request_count, created_at, updated_at
          FROM ai_daily_usage
          WHERE usage_date >= ? AND usage_date <= ?
          ORDER BY usage_date ASC
        `,
      )
      .bind(startDate, endDate)
      .all<AiDailyUsageInternal>()
      .then((result: D1Result<AiDailyUsageInternal>): AiDailyUsageInternal[] => result.results || []);
    return rows.map((row: AiDailyUsageInternal): AiDailyUsage => this.toUsage(row));
  }

  public async deleteOlderThanDate(olderThanDate: string): Promise<number> {
    const result: D1Result = await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare('DELETE FROM ai_daily_usage WHERE usage_date < ?')
          .bind(olderThanDate)
          .run(),
      'delete old AI daily usage',
    );
    return (result.meta as { changes?: number } | undefined)?.changes ?? 0;
  }

  public async getEstimatedNeuronsForDate(usageDate: string): Promise<number> {
    const row: Pick<AiDailyUsageInternal, 'estimated_neurons'> | null = await this.database
      .prepare(
        `
          SELECT estimated_neurons
          FROM ai_daily_usage
          WHERE usage_date = ?
          LIMIT 1
        `,
      )
      .bind(usageDate)
      .first<Pick<AiDailyUsageInternal, 'estimated_neurons'>>();
    return row?.estimated_neurons ?? 0;
  }

  public async incrementUsage(input: IncrementAiDailyUsageInput): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const estimatedNeurons: number = AiDailyUsageDAO.toNonNegativeInteger(input.estimatedNeurons);
    const promptTokens: number = AiDailyUsageDAO.toNonNegativeInteger(input.promptTokens ?? 0);
    const completionTokens: number = AiDailyUsageDAO.toNonNegativeInteger(input.completionTokens ?? 0);
    const embeddingTokens: number = AiDailyUsageDAO.toNonNegativeInteger(input.embeddingTokens ?? 0);
    const requestCount: number = AiDailyUsageDAO.toNonNegativeInteger(input.requestCount ?? 1);

    await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              INSERT INTO ai_daily_usage
                (usage_date, estimated_neurons, prompt_tokens, completion_tokens, embedding_tokens, request_count, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(usage_date) DO UPDATE SET
                estimated_neurons = ai_daily_usage.estimated_neurons + excluded.estimated_neurons,
                prompt_tokens = ai_daily_usage.prompt_tokens + excluded.prompt_tokens,
                completion_tokens = ai_daily_usage.completion_tokens + excluded.completion_tokens,
                embedding_tokens = ai_daily_usage.embedding_tokens + excluded.embedding_tokens,
                request_count = ai_daily_usage.request_count + excluded.request_count,
                updated_at = excluded.updated_at
            `,
          )
          .bind(input.usageDate, estimatedNeurons, promptTokens, completionTokens, embeddingTokens, requestCount, now, now)
          .run(),
      'increment AI daily usage',
    );
  }

  private toUsage(row: AiDailyUsageInternal): AiDailyUsage {
    return {
      usageDate: row.usage_date,
      estimatedNeurons: row.estimated_neurons,
      promptTokens: row.prompt_tokens,
      completionTokens: row.completion_tokens,
      embeddingTokens: row.embedding_tokens,
      requestCount: row.request_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private static toNonNegativeInteger(value: number): number {
    return Number.isFinite(value) && value > 0 ? Math.ceil(value) : 0;
  }
}

interface AiDailyUsage {
  usageDate: string;
  estimatedNeurons: number;
  promptTokens: number;
  completionTokens: number;
  embeddingTokens: number;
  requestCount: number;
  createdAt: number;
  updatedAt: number;
}

interface AiDailyUsageInternal {
  usage_date: string;
  estimated_neurons: number;
  prompt_tokens: number;
  completion_tokens: number;
  embedding_tokens: number;
  request_count: number;
  created_at: number;
  updated_at: number;
}

interface IncrementAiDailyUsageInput {
  usageDate: string;
  estimatedNeurons: number;
  promptTokens?: number | undefined;
  completionTokens?: number | undefined;
  embeddingTokens?: number | undefined;
  requestCount?: number | undefined;
}

export { AiDailyUsageDAO };
export type { AiDailyUsage, IncrementAiDailyUsageInput };
