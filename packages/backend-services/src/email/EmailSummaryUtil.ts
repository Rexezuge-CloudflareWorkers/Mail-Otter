import { AiSummaryRetryableError } from '@mail-otter/backend-errors';
import { EmailContentUtil } from '@mail-otter/provider-clients/email-content';
import { TimeZoneUtil } from '@mail-otter/shared/utils';
import type { EmailActionProposal } from '@mail-otter/shared/model';
import { WorkersAiResponseUtil } from './WorkersAiResponseUtil';
import type { AiTextGenerationUsage } from './WorkersAiResponseUtil';

const SUMMARY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['gist', 'keyDetails', 'actions'],
  properties: {
    gist: {
      type: 'string',
    },
    keyDetails: {
      type: 'array',
      items: { type: 'string' },
    },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'title', 'description', 'parameters'],
        properties: {
          type: {
            type: 'string',
            enum: ['calendar.add_event', 'email.draft_reply', 'external.open_link', 'manual.todo'],
          },
          title: { type: 'string' },
          description: { type: 'string' },
          confidence: { type: 'number' },
          parameters: {
            type: 'object',
            additionalProperties: true,
          },
        },
      },
    },
  },
} as const;

const GPT_OSS_MODELS: ReadonlySet<string> = new Set<string>(['@cf/openai/gpt-oss-120b', '@cf/openai/gpt-oss-20b']);

class EmailSummaryUtil {
  public static async summarizeEmail(
    ai: Ai,
    model: string,
    subject: string,
    from: string,
    body: string,
    ragContext?: string | undefined,
    timeZone?: string | undefined,
    customInstruction?: string | undefined,
  ): Promise<string> {
    const result: EmailSummaryResult = await EmailSummaryUtil.summarizeEmailWithUsage(ai, model, subject, from, body, ragContext, timeZone, customInstruction);
    return result.summary;
  }

  public static async summarizeEmailWithUsage(
    ai: Ai,
    model: string,
    subject: string,
    from: string,
    body: string,
    ragContext?: string | undefined,
    timeZone?: string | undefined,
    customInstruction?: string | undefined,
  ): Promise<EmailSummaryResult> {
    const instructions: string = EmailSummaryUtil.buildSummaryInstructions(timeZone, customInstruction);
    const input: string = EmailSummaryUtil.buildSummaryInput(subject, from, body, ragContext);

    const request: AiTextGenerationRequest = {
      messages: [
        { role: 'system', content: instructions },
        { role: 'user', content: input },
      ],
      max_tokens: 1200,
      temperature: 0.2,
    };

    if (WorkersAiResponseUtil.supportsJsonMode(model)) {
      request.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'email_summary',
          schema: SUMMARY_JSON_SCHEMA,
          strict: true,
        },
      };
    }

    if (EmailSummaryUtil.isGptOssModel(model)) {
      request.reasoning_effort = 'low';
      request.chat_template_kwargs = { enable_thinking: false };
    }

    const result = await (ai as unknown as { run: (...args: unknown[]) => Promise<unknown> }).run(model, request);
    const usage: AiTextGenerationUsage | undefined = WorkersAiResponseUtil.extractUsage(result);

    const summaryText = WorkersAiResponseUtil.extractResponseText(result);
    if (!summaryText) {
      throw new AiSummaryRetryableError('Workers AI did not return a summary.', { aiUsage: usage });
    }

    const summary = EmailSummaryUtil.parseAiSummaryResult(summaryText);
    if (!summary) {
      throw new AiSummaryRetryableError('Workers AI did not return a valid summary.', { aiUsage: usage, aiOutputText: summaryText });
    }
    return { summary: EmailSummaryUtil.renderHtmlSummary(summary), emailSummary: summary, actionProposals: summary.actions, usage };
  }

  public static buildEmailSummaryPromptText(subject: string, from: string, body: string, ragContext?: string | undefined, timeZone?: string | undefined, customInstruction?: string | undefined): string {
    return [EmailSummaryUtil.buildSummaryInstructions(timeZone, customInstruction), EmailSummaryUtil.buildSummaryInput(subject, from, body, ragContext)].join('\n\n');
  }

  private static buildSummaryInstructions(timeZone?: string | undefined, customInstruction?: string | undefined): string {
    const zone: string = TimeZoneUtil.normalize(timeZone);
    const currentDate: string = TimeZoneUtil.todayInZone(zone);
    const parts: string[] = [
      'You are a helpful assistant that summarizes emails for a mailbox owner.',
      `Today is ${currentDate} in the mailbox owner's time zone ${zone}.`,
      'Return only JSON with this exact shape: {"gist":"one sentence","keyDetails":["short fact"],"actions":[{"type":"calendar.add_event|email.draft_reply|external.open_link|manual.todo","title":"short title","description":"what will happen","confidence":0.8,"parameters":{}}]}.',
      'Keep the gist to one sentence.',
      'Details must be short factual bullets copied from the email when possible.',
      'Actions are optional executable proposals; return an empty actions array when no safe action exists.',
      `Use calendar.add_event when a calendar event is mentioned; resolve relative dates (e.g. 'tomorrow', 'next Friday') to absolute ISO 8601 datetimes using today's date in ${zone}; parameters must include eventTitle, startTime (ISO 8601), endTime (ISO 8601), timeZone (use ${zone} unless the email explicitly states another time zone), and optional location or notes.`,
      'Use email.draft_reply when the owner should respond; parameters must include draftBody and optional draftSubject.',
      'Use external.open_link only for URLs present in the email; parameters must include url.',
      'Use manual.todo for useful actions that cannot be automated safely; parameters must include instructions.',
      'Do not create callback URLs or invent links.',
      'Do not invent facts. Do not include a greeting.',
    ];
    if (customInstruction) {
      parts.push(`Additional instructions: ${customInstruction}`);
    }
    return parts.join(' ');
  }

  private static buildSummaryInput(subject: string, from: string, body: string, ragContext?: string | undefined): string {
    return [
      'Summarize this email for the mailbox owner.',
      'Use the PRIOR CONTEXT (if any) only as background, not as the email to summarize.',
      '',
      `Subject: ${subject || '(no subject)'}`,
      `From: ${from || '(unknown)'}`,
      '',
      body,
      ...(ragContext ? ['', '--- PRIOR CONTEXT (for background only, do not summarize) ---', ragContext] : []),
    ].join('\n');
  }

  private static isGptOssModel(model: string): boolean {
    return GPT_OSS_MODELS.has(model);
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
      actions: EmailSummaryUtil.normalizeActionProposals(parsed.actions),
    };
  }

  static renderHtmlSummary(summary: EmailSummary): string {
    const gist: string = EmailSummaryUtil.normalizeSentence(summary.gist) || 'No clear gist available.';
    const keyDetails: string[] = EmailSummaryUtil.normalizeItems(summary.keyDetails);

    return [
      `<p><strong>Gist:</strong> ${EmailContentUtil.sanitizeHtml(gist)}</p>`,
      '',
      '<p><strong>Details:</strong></p>',
      '<ul>',
      ...EmailSummaryUtil.renderHtmlList(keyDetails, '<li>No key details noted.</li>'),
      '</ul>',
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
      actions: [],
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
    const jsonObjectText: string | undefined = WorkersAiResponseUtil.extractJsonObjectText(value);
    return jsonObjectText ? EmailSummaryUtil.tryParseJson(jsonObjectText) : undefined;
  }

  private static isEmailSummary(value: unknown): value is EmailSummary {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate.gist === 'string' &&
      Array.isArray(candidate.keyDetails) &&
      candidate.keyDetails.every((item: unknown): boolean => typeof item === 'string') &&
      (candidate.actions === undefined || Array.isArray(candidate.actions))
    );
  }

  private static normalizeActionProposals(value: unknown): EmailActionProposal[] {
    if (!Array.isArray(value)) return [];
    const actions: EmailActionProposal[] = [];
    for (const item of value) {
      if (!WorkersAiResponseUtil.isRecord(item)) continue;
      const type = typeof item.type === 'string' ? item.type : '';
      if (!['calendar.add_event', 'email.draft_reply', 'external.open_link', 'manual.todo'].includes(type)) continue;
      if (typeof item.title !== 'string' || typeof item.description !== 'string') continue;
      actions.push({
        type: type as EmailActionProposal['type'],
        title: EmailSummaryUtil.normalizeSentence(item.title),
        description: EmailSummaryUtil.normalizeSentence(item.description),
        confidence: typeof item.confidence === 'number' && Number.isFinite(item.confidence) ? item.confidence : undefined,
        parameters: WorkersAiResponseUtil.isRecord(item.parameters) ? item.parameters : {},
      });
    }
    return actions;
  }
}

interface EmailSummary {
  gist: string;
  keyDetails: string[];
  actions: EmailActionProposal[];
}

interface EmailSummaryResult {
  summary: string;
  emailSummary?: EmailSummary | undefined;
  actionProposals?: EmailActionProposal[] | undefined;
  usage?: AiTextGenerationUsage | undefined;
}

interface AiTextGenerationRequest {
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  max_tokens: number;
  temperature: number;
  response_format?:
    | {
        type: 'json_schema';
        json_schema: {
          name: string;
          schema: typeof SUMMARY_JSON_SCHEMA;
          strict: boolean;
        };
      }
    | undefined;
  reasoning_effort?: 'low' | 'medium' | 'high' | undefined;
  chat_template_kwargs?: { enable_thinking?: boolean | undefined } | undefined;
}

export { EmailSummaryUtil };
export type { AiTextGenerationUsage, EmailSummary, EmailSummaryResult };
