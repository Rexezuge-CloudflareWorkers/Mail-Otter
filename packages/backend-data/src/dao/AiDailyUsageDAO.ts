import { TimestampUtil } from '@mail-otter/shared/utils';
import { BaseDAO } from './BaseDAO';
import type { D1Result } from '@rexezuge/d1';

class AiDailyUsageDAO extends BaseDAO {
  public async getByDate(usageDate: string): Promise<AiDailyUsage | undefined> {
    const row: AiDailyUsageInternal | null = await this.first<AiDailyUsageInternal>(
      ` SELECT usage_date, estimated_neurons, prompt_tokens, completion_tokens, embedding_tokens, request_count, created_at, updated_at FROM ai_daily_usage WHERE usage_date = ? LIMIT 1 `,
      [usageDate],
    );
    return row ? this.toUsage(row) : undefined;
  }

  public async getByDateRange(startDate: string, endDate: string): Promise<AiDailyUsage[]> {
    const rows: AiDailyUsageInternal[] = await this.all<AiDailyUsageInternal>(
      ` SELECT usage_date, estimated_neurons, prompt_tokens, completion_tokens, embedding_tokens, request_count, created_at, updated_at FROM ai_daily_usage WHERE usage_date >= ? AND usage_date <= ? ORDER BY usage_date ASC `,
      [startDate, endDate],
    );
    return rows.map((row: AiDailyUsageInternal): AiDailyUsage => this.toUsage(row));
  }

  public async deleteOlderThanDate(olderThanDate: string): Promise<number> {
    const result: D1Result = await this.run('DELETE FROM ai_daily_usage WHERE usage_date < ?', [olderThanDate]);
    return (result.meta as { changes?: number })?.changes ?? 0;
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

    await this.run(
      ` INSERT INTO ai_daily_usage (usage_date, estimated_neurons, prompt_tokens, completion_tokens, embedding_tokens, request_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(usage_date) DO UPDATE SET estimated_neurons = ai_daily_usage.estimated_neurons + excluded.estimated_neurons, prompt_tokens = ai_daily_usage.prompt_tokens + excluded.prompt_tokens, completion_tokens = ai_daily_usage.completion_tokens + excluded.completion_tokens, embedding_tokens = ai_daily_usage.embedding_tokens + excluded.embedding_tokens, request_count = ai_daily_usage.request_count + excluded.request_count, updated_at = excluded.updated_at `,
      [input.usageDate, estimatedNeurons, promptTokens, completionTokens, embeddingTokens, requestCount, now, now],
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
  promptTokens?: number;
  completionTokens?: number;
  embeddingTokens?: number;
  requestCount?: number;
}

export { AiDailyUsageDAO };
export type { AiDailyUsage, IncrementAiDailyUsageInput };
