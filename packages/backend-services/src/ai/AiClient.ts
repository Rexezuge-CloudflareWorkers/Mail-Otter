import { AiDailyUsageDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { CryptoUtil } from '@mail-otter/shared/utils';
import { AiUsageUtil } from '../email/AiUsageUtil';
import type { AiTextGenerationUsage } from '../email/WorkersAiResponseUtil';

interface AiClientEnv {
  DB: D1Queryable;
  AI_DAILY_NEURON_FALLBACK_THRESHOLD?: string;
}

interface WorkersAiEmbeddingResult {
  data?: number[] | number[][];
}

// Adapter over Workers AI embedding + daily-usage accounting.
// Consolidates the 4x duplicated embed/recordEmbeddingUsage/shouldSkip
// blocks previously spread across ChatService, EmailContextUtil,
// GoogleDriveIngestionService and OneDriveIngestionService.
class AiClient {
  public static async embed(ai: Ai, model: string, text: string): Promise<number[]> {
    const result = (await ai.run(model, { text: [text] })) as WorkersAiEmbeddingResult;
    const embedding: unknown = Array.isArray(result.data?.[0]) ? result.data[0] : result.data;
    if (!Array.isArray(embedding) || !embedding.every((item: unknown): item is number => typeof item === 'number')) {
      throw new Error('Workers AI did not return an embedding vector.');
    }
    return embedding;
  }

  public static async recordEmbeddingUsage(
    db: D1Queryable,
    model: string,
    text: string,
    logPrefix = '[AiClient]',
  ): Promise<void> {
    try {
      const estimate = AiUsageUtil.estimateEmbeddingUsage(model, text);
      await new AiDailyUsageDAO(db).incrementUsage({
        usageDate: AiUsageUtil.getCurrentUtcUsageDate(),
        estimatedNeurons: estimate.estimatedNeurons,
        embeddingTokens: estimate.embeddingTokens,
      });
    } catch (error: unknown) {
      console.warn(`${logPrefix} Failed to record embedding usage:`, error);
    }
  }

  public static async recordTextGenerationUsage(
    db: D1Queryable,
    model: string,
    usage: AiTextGenerationUsage | undefined,
    fallbackInputText: string,
    fallbackOutputText: string,
    logPrefix = '[AiClient]',
  ): Promise<{ estimatedNeurons: number; promptTokens: number; completionTokens: number } | undefined> {
    try {
      const estimate = AiUsageUtil.estimateTextGenerationUsage(model, usage, fallbackInputText, fallbackOutputText);
      await new AiDailyUsageDAO(db).incrementUsage({
        usageDate: AiUsageUtil.getCurrentUtcUsageDate(),
        estimatedNeurons: estimate.estimatedNeurons,
        promptTokens: estimate.promptTokens,
        completionTokens: estimate.completionTokens,
      });
      return estimate;
    } catch (error: unknown) {
      console.warn(`${logPrefix} Failed to record text generation usage:`, error);
      return undefined;
    }
  }

  public static async shouldSkipForDailyUsage(env: AiClientEnv, logPrefix = '[AiClient]'): Promise<boolean> {
    const fallbackThreshold = ConfigurationManager.getAiDailyNeuronFallbackThreshold(env);
    if (fallbackThreshold <= 0) return false;
    try {
      const estimatedNeurons = await new AiDailyUsageDAO(env.DB).getEstimatedNeuronsForDate(
        AiUsageUtil.getCurrentUtcUsageDate(),
      );
      return estimatedNeurons >= fallbackThreshold;
    } catch (error: unknown) {
      console.warn(`${logPrefix} Failed to read daily usage:`, error);
      return false;
    }
  }

  public static getStringMetadata(
    metadata: Record<string, VectorizeVectorMetadata> | undefined,
    key: string,
  ): string | undefined {
    const value: VectorizeVectorMetadata | undefined = metadata?.[key];
    return typeof value === 'string' ? value : undefined;
  }

  public static truncateMetadata(value: string, maxChars = 512): string {
    return value.length <= maxChars ? value : value.slice(0, maxChars);
  }

  public static fingerprint(secret: string, label: string, value: string): Promise<string> {
    return CryptoUtil.hmacSha256Hex(`${label}\n${value}`, secret);
  }
}

export { AiClient };
export type { AiClientEnv, WorkersAiEmbeddingResult };
