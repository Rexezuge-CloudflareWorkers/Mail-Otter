import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailRuleSuggestionUtil } from '@mail-otter/backend-services/email';
import type { EmailRuleSuggestionResult } from '@mail-otter/backend-services/email';
import { BadRequestError } from '@mail-otter/backend-errors';

const MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';

function makeAi(response: unknown): Ai {
  return { run: vi.fn().mockResolvedValue({ response: JSON.stringify(response) }) };
}

function validRule() {
  return {
    name: 'Skip Newsletters',
    enabled: true,
    conditions: { operator: 'any', matchers: [{ field: 'from', op: 'matches_sender', value: '@newsletter.com' }] },
    action: { type: 'skip' },
  };
}

describe('EmailRuleSuggestionUtil.suggest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a valid rule from a well-formed AI response', async () => {
    const ai = makeAi(validRule());
    const result = await EmailRuleSuggestionUtil.suggest(ai, MODEL, 'skip newsletters from newsletter.com');
    expect(result.name).toBe('Skip Newsletters');
    expect(result.action.type).toBe('skip');
    expect(result.conditions.matchers[0]?.field).toBe('from');
    expect(result.conditions.matchers[0]?.op).toBe('matches_sender');
  });

  it('passes the description to the AI as user message', async () => {
    const runFn = vi.fn().mockResolvedValue({ response: JSON.stringify(validRule()) });
    const ai = { run: runFn } as unknown as Ai;
    await EmailRuleSuggestionUtil.suggest(ai, MODEL, 'my custom description');
    const call = runFn.mock.calls[0];
    const messages = (call[1] as { messages: Array<{ role: string; content: string }> }).messages;
    const userMessage = messages.find((m) => m.role === 'user');
    expect(userMessage?.content).toBe('my custom description');
  });

  it('coerces matches_sender on a non-from field to contains', async () => {
    const rule = {
      ...validRule(),
      conditions: { operator: 'any', matchers: [{ field: 'subject', op: 'matches_sender', value: '@example.com' }] },
    };
    const ai = makeAi(rule);
    const result = await EmailRuleSuggestionUtil.suggest(ai, MODEL, 'test');
    expect(result.conditions.matchers[0]?.op).toBe('contains');
    expect(result.conditions.matchers[0]?.field).toBe('subject');
  });

  it('throws BadRequestError when AI returns unparseable text', async () => {
    const ai = { run: vi.fn().mockResolvedValue({ response: 'this is not json at all' }) } as unknown as Ai;
    await expect(EmailRuleSuggestionUtil.suggest(ai, MODEL, 'test')).rejects.toThrow(BadRequestError);
  });

  it('throws BadRequestError when AI returns an empty response', async () => {
    const ai = { run: vi.fn().mockResolvedValue({ response: '' }) } as unknown as Ai;
    await expect(EmailRuleSuggestionUtil.suggest(ai, MODEL, 'test')).rejects.toThrow(BadRequestError);
  });

  it('throws BadRequestError when AI returns JSON failing schema validation', async () => {
    const invalid = { name: 'Bad Rule', enabled: true };
    const ai = makeAi(invalid);
    await expect(EmailRuleSuggestionUtil.suggest(ai, MODEL, 'test')).rejects.toThrow(BadRequestError);
  });

  it('throws BadRequestError when prepend_instruction action has no instruction', async () => {
    const rule = { ...validRule(), action: { type: 'prepend_instruction' } };
    const ai = makeAi(rule);
    await expect(EmailRuleSuggestionUtil.suggest(ai, MODEL, 'test')).rejects.toThrow(BadRequestError);
  });

  it('accepts prepend_instruction action with a valid instruction', async () => {
    const rule = { ...validRule(), action: { type: 'prepend_instruction', instruction: 'Extract invoice number.' } };
    const ai = makeAi(rule);
    const result = await EmailRuleSuggestionUtil.suggest(ai, MODEL, 'extract invoice details');
    expect(result.action.type).toBe('prepend_instruction');
    expect(result.action.instruction).toBe('Extract invoice number.');
  });

  it('extracts JSON object embedded in prose', async () => {
    const json = JSON.stringify(validRule());
    const ai = { run: vi.fn().mockResolvedValue({ response: `Here is your rule: ${json} Enjoy!` }) } as unknown as Ai;
    const result = await EmailRuleSuggestionUtil.suggest(ai, MODEL, 'test');
    expect(result.name).toBe('Skip Newsletters');
  });

  it('uses json_schema response_format for models that support JSON mode', async () => {
    const runFn = vi.fn().mockResolvedValue({ response: JSON.stringify(validRule()) });
    const ai = { run: runFn } as unknown as Ai;
    await EmailRuleSuggestionUtil.suggest(ai, '@cf/meta/llama-3.1-8b-instruct-fast', 'test');
    const call = runFn.mock.calls[0];
    const req = call[1] as Record<string, unknown>;
    expect(req['response_format']).toBeDefined();
    expect((req['response_format'] as Record<string, unknown>)['type']).toBe('json_schema');
  });

  it('does not use response_format for unsupported models', async () => {
    const runFn = vi.fn().mockResolvedValue({ response: JSON.stringify(validRule()) });
    const ai = { run: runFn } as unknown as Ai;
    await EmailRuleSuggestionUtil.suggest(ai, '@cf/some/unknown-model', 'test');
    const call = runFn.mock.calls[0];
    const req = call[1] as Record<string, unknown>;
    expect(req['response_format']).toBeUndefined();
  });
});

describe('EmailRuleSuggestionUtil.suggestWithUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the rule and usage when the AI response includes token counts', async () => {
    const runFn = vi.fn().mockResolvedValue({
      response: JSON.stringify(validRule()),
      usage: { prompt_tokens: 200, completion_tokens: 50, total_tokens: 250 },
    });
    const ai = { run: runFn } as unknown as Ai;
    const result: EmailRuleSuggestionResult = await EmailRuleSuggestionUtil.suggestWithUsage(ai, MODEL, 'skip newsletters');
    expect(result.rule.name).toBe('Skip Newsletters');
    expect(result.usage).toEqual({ promptTokens: 200, completionTokens: 50, totalTokens: 250, reasoningTokens: undefined });
  });

  it('returns usage: undefined when the AI response has no usage metadata', async () => {
    const ai = makeAi(validRule());
    const result: EmailRuleSuggestionResult = await EmailRuleSuggestionUtil.suggestWithUsage(ai, MODEL, 'skip newsletters');
    expect(result.usage).toBeUndefined();
  });

  it('suggest() delegates to suggestWithUsage() and returns only the rule', async () => {
    const runFn = vi.fn().mockResolvedValue({
      response: JSON.stringify(validRule()),
      usage: { prompt_tokens: 100, completion_tokens: 30 },
    });
    const ai = { run: runFn } as unknown as Ai;
    const rule = await EmailRuleSuggestionUtil.suggest(ai, MODEL, 'test');
    expect(rule.name).toBe('Skip Newsletters');
    expect((rule as unknown as Record<string, unknown>)['usage']).toBeUndefined();
  });

  it('extracts JSON object embedded in fenced code block', async () => {
    const json = JSON.stringify(validRule());
    const ai = { run: vi.fn().mockResolvedValue({ response: `\`\`\`json\n${json}\n\`\`\`` }) } as unknown as Ai;
    const result = await EmailRuleSuggestionUtil.suggestWithUsage(ai, MODEL, 'test');
    expect(result.rule.name).toBe('Skip Newsletters');
  });
});
