import { AiSummaryRetryableError } from '@mail-otter/backend-errors';
import { EmailContentUtil } from '@mail-otter/provider-clients/email-content';

const SUMMARY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['gist', 'keyDetails', 'actionItems'],
  properties: {
    gist: {
      type: 'string',
    },
    keyDetails: {
      type: 'array',
      items: { type: 'string' },
    },
    actionItems: {
      type: 'array',
      items: { type: 'string' },
    },
  },
} as const;

const JSON_MODE_SUPPORTED_MODELS: ReadonlySet<string> = new Set<string>([
  '@cf/meta/llama-3.1-8b-instruct-fast',
  '@cf/meta/llama-3.1-70b-instruct',
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/meta/llama-3-8b-instruct',
  '@cf/meta/llama-3.1-8b-instruct',
  '@cf/meta/llama-3.2-11b-vision-instruct',
  '@hf/nousresearch/hermes-2-pro-mistral-7b',
  '@hf/thebloke/deepseek-coder-6.7b-instruct-awq',
  '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
]);

class EmailSummaryUtil {
  public static async summarizeEmail(
    ai: Ai,
    model: string,
    subject: string,
    from: string,
    body: string,
    ragContext?: string | undefined,
  ): Promise<string> {
    const result: EmailSummaryResult = await EmailSummaryUtil.summarizeEmailWithUsage(ai, model, subject, from, body, ragContext);
    return result.summary;
  }

  public static async summarizeEmailWithUsage(
    ai: Ai,
    model: string,
    subject: string,
    from: string,
    body: string,
    ragContext?: string | undefined,
  ): Promise<EmailSummaryResult> {
    const instructions = [
      'You are a helpful assistant that summarizes emails for a mailbox owner.',
      'Return only JSON with this exact shape: {"gist":"one sentence","keyDetails":["short fact"],"actionItems":["owner deadline or request"]}.',
      'Keep the gist to one sentence.',
      'Key details must be short factual bullets copied from the email when possible.',
      'Action items must include deadlines or owners when present.',
      'If there are no action items, return an empty array.',
      'Do not invent facts. Do not include a greeting.',
      'You may use <a href="URL">text</a> to create clickable links in gist, key details, or action items.',
      'Only use the href attribute; no other HTML tags or attributes are allowed.',
    ].join(' ');

    const input = [
      'Summarize this email for the mailbox owner.',
      'Use the PRIOR CONTEXT (if any) only as background, not as the email to summarize.',
      '',
      `Subject: ${subject || '(no subject)'}`,
      `From: ${from || '(unknown)'}`,
      '',
      body,
      ...(ragContext ? ['', '--- PRIOR CONTEXT (for background only, do not summarize) ---', ragContext] : []),
    ].join('\n');

    const request: AiTextGenerationRequest = {
      messages: [
        { role: 'system', content: instructions },
        { role: 'user', content: input },
      ],
      max_tokens: 512,
      temperature: 0.2,
    };

    if (EmailSummaryUtil.supportsJsonMode(model)) {
      request.response_format = {
        type: 'json_schema',
        json_schema: SUMMARY_JSON_SCHEMA,
      };
    }

    const result = await (ai as unknown as { run: (...args: unknown[]) => Promise<unknown> }).run(model, request);
    const usage: AiTextGenerationUsage | undefined = EmailSummaryUtil.extractUsage(result);

    const summaryText = EmailSummaryUtil.extractResponseText(result);
    if (!summaryText) {
      throw new AiSummaryRetryableError('Workers AI did not return a summary.');
    }

    const summary = EmailSummaryUtil.parseAiSummaryResult(summaryText);
    if (!summary) {
      throw new AiSummaryRetryableError('Workers AI did not return a valid summary.');
    }
    return { summary: EmailSummaryUtil.renderHtmlSummary(summary), usage };
  }

  private static supportsJsonMode(model: string): boolean {
    return JSON_MODE_SUPPORTED_MODELS.has(model);
  }

  private static extractResponseText(result: unknown): string | undefined {
    if (typeof result === 'string') {
      return result;
    }
    if (!EmailSummaryUtil.isRecord(result)) {
      return undefined;
    }

    const response: unknown = result.response;
    if (response) {
      return EmailSummaryUtil.stringifyTextResponse(response);
    }

    const outputText: unknown = result.output_text;
    if (typeof outputText === 'string') {
      return outputText;
    }

    const output: unknown = result.output;
    const outputFromResponsesApi: string | undefined = EmailSummaryUtil.extractResponsesApiOutputText(output);
    if (outputFromResponsesApi) {
      return outputFromResponsesApi;
    }

    const choices: unknown = result.choices;
    const chatCompletionText: string | undefined = EmailSummaryUtil.extractChatCompletionText(choices);
    if (chatCompletionText) {
      return chatCompletionText;
    }

    const toolCalls: unknown = result.tool_calls;
    if (Array.isArray(toolCalls) && EmailSummaryUtil.isRecord(toolCalls[0]) && toolCalls[0].arguments) {
      return EmailSummaryUtil.stringifyTextResponse(toolCalls[0].arguments);
    }

    return undefined;
  }

  private static extractUsage(result: unknown): AiTextGenerationUsage | undefined {
    if (!EmailSummaryUtil.isRecord(result) || !EmailSummaryUtil.isRecord(result.usage)) return undefined;

    const promptTokens: number | undefined = EmailSummaryUtil.getOptionalNumber(result.usage.prompt_tokens ?? result.usage.input_tokens);
    const completionTokens: number | undefined = EmailSummaryUtil.getOptionalNumber(
      result.usage.completion_tokens ?? result.usage.output_tokens,
    );
    const totalTokens: number | undefined = EmailSummaryUtil.getOptionalNumber(result.usage.total_tokens);
    if (promptTokens === undefined && completionTokens === undefined && totalTokens === undefined) return undefined;
    return { promptTokens, completionTokens, totalTokens };
  }

  static parseAiSummaryResult(result: string): EmailSummary | undefined {
    const parsed: unknown =
      EmailSummaryUtil.tryParseJson(result) ??
      EmailSummaryUtil.tryParseExtractedJsonObject(result) ??
      EmailSummaryUtil.parseLooseText(result);

    if (!EmailSummaryUtil.isEmailSummary(parsed)) {
      return undefined;
    }
    return {
      gist: EmailSummaryUtil.normalizeSentence(parsed.gist),
      keyDetails: EmailSummaryUtil.normalizeItems(parsed.keyDetails),
      actionItems: EmailSummaryUtil.normalizeItems(parsed.actionItems),
    };
  }

  static renderHtmlSummary(summary: EmailSummary): string {
    const gist: string = EmailSummaryUtil.normalizeSentence(summary.gist) || 'No clear gist available.';
    const keyDetails: string[] = EmailSummaryUtil.normalizeItems(summary.keyDetails);
    const actionItems: string[] = EmailSummaryUtil.normalizeItems(summary.actionItems);

    return [
      `<p><strong>Gist:</strong> ${EmailContentUtil.sanitizeHtml(gist)}</p>`,
      '',
      '<p><strong>Key details:</strong></p>',
      '<ul>',
      ...EmailSummaryUtil.renderHtmlList(keyDetails, '<li>No key details noted.</li>'),
      '</ul>',
      '',
      '<p><strong>Action items:</strong></p>',
      '<ul>',
      ...EmailSummaryUtil.renderHtmlList(actionItems, '<li>None.</li>'),
      '</ul>',
      '',
      '<p><em>Powered by Mail-Otter</em></p>',
    ].join('\n');
  }

  static renderPlainTextSummary(summary: EmailSummary): string {
    return EmailContentUtil.stripHtml(EmailSummaryUtil.renderHtmlSummary(summary));
  }

  private static parseLooseText(response: string): EmailSummary {
    const lines: string[] = response
      .split('\n')
      .map((line: string): string => line.trim())
      .filter(Boolean);
    const gistLine: string = lines.find((line: string): boolean => !/^[-*]|^[A-Za-z ]+:$/.test(line)) || response.trim();
    const bulletLines: string[] = lines
      .filter((line: string): boolean => /^[-*]\s+/.test(line))
      .map((line: string): string => line.replace(/^[-*]\s+/, '').trim())
      .filter(Boolean);
    return {
      gist: gistLine,
      keyDetails: bulletLines,
      actionItems: [],
    };
  }

  private static renderHtmlList(items: string[], emptyValue: string): string[] {
    if (items.length === 0) return [emptyValue];
    return items.map((item: string): string => `<li>${EmailContentUtil.sanitizeHtml(item)}</li>`);
  }

  private static normalizeItems(items: string[]): string[] {
    return items.map((item: string): string => EmailSummaryUtil.normalizeSentence(item)).filter(Boolean);
  }

  private static normalizeSentence(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }

  private static tryParseJson(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }

  private static tryParseExtractedJsonObject(value: string): unknown {
    const jsonObjectText: string | undefined = EmailSummaryUtil.extractJsonObjectText(value);
    return jsonObjectText ? EmailSummaryUtil.tryParseJson(jsonObjectText) : undefined;
  }

  private static extractJsonObjectText(value: string): string | undefined {
    const fencedJson: string | undefined = EmailSummaryUtil.extractFencedJsonText(value);
    if (fencedJson) {
      return fencedJson.trim();
    }

    const start: number = value.indexOf('{');
    if (start === -1) return undefined;

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < value.length; index += 1) {
      const char: string = value[index]!;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === '{') depth += 1;
      if (char === '}') {
        depth -= 1;
        if (depth === 0) return value.slice(start, index + 1);
      }
    }
    return undefined;
  }

  private static extractFencedJsonText(value: string): string | undefined {
    const openingFence: number = value.indexOf('```');
    if (openingFence === -1) return undefined;

    let contentStart: number = openingFence + 3;
    if (value.slice(contentStart, contentStart + 4).toLowerCase() === 'json') {
      contentStart += 4;
    }

    while (contentStart < value.length) {
      const char: string = value[contentStart]!;
      if (char !== ' ' && char !== '\t' && char !== '\n' && char !== '\r') break;
      contentStart += 1;
    }

    const closingFence: number = value.indexOf('```', contentStart);
    return closingFence === -1 ? undefined : value.slice(contentStart, closingFence);
  }

  private static extractResponsesApiOutputText(output: unknown): string | undefined {
    if (!Array.isArray(output)) return undefined;
    const textParts: string[] = [];
    for (const item of output) {
      if (!EmailSummaryUtil.isRecord(item)) continue;
      const content: unknown = item.content;
      if (!Array.isArray(content)) continue;
      for (const contentPart of content) {
        if (!EmailSummaryUtil.isRecord(contentPart)) continue;
        if (typeof contentPart.text === 'string') {
          textParts.push(contentPart.text);
        }
      }
    }
    return textParts.length > 0 ? textParts.join('\n') : undefined;
  }

  private static extractChatCompletionText(choices: unknown): string | undefined {
    if (!Array.isArray(choices)) return undefined;
    const firstChoice: unknown = choices[0];
    if (!EmailSummaryUtil.isRecord(firstChoice)) return undefined;
    const message: unknown = firstChoice.message;
    if (!EmailSummaryUtil.isRecord(message)) return undefined;
    const content: unknown = message.content;
    return typeof content === 'string' ? content : undefined;
  }

  private static stringifyTextResponse(value: unknown): string | undefined {
    if (typeof value === 'string') {
      return value;
    }
    if (value && typeof value === 'object') {
      return JSON.stringify(value);
    }
    return undefined;
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }

  private static getOptionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }

  private static isEmailSummary(value: unknown): value is EmailSummary {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate.gist === 'string' &&
      Array.isArray(candidate.keyDetails) &&
      candidate.keyDetails.every((item: unknown): boolean => typeof item === 'string') &&
      Array.isArray(candidate.actionItems) &&
      candidate.actionItems.every((item: unknown): boolean => typeof item === 'string')
    );
  }
}

interface EmailSummary {
  gist: string;
  keyDetails: string[];
  actionItems: string[];
}

interface EmailSummaryResult {
  summary: string;
  usage?: AiTextGenerationUsage | undefined;
}

interface AiTextGenerationUsage {
  promptTokens?: number | undefined;
  completionTokens?: number | undefined;
  totalTokens?: number | undefined;
}

interface AiTextGenerationRequest {
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  max_tokens: number;
  temperature: number;
  response_format?:
    | {
        type: 'json_schema';
        json_schema: typeof SUMMARY_JSON_SCHEMA;
      }
    | undefined;
}

export { EmailSummaryUtil };
export type { AiTextGenerationUsage, EmailSummary, EmailSummaryResult };
