import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkersAiResponseUtil } from '../../packages/backend-services/src/email/WorkersAiResponseUtil';

describe('WorkersAiResponseUtil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('supportsJsonMode', () => {
    it('returns true for a known JSON-mode model', () => {
      expect(WorkersAiResponseUtil.supportsJsonMode('@cf/openai/gpt-oss-120b')).toBe(true);
    });

    it('returns false for an unknown model', () => {
      expect(WorkersAiResponseUtil.supportsJsonMode('@cf/unknown/model')).toBe(false);
    });

    it('returns false for an empty model name', () => {
      expect(WorkersAiResponseUtil.supportsJsonMode('')).toBe(false);
    });
  });

  describe('extractResponseText', () => {
    it('passes string results through', () => {
      expect(WorkersAiResponseUtil.extractResponseText('hello')).toBe('hello');
    });

    it('returns undefined for non-record results', () => {
      expect(WorkersAiResponseUtil.extractResponseText(undefined)).toBeUndefined();
      expect(WorkersAiResponseUtil.extractResponseText(null)).toBeUndefined();
      expect(WorkersAiResponseUtil.extractResponseText(42)).toBeUndefined();
      expect(WorkersAiResponseUtil.extractResponseText(['a'])).toBeUndefined();
    });

    it('extracts string response field', () => {
      expect(WorkersAiResponseUtil.extractResponseText({ response: 'text here' })).toBe('text here');
    });

    it('stringifies object response field', () => {
      const text = WorkersAiResponseUtil.extractResponseText({ response: { a: 1 } });
      expect(text).toBe(JSON.stringify({ a: 1 }));
    });

    it('extracts output_text field', () => {
      expect(WorkersAiResponseUtil.extractResponseText({ output_text: 'out' })).toBe('out');
    });

    it('extracts Responses API output text parts joined by newline', () => {
      const result = {
        output: [
          { content: [{ text: 'part one' }, { text: 'part two' }] },
          { content: [{ text: 'part three' }] },
        ],
      };
      expect(WorkersAiResponseUtil.extractResponseText(result)).toBe('part one\npart two\npart three');
    });

    it('skips non-record output items and non-text content parts', () => {
      const result = {
        output: ['nope', { content: 'nope' }, { content: [{ image: 'x' }] }],
      };
      expect(WorkersAiResponseUtil.extractResponseText(result)).toBeUndefined();
    });

    it('extracts chat completion choice content', () => {
      const result = { choices: [{ message: { content: 'chat says hi' } }] };
      expect(WorkersAiResponseUtil.extractResponseText(result)).toBe('chat says hi');
    });

    it('returns undefined for malformed choices', () => {
      expect(WorkersAiResponseUtil.extractResponseText({ choices: 'nope' })).toBeUndefined();
      expect(WorkersAiResponseUtil.extractResponseText({ choices: [] })).toBeUndefined();
      expect(WorkersAiResponseUtil.extractResponseText({ choices: [{ nope: 1 }] })).toBeUndefined();
      expect(WorkersAiResponseUtil.extractResponseText({ choices: [{ message: { content: 42 } }] })).toBeUndefined();
    });

    it('extracts tool_calls arguments', () => {
      const result = { tool_calls: [{ arguments: '{"a":1}' }] };
      expect(WorkersAiResponseUtil.extractResponseText(result)).toBe('{"a":1}');
    });

    it('stringifies object tool_calls arguments', () => {
      const result = { tool_calls: [{ arguments: { a: 1 } }] };
      expect(WorkersAiResponseUtil.extractResponseText(result)).toBe(JSON.stringify({ a: 1 }));
    });

    it('returns undefined when nothing matches', () => {
      expect(WorkersAiResponseUtil.extractResponseText({ unrelated: true })).toBeUndefined();
      expect(WorkersAiResponseUtil.extractResponseText({ output: [] })).toBeUndefined();
      expect(WorkersAiResponseUtil.extractResponseText({ tool_calls: [] })).toBeUndefined();
    });
  });

  describe('extractUsage', () => {
    it('extracts OpenAI-style usage', () => {
      expect(
        WorkersAiResponseUtil.extractUsage({ usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }),
      ).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15, reasoningTokens: undefined });
    });

    it('extracts Responses API style usage', () => {
      expect(
        WorkersAiResponseUtil.extractUsage({ usage: { input_tokens: 7, output_tokens: 3, total_tokens: 10 } }),
      ).toEqual({ promptTokens: 7, completionTokens: 3, totalTokens: 10, reasoningTokens: undefined });
    });

    it('derives billed output tokens from total minus prompt when larger', () => {
      const usage = WorkersAiResponseUtil.extractUsage({ usage: { prompt_tokens: 10, total_tokens: 20 } });
      expect(usage?.completionTokens).toBe(10);
    });

    it('keeps explicit output tokens when no total is present', () => {
      const usage = WorkersAiResponseUtil.extractUsage({ usage: { completion_tokens: 9 } });
      expect(usage?.completionTokens).toBe(9);
      expect(usage?.promptTokens).toBeUndefined();
    });

    it('takes the max of explicit and total-derived output tokens', () => {
      const usage = WorkersAiResponseUtil.extractUsage({
        usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 20 },
      });
      expect(usage?.completionTokens).toBe(10);
    });

    it('extracts direct reasoning tokens', () => {
      const usage = WorkersAiResponseUtil.extractUsage({ usage: { prompt_tokens: 5, reasoning_tokens: 12 } });
      expect(usage?.reasoningTokens).toBe(12);
    });

    it('extracts nested reasoning tokens from completion details', () => {
      const usage = WorkersAiResponseUtil.extractUsage({
        usage: { prompt_tokens: 1, completion_tokens_details: { reasoning_tokens: 6 } },
      });
      expect(usage?.reasoningTokens).toBe(6);
    });

    it('returns undefined for missing or empty usage', () => {
      expect(WorkersAiResponseUtil.extractUsage({})).toBeUndefined();
      expect(WorkersAiResponseUtil.extractUsage(null)).toBeUndefined();
      expect(WorkersAiResponseUtil.extractUsage({ usage: 'nope' })).toBeUndefined();
      expect(WorkersAiResponseUtil.extractUsage({ usage: {} })).toBeUndefined();
      expect(WorkersAiResponseUtil.extractUsage({ usage: { prompt_tokens: 'x' } })).toBeUndefined();
    });
  });

  describe('extractJsonObjectText', () => {
    it('extracts fenced json block', () => {
      const text = WorkersAiResponseUtil.extractJsonObjectText('prefix ```json\n{"a":1}\n``` suffix');
      expect(text).toBe('{"a":1}');
    });

    it('extracts fenced block without language tag', () => {
      const text = WorkersAiResponseUtil.extractJsonObjectText('```\n{"b":2}\n```');
      expect(text).toBe('{"b":2}');
    });

    it('extracts bare object from surrounding prose', () => {
      const text = WorkersAiResponseUtil.extractJsonObjectText('Here is it: {"x": "a}b", "y": {"z": 1}} done');
      expect(text).toBe('{"x": "a}b", "y": {"z": 1}}');
    });

    it('handles escaped quotes inside strings', () => {
      const text = WorkersAiResponseUtil.extractJsonObjectText('{"q": "say \\"hi\\""}');
      expect(text).toBe('{"q": "say \\"hi\\""}');
    });

    it('returns undefined when no object exists or braces never close', () => {
      expect(WorkersAiResponseUtil.extractJsonObjectText('no braces here')).toBeUndefined();
      expect(WorkersAiResponseUtil.extractJsonObjectText('{"unclosed": true')).toBeUndefined();
    });
  });

  describe('isRecord / getOptionalNumber', () => {
    it('classifies records', () => {
      expect(WorkersAiResponseUtil.isRecord({})).toBe(true);
      expect(WorkersAiResponseUtil.isRecord([])).toBe(false);
      expect(WorkersAiResponseUtil.isRecord(null)).toBe(false);
      expect(WorkersAiResponseUtil.isRecord('s')).toBe(false);
    });

    it('returns finite numbers only', () => {
      expect(WorkersAiResponseUtil.getOptionalNumber(3)).toBe(3);
      expect(WorkersAiResponseUtil.getOptionalNumber(Number.NaN)).toBeUndefined();
      expect(WorkersAiResponseUtil.getOptionalNumber(Number.POSITIVE_INFINITY)).toBeUndefined();
      expect(WorkersAiResponseUtil.getOptionalNumber('3')).toBeUndefined();
      expect(WorkersAiResponseUtil.getOptionalNumber(undefined)).toBeUndefined();
    });
  });
});
