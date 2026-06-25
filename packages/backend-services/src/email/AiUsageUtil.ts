import type { AiTextGenerationUsage } from './EmailSummaryUtil';

const MILLION_TOKENS = 1_000_000;
const APPROXIMATE_CHARS_PER_TOKEN = 4;

const GPT_OSS_120B_RATES: ModelNeuronRates = {
  inputNeuronsPerMillionTokens: 31_818,
  outputNeuronsPerMillionTokens: 68_182,
};

const KIMI_K2_6_RATES: ModelNeuronRates = {
  inputNeuronsPerMillionTokens: 86_364,
  outputNeuronsPerMillionTokens: 363_636,
};

const BGE_M3_RATES: ModelNeuronRates = {
  inputNeuronsPerMillionTokens: 1075,
};

const MODEL_NEURON_RATES: Readonly<Record<string, ModelNeuronRates>> = {
  '@cf/openai/gpt-oss-120b': GPT_OSS_120B_RATES,
  '@cf/openai/gpt-oss-20b': {
    inputNeuronsPerMillionTokens: 18_182,
    outputNeuronsPerMillionTokens: 27_273,
  },
  '@cf/moonshotai/kimi-k2.6': KIMI_K2_6_RATES,
  '@cf/baai/bge-m3': BGE_M3_RATES,
};

class AiUsageUtil {
  public static getCurrentUtcUsageDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  public static estimateTextGenerationUsage(
    model: string,
    usage: AiTextGenerationUsage | undefined,
    fallbackInputText: string,
    fallbackOutputText: string,
  ): AiTextGenerationUsageEstimate {
    const promptTokensFromUsage: number | undefined = this.toTokenCount(usage?.promptTokens);
    const promptTokens: number = promptTokensFromUsage ?? this.estimateTokensFromText(fallbackInputText);
    const completionTokensFromUsage: number | undefined = this.toTokenCount(usage?.completionTokens);
    const totalTokens: number | undefined = this.toTokenCount(usage?.totalTokens);
    const completionTokensFromTotal: number | undefined =
      promptTokensFromUsage !== undefined && totalTokens !== undefined ? Math.max(0, totalTokens - promptTokens) : undefined;
    const completionTokens: number =
      this.maxTokenCount(completionTokensFromUsage, completionTokensFromTotal) ?? this.estimateTokensFromText(fallbackOutputText);
    return this.estimateTextGenerationUsageForTokenCounts(model, promptTokens, completionTokens);
  }

  public static estimateTextGenerationUsageForTokenCounts(
    model: string,
    promptTokens: number,
    completionTokens: number,
  ): AiTextGenerationUsageEstimate {
    const normalizedPromptTokens: number = this.toTokenCount(promptTokens) ?? 0;
    const normalizedCompletionTokens: number = this.toTokenCount(completionTokens) ?? 0;
    const rates: ModelNeuronRates = this.getRates(model, GPT_OSS_120B_RATES);
    const outputRate: number = rates.outputNeuronsPerMillionTokens ?? rates.inputNeuronsPerMillionTokens;
    const estimatedNeurons: number = Math.ceil(
      (normalizedPromptTokens * rates.inputNeuronsPerMillionTokens + normalizedCompletionTokens * outputRate) / MILLION_TOKENS,
    );
    return { estimatedNeurons, promptTokens: normalizedPromptTokens, completionTokens: normalizedCompletionTokens };
  }

  public static estimateEmbeddingUsage(model: string, text: string): AiEmbeddingUsageEstimate {
    const embeddingTokens: number = this.estimateTokensFromText(text);
    const rates: ModelNeuronRates = this.getRates(model, BGE_M3_RATES);
    const estimatedNeurons: number = Math.ceil((embeddingTokens * rates.inputNeuronsPerMillionTokens) / MILLION_TOKENS);
    return { estimatedNeurons, embeddingTokens };
  }

  public static estimateTokensFromText(text: string): number {
    const length: number = text.trim().length;
    return length > 0 ? Math.ceil(length / APPROXIMATE_CHARS_PER_TOKEN) : 0;
  }

  private static getRates(model: string, fallback: ModelNeuronRates): ModelNeuronRates {
    return MODEL_NEURON_RATES[model] ?? fallback;
  }

  private static toTokenCount(value: number | undefined): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
    return Math.ceil(value);
  }

  private static maxTokenCount(first: number | undefined, second: number | undefined): number | undefined {
    if (first === undefined) return second;
    if (second === undefined) return first;
    return Math.max(first, second);
  }
}

interface ModelNeuronRates {
  inputNeuronsPerMillionTokens: number;
  outputNeuronsPerMillionTokens?: number;
}

interface AiTextGenerationUsageEstimate {
  estimatedNeurons: number;
  promptTokens: number;
  completionTokens: number;
}

interface AiEmbeddingUsageEstimate {
  estimatedNeurons: number;
  embeddingTokens: number;
}

export { AiUsageUtil };
export type { AiEmbeddingUsageEstimate, AiTextGenerationUsageEstimate, ModelNeuronRates };
