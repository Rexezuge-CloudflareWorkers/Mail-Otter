const JSON_MODE_SUPPORTED_MODELS: ReadonlySet<string> = new Set<string>([
  '@cf/openai/gpt-oss-120b',
  '@cf/openai/gpt-oss-20b',
  '@cf/meta/llama-3.1-8b-instruct-fast',
  '@cf/meta/llama-3.1-70b-instruct',
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/meta/llama-3-8b-instruct',
  '@cf/meta/llama-3.1-8b-instruct',
  '@cf/meta/llama-3.2-11b-vision-instruct',
  '@hf/nousresearch/hermes-2-pro-mistral-7b',
  '@hf/thebloke/deepseek-coder-6.7b-instruct-awq',
  '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
  '@cf/moonshotai/kimi-k2.6',
]);

class WorkersAiResponseUtil {
  public static supportsJsonMode(model: string): boolean {
    return JSON_MODE_SUPPORTED_MODELS.has(model);
  }

  public static extractResponseText(result: unknown): string | undefined {
    if (typeof result === 'string') return result;
    if (!this.isRecord(result)) return undefined;

    const response: unknown = result.response;
    if (response) return this.stringifyTextResponse(response);

    const outputText: unknown = result.output_text;
    if (typeof outputText === 'string') return outputText;

    const outputFromResponsesApi: string | undefined = this.extractResponsesApiOutputText(result.output);
    if (outputFromResponsesApi) return outputFromResponsesApi;

    const chatCompletionText: string | undefined = this.extractChatCompletionText(result.choices);
    if (chatCompletionText) return chatCompletionText;

    const toolCalls: unknown = result.tool_calls;
    if (Array.isArray(toolCalls) && this.isRecord(toolCalls[0]) && toolCalls[0].arguments) {
      return this.stringifyTextResponse(toolCalls[0].arguments);
    }

    return undefined;
  }

  public static extractUsage(result: unknown): AiTextGenerationUsage | undefined {
    if (!this.isRecord(result) || !this.isRecord(result.usage)) return undefined;

    const promptTokens: number | undefined = this.getOptionalNumber(
      result.usage.prompt_tokens ?? result.usage.input_tokens,
    );
    const outputTokens: number | undefined = this.getOptionalNumber(
      result.usage.completion_tokens ?? result.usage.output_tokens,
    );
    const totalTokens: number | undefined = this.getOptionalNumber(result.usage.total_tokens);
    const completionTokens: number | undefined = this.resolveBilledOutputTokens(promptTokens, outputTokens, totalTokens);
    if (promptTokens === undefined && completionTokens === undefined && totalTokens === undefined) return undefined;
    const reasoningTokens: number | undefined = this.extractReasoningTokens(result.usage);
    return { promptTokens, completionTokens, totalTokens, reasoningTokens };
  }

  public static extractJsonObjectText(value: string): string | undefined {
    const fencedJson: string | undefined = this.extractFencedJsonText(value);
    if (fencedJson) return fencedJson.trim();

    const start: number = value.indexOf('{');
    if (start === -1) return undefined;

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < value.length; index += 1) {
      if (escaped) {
        escaped = false;
        continue;
      }
      const char: string = value[index];
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) return value.slice(start, index + 1);
      }
    }
    return undefined;
  }

  public static isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }

  public static getOptionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }

  private static resolveBilledOutputTokens(
    promptTokens: number | undefined,
    outputTokens: number | undefined,
    totalTokens: number | undefined,
  ): number | undefined {
    const outputTokensFromTotal: number | undefined =
      promptTokens !== undefined && totalTokens !== undefined ? Math.max(0, totalTokens - promptTokens) : undefined;
    if (outputTokens === undefined) return outputTokensFromTotal;
    if (outputTokensFromTotal === undefined) return outputTokens;
    return Math.max(outputTokens, outputTokensFromTotal);
  }

  private static extractReasoningTokens(usage: Record<string, unknown>): number | undefined {
    const directReasoningTokens: number | undefined = this.getOptionalNumber(usage.reasoning_tokens);
    if (directReasoningTokens !== undefined) return directReasoningTokens;
    const completionTokenDetails: unknown = usage.completion_tokens_details ?? usage.output_tokens_details;
    if (!this.isRecord(completionTokenDetails)) return undefined;
    return this.getOptionalNumber(completionTokenDetails.reasoning_tokens);
  }

  private static extractResponsesApiOutputText(output: unknown): string | undefined {
    if (!Array.isArray(output)) return undefined;
    const textParts: string[] = [];
    for (const item of output) {
      if (!this.isRecord(item)) continue;
      const content: unknown = item.content;
      if (!Array.isArray(content)) continue;
      for (const contentPart of content) {
        if (this.isRecord(contentPart) && typeof contentPart.text === 'string') {
          textParts.push(contentPart.text);
        }
      }
    }
    return textParts.length > 0 ? textParts.join('\n') : undefined;
  }

  private static extractChatCompletionText(choices: unknown): string | undefined {
    if (!Array.isArray(choices)) return undefined;
    const firstChoice: unknown = choices[0];
    if (!this.isRecord(firstChoice)) return undefined;
    const message: unknown = firstChoice.message;
    if (!this.isRecord(message)) return undefined;
    const content: unknown = message.content;
    return typeof content === 'string' ? content : undefined;
  }

  private static stringifyTextResponse(value: unknown): string | undefined {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') return JSON.stringify(value);
    return undefined;
  }

  private static extractFencedJsonText(value: string): string | undefined {
    const openingFence: number = value.indexOf('```');
    if (openingFence === -1) return undefined;

    let contentStart: number = openingFence + 3;
    if (value.slice(contentStart, contentStart + 4).toLowerCase() === 'json') contentStart += 4;

    while (contentStart < value.length) {
      const char: string = value[contentStart];
      if (char !== ' ' && char !== '\t' && char !== '\n' && char !== '\r') break;
      contentStart += 1;
    }

    const closingFence: number = value.indexOf('```', contentStart);
    return closingFence === -1 ? undefined : value.slice(contentStart, closingFence);
  }
}

interface AiTextGenerationUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
}

export { WorkersAiResponseUtil };
export type { AiTextGenerationUsage };
