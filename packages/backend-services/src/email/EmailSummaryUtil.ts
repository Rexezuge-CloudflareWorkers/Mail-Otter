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
            enum: [
              'calendar.add_event',
              'email.draft_reply',
              'external.open_link',
              'manual.todo',
              'delivery.track_package',
              'travel.track_flight',
              'finance.pay_bill',
              'appointment.confirm',
            ],
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

const REASONING_MODELS_REQUIRING_THINKING_DISABLED: ReadonlySet<string> = new Set<string>([
  '@cf/moonshotai/kimi-k2.6',
  '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
]);

class EmailSummaryUtil {
  public static async summarizeEmail(
    ai: Ai,
    model: string,
    subject: string,
    from: string,
    body: string,
    ragContext?: string,
    timeZone?: string,
    customInstruction?: string,
  ): Promise<string> {
    const result: EmailSummaryResult = await this.summarizeEmailWithUsage(ai, model, subject, from, body, ragContext, timeZone, customInstruction);
    return result.summary;
  }

  public static async summarizeEmailWithUsage(
    ai: Ai,
    model: string,
    subject: string,
    from: string,
    body: string,
    ragContext?: string,
    timeZone?: string,
    customInstruction?: string,
  ): Promise<EmailSummaryResult> {
    const instructions: string = this.buildSummaryInstructions(timeZone, customInstruction);
    const input: string = this.buildSummaryInput(subject, from, body, ragContext);

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
      if (REASONING_MODELS_REQUIRING_THINKING_DISABLED.has(model)) {
        request.chat_template_kwargs = { thinking: false };
      }
    }

    request.reasoning_effort = 'low';

    const result = await (ai as unknown as { run: (...args: unknown[]) => Promise<unknown> }).run(model, request);
    const usage: AiTextGenerationUsage | undefined = WorkersAiResponseUtil.extractUsage(result);

    const summaryText = WorkersAiResponseUtil.extractResponseText(result);
    if (!summaryText) {
      throw new AiSummaryRetryableError('Workers AI did not return a summary.', { aiUsage: usage });
    }

    const summary = this.parseAiSummaryResult(summaryText);
    if (!summary) {
      throw new AiSummaryRetryableError('Workers AI did not return a valid summary.', { aiUsage: usage, aiOutputText: summaryText });
    }
    return { summary: this.renderHtmlSummary(summary), emailSummary: summary, actionProposals: summary.actions, usage };
  }

  public static buildEmailSummaryPromptText(subject: string, from: string, body: string, ragContext?: string  , timeZone?: string  , customInstruction?: string): string {
    return [this.buildSummaryInstructions(timeZone, customInstruction), this.buildSummaryInput(subject, from, body, ragContext)].join('\n\n');
  }

  private static buildSummaryInstructions(timeZone?: string  , customInstruction?: string): string {
    const zone: string = TimeZoneUtil.normalize(timeZone);
    const currentDate: string = TimeZoneUtil.todayInZone(zone);
    const parts: string[] = [
      'You are a helpful assistant that summarizes emails for a mailbox owner.',
      `Today is ${currentDate} in the mailbox owner's time zone ${zone}.`,
      'Return only JSON with this exact shape: {"gist":"one sentence","keyDetails":["short fact"],"actions":[{"type":"calendar.add_event|email.draft_reply|external.open_link|manual.todo|delivery.track_package|travel.track_flight|finance.pay_bill|appointment.confirm","title":"short title","description":"what will happen","confidence":0.8,"parameters":{}}]}.',
      'Keep the gist to one sentence.',
      'Details must be short factual bullets copied from the email when possible.',
      'Actions are optional executable proposals; return an empty actions array when no safe action exists.',
      `Use calendar.add_event when a calendar event is mentioned; resolve relative dates (e.g. 'tomorrow', 'next Friday') to absolute ISO 8601 datetimes using today's date in ${zone}; parameters must include eventTitle, startTime (ISO 8601), endTime (ISO 8601), timeZone (use ${zone} unless the email explicitly states another time zone), and optional location or notes.`,
      'Use email.draft_reply when the owner should respond; parameters must include draftBody and optional draftSubject.',
      'Use external.open_link only for URLs present in the email; parameters must include url.',
      'Use manual.todo for useful actions that cannot be automated safely; parameters must include instructions.',
      'Use delivery.track_package when a shipping or delivery notification contains a tracking number; parameters must include trackingNumber and optional carrier and trackingUrl (only if a tracking URL appears in the email).',
      'Use travel.track_flight when a flight booking or confirmation email contains a flight number; parameters must include flightNumber and optional airline, departureAirport, arrivalAirport, departureTime (ISO 8601 if determinable), and trackingUrl (only if a flight-status URL appears in the email).',
      'Use finance.pay_bill when an invoice, bill, or payment-due notice is detected; parameters must include at least one of payee, amount, currency, dueDate, or invoiceNumber, and optional paymentUrl (only if a payment URL appears in the email).',
      'Use appointment.confirm when an appointment, booking, or service confirmation email is detected; parameters should include any available serviceType, providerName, appointmentTime (ISO 8601 if determinable), location, confirmationNumber, or notes.',
      'Do not create callback URLs or invent links.',
      'Do not invent facts. Do not include a greeting.',
    ];
    if (customInstruction) {
      parts.push(`Additional instructions: ${customInstruction}`);
    }
    return parts.join(' ');
  }

  private static buildSummaryInput(subject: string, from: string, body: string, ragContext?: string): string {
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

  static parseAiSummaryResult(result: string): EmailSummary | undefined {
    const parsed: unknown =
      this.tryParseJson(result) ??
      this.tryParseExtractedJsonObject(result) ??
      this.parseLooseText(result);

    if (!this.isEmailSummary(parsed)) {
      return undefined;
    }
    return {
      gist: this.normalizeSentence(parsed.gist),
      keyDetails: this.normalizeItems(parsed.keyDetails),
      actions: this.normalizeActionProposals(parsed.actions),
    };
  }

  static renderHtmlSummary(summary: EmailSummary): string {
    const gist: string = this.normalizeSentence(summary.gist) || 'No clear gist available.';
    const keyDetails: string[] = this.normalizeItems(summary.keyDetails);

    return [
      `<p>${EmailContentUtil.sanitizeHtml(gist)}</p>`,
      '',
      '<p><strong>Details:</strong></p>',
      '<ul>',
      ...this.renderHtmlList(keyDetails, '<li>No key details noted.</li>'),
      '</ul>',
    ].join('\n');
  }

  static renderPlainTextSummary(summary: EmailSummary): string {
    return EmailContentUtil.stripHtml(this.renderHtmlSummary(summary));
  }

  private static parseLooseText(response: string): EmailSummary {
    const lines: string[] = response
      .split('\n')
      .map((line: string): string => line.trim())
      .filter(Boolean);
    const gistLine: string = lines.find((line: string): boolean => !/^[-*]|^[A-Z ]+:$/i.test(line)) || response.trim();
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
    return items.map((item: string): string => this.normalizeSentence(item)).filter(Boolean);
  }

  private static normalizeSentence(value: string): string {
    return value.replaceAll(/\s+/g, ' ').trim();
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
    return jsonObjectText ? this.tryParseJson(jsonObjectText) : undefined;
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
      if (
        ![
          'calendar.add_event',
          'email.draft_reply',
          'external.open_link',
          'manual.todo',
          'delivery.track_package',
          'travel.track_flight',
          'finance.pay_bill',
          'appointment.confirm',
        ].includes(type)
      )
        continue;
      if (typeof item.title !== 'string' || typeof item.description !== 'string') continue;
      actions.push({
        type: type as EmailActionProposal['type'],
        title: this.normalizeSentence(item.title),
        description: this.normalizeSentence(item.description),
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
  emailSummary?: EmailSummary;
  actionProposals?: EmailActionProposal[];
  usage?: AiTextGenerationUsage;
}

interface AiTextGenerationRequest {
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  max_tokens: number;
  temperature: number;
  response_format?: {
    type: 'json_schema';
    json_schema: {
      name: string;
      schema: typeof SUMMARY_JSON_SCHEMA;
      strict: boolean;
    };
  };
  reasoning_effort?: 'low' | 'medium' | 'high';
  chat_template_kwargs?: { thinking: boolean };
}

export { EmailSummaryUtil };
export type {  EmailSummary, EmailSummaryResult };

export {type AiTextGenerationUsage} from './WorkersAiResponseUtil';