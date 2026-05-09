import { InternalServerError } from '@/error';

interface GptOss20bOutput {
  response?: string | undefined;
}

class EmailSummaryUtil {
  public static async summarizeEmail(
    ai: Ai,
    model: string,
    subject: string,
    from: string,
    body: string,
    ragContext?: string | undefined,
  ): Promise<string> {
    const instructions = [
      'You are a helpful assistant that summarizes emails for a mailbox owner.',
      'Return JSON that exactly matches the requested schema.',
      'Keep the gist to one sentence.',
      'Key details must be short factual bullets copied from the email when possible.',
      'Action items must include deadlines or owners when present.',
      'If there are no action items, return an empty array.',
      'Do not invent facts. Do not include a greeting.',
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

    const result = (await ai.run(model, {
      instructions,
      input,
      max_tokens: 512,
      temperature: 0.2,
      response_format: {
        type: 'json_schema',
        json_schema: {
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
        },
      },
    })) as GptOss20bOutput;

    const summaryText = typeof result === 'string' ? result : result?.response;
    if (!summaryText) {
      throw new InternalServerError('Workers AI did not return a summary.');
    }

    const summary = EmailSummaryUtil.parseAiSummaryResult(summaryText);
    if (!summary) {
      throw new InternalServerError('Workers AI did not return a valid summary.');
    }
    return EmailSummaryUtil.renderSummary(summary);
  }

  static parseAiSummaryResult(result: string): EmailSummary | undefined {
    const parsed: unknown = EmailSummaryUtil.tryParseJson(result) ?? EmailSummaryUtil.parseLooseText(result);

    if (!EmailSummaryUtil.isEmailSummary(parsed)) {
      return undefined;
    }
    return {
      gist: EmailSummaryUtil.normalizeSentence(parsed.gist),
      keyDetails: EmailSummaryUtil.normalizeItems(parsed.keyDetails),
      actionItems: EmailSummaryUtil.normalizeItems(parsed.actionItems),
    };
  }

  static renderSummary(summary: EmailSummary): string {
    const gist: string = EmailSummaryUtil.normalizeSentence(summary.gist) || 'No clear gist available.';
    const keyDetails: string[] = EmailSummaryUtil.normalizeItems(summary.keyDetails);
    const actionItems: string[] = EmailSummaryUtil.normalizeItems(summary.actionItems);

    return [
      `Gist: ${gist}`,
      '',
      'Key details:',
      ...EmailSummaryUtil.renderList(keyDetails, 'No key details noted.'),
      '',
      'Action items:',
      ...EmailSummaryUtil.renderList(actionItems, 'None.'),
      '',
      '<Mail-Otter Summary>',
    ].join('\n');
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

  private static renderList(items: string[], emptyValue: string): string[] {
    if (items.length === 0) return [`- ${emptyValue}`];
    return items.map((item: string): string => `- ${item}`);
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

export { EmailSummaryUtil };
export type { EmailSummary };
