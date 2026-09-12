import { describe, expect, it, vi } from 'vitest';
import { EmailSummaryUtil } from '@mail-otter/backend-services/email';
import { AiSummaryRetryableError } from '@mail-otter/backend-errors';

function aiWith(response: unknown) {
  return { run: vi.fn().mockResolvedValue(response) } as unknown as Ai;
}

describe('EmailSummaryUtil parsing and rendering', () => {
  it('parses fenced JSON summaries', () => {
    const summary = EmailSummaryUtil.parseAiSummaryResult(
      '```json\n{"gist":"Hi","keyDetails":["a"],"actions":[]}\n```',
    );
    expect(summary).toMatchObject({ gist: 'Hi', keyDetails: ['a'], actions: [] });
  });

  it('falls back to loose text parsing and rejects garbage', () => {
    const loose = EmailSummaryUtil.parseAiSummaryResult('Weekly update\n- shipped v2\n- fixed bugs');
    expect(loose).toMatchObject({ gist: 'Weekly update', keyDetails: ['shipped v2', 'fixed bugs'] });
    expect(EmailSummaryUtil.parseAiSummaryResult('{"wrong":true}')).toBeUndefined();
    expect(EmailSummaryUtil.parseAiSummaryResult('not json at all {{{')).toBeDefined();
  });

  it('normalizes action proposals and drops invalid ones', () => {
    const summary = EmailSummaryUtil.parseAiSummaryResult(
      JSON.stringify({
        gist: 'g',
        keyDetails: ['  spaced   out  ', ''],
        actions: [
          { type: 'calendar.add_event', title: 'Party', description: 'Fun', confidence: 0.9, parameters: { a: 1 } },
          { type: 'calendar.add_event', title: 'Bad', description: 'x', confidence: NaN },
          { type: 'unknown.thing', title: 't', description: 'd' },
          { type: 'manual.todo', title: 'only-title' },
          'not-an-object',
        ],
      }),
    );
    expect(summary?.keyDetails).toEqual(['spaced out']);
    expect(summary?.actions).toHaveLength(2);
    expect(summary?.actions[0]).toMatchObject({ type: 'calendar.add_event', confidence: 0.9, parameters: { a: 1 } });
    expect(summary?.actions[1]).toMatchObject({ type: 'calendar.add_event', confidence: undefined, parameters: {} });
  });

  it('renders HTML and plain-text summaries with locale fallbacks', () => {
    const html = EmailSummaryUtil.renderHtmlSummary({ gist: '', keyDetails: [], actions: [] });
    expect(html).toContain('<ul>');
    const text = EmailSummaryUtil.renderPlainTextSummary({ gist: 'Hello', keyDetails: ['a'], actions: [] });
    expect(text).toContain('Hello');
  });

  it('builds prompts with fallbacks and custom instructions', () => {
    const prompt = EmailSummaryUtil.buildEmailSummaryPromptText('', '', 'body', undefined, undefined, 'Be brief', 'de');
    expect(prompt).toContain('(no subject)');
    expect(prompt).toContain('Be brief');
  });

  it('throws retryable errors on empty or invalid AI output', async () => {
    await expect(
      EmailSummaryUtil.summarizeEmailWithUsage(aiWith({ response: '' }), 'model', 's', 'f', 'b'),
    ).rejects.toThrow(AiSummaryRetryableError);
    await expect(
      EmailSummaryUtil.summarizeEmailWithUsage(aiWith({ response: '{"nope":1}' }), 'model', 's', 'f', 'b'),
    ).rejects.toThrow(AiSummaryRetryableError);
  });

  it('disables thinking for reasoning models with JSON mode', async () => {
    const ai = aiWith({ response: JSON.stringify({ gist: 'g', keyDetails: [], actions: [] }) });
    await EmailSummaryUtil.summarizeEmail(ai, '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', 's', 'f', 'b');
    expect(ai.run).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ chat_template_kwargs: { thinking: false } }),
    );
  });
});
