import { InternalServerError } from '@/error';

class EmailSummaryUtil {
  public static async summarizeEmail(ai: Ai, model: string, subject: string, from: string, body: string): Promise<string> {
    const prompt: string = [
      'Summarize this email for the mailbox owner.',
      'Return a concise private summary with:',
      '- one sentence gist',
      '- key details',
      '- action items or deadlines if present',
      'Do not invent facts. Do not include a greeting.',
      '',
      `Subject: ${subject || '(no subject)'}`,
      `From: ${from || '(unknown)'}`,
      '',
      body,
    ].join('\n');

    const result = (await ai.run(model, {
      prompt,
      max_tokens: 512,
      temperature: 0.2,
    })) as WorkersAiTextGenerationResult;

    const response: string | undefined =
      typeof result === 'string'
        ? result
        : typeof result?.response === 'string'
          ? result.response
          : typeof result?.result === 'string'
            ? result.result
            : undefined;
    if (!response?.trim()) {
      throw new InternalServerError('Workers AI did not return a summary.');
    }
    return response.trim();
  }
}

interface WorkersAiTextGenerationResult {
  response?: string | undefined;
  result?: string | undefined;
}

export { EmailSummaryUtil };
