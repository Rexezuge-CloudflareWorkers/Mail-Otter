import { BadRequestError } from '@mail-otter/backend-errors';
import type { EmailProcessingRule, EmailRuleAction, EmailRuleCondition } from '@mail-otter/shared/model';
import { EmailRuleActionSchema, EmailRuleConditionSchema } from '@mail-otter/shared/schema';

const SUGGESTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'enabled', 'conditions', 'action'],
  properties: {
    name: { type: 'string' },
    enabled: { type: 'boolean' },
    conditions: {
      type: 'object',
      required: ['operator', 'matchers'],
      properties: {
        operator: { type: 'string', enum: ['all', 'any'] },
        matchers: {
          type: 'array',
          items: {
            type: 'object',
            required: ['field', 'op', 'value'],
            properties: {
              field: { type: 'string', enum: ['from', 'subject', 'body'] },
              op: { type: 'string', enum: ['contains', 'not_contains', 'matches_sender'] },
              value: { type: 'string' },
            },
          },
        },
      },
    },
    action: {
      type: 'object',
      required: ['type'],
      properties: {
        type: { type: 'string', enum: ['skip', 'skip_actions', 'prepend_instruction'] },
        instruction: { type: 'string' },
      },
    },
  },
} as const;

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
]);

const SYSTEM_PROMPT = `You are a rule configuration assistant for an email processing system.
Generate a single email processing rule as JSON based on the user's description.

Rule schema:
{
  "name": "concise rule name (1-100 chars)",
  "enabled": true,
  "conditions": {
    "operator": "all" | "any",
    "matchers": [
      { "field": "from" | "subject" | "body", "op": "contains" | "not_contains" | "matches_sender", "value": "string" }
    ]
  },
  "action": {
    "type": "skip" | "skip_actions" | "prepend_instruction",
    "instruction": "string (only required for prepend_instruction)"
  }
}

Rules:
- matches_sender is only valid on field "from". Use @domain.com to match all senders from a domain, or user@example.com to match a specific address.
- contains / not_contains do case-insensitive substring matching on any field.
- operator "all" means ALL matchers must match (AND logic); "any" means at least one must match (OR logic).
- skip: skip the email entirely, no AI summarization.
- skip_actions: summarize the email but do not create action proposals.
- prepend_instruction: add extra instructions to the AI summarization prompt.

Return only the JSON object with no explanation or markdown.`;

interface ValidatedSuggestedRule {
  name: string;
  enabled: boolean;
  conditions: EmailRuleCondition;
  action: EmailRuleAction;
}

class EmailRuleSuggestionUtil {
  public static async suggest(
    ai: Ai,
    model: string,
    description: string,
  ): Promise<Omit<EmailProcessingRule, 'ruleId'>> {
    const request: Record<string, unknown> = {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: description },
      ],
      max_tokens: 512,
      temperature: 0.2,
    };

    if (JSON_MODE_SUPPORTED_MODELS.has(model)) {
      request['response_format'] = {
        type: 'json_schema',
        json_schema: {
          name: 'email_rule',
          schema: SUGGESTION_JSON_SCHEMA,
          strict: true,
        },
      };
    }

    const result = await (ai as unknown as { run: (...args: unknown[]) => Promise<unknown> }).run(model, request);
    const text = EmailRuleSuggestionUtil.extractText(result);
    if (!text) {
      throw new BadRequestError('Could not generate a rule from that description. Try rephrasing.');
    }

    const parsed = EmailRuleSuggestionUtil.parseJson(text);
    if (!parsed) {
      throw new BadRequestError('Could not generate a rule from that description. Try rephrasing.');
    }

    const validated = EmailRuleSuggestionUtil.validateRule(parsed);
    if (!validated) {
      throw new BadRequestError('Could not generate a valid rule from that description. Try rephrasing.');
    }

    return validated;
  }

  private static validateRule(parsed: unknown): ValidatedSuggestedRule | undefined {
    if (!parsed || typeof parsed !== 'object') return undefined;
    const p = parsed as Record<string, unknown>;

    const name = p['name'];
    const enabled = p['enabled'];
    if (typeof name !== 'string' || name.trim().length < 1 || name.length > 100) return undefined;
    if (typeof enabled !== 'boolean') return undefined;

    // Coerce matches_sender on non-from fields before schema validation, since
    // the shared schema enforces the constraint as a Zod refinement.
    const conditions = EmailRuleSuggestionUtil.sanitizeConditions(p['conditions']);
    const condResult = EmailRuleConditionSchema.safeParse(conditions);
    if (!condResult.success) return undefined;

    const actionResult = EmailRuleActionSchema.safeParse(p['action']);
    if (!actionResult.success) return undefined;

    return { name: name.trim(), enabled, conditions: condResult.data, action: actionResult.data };
  }

  private static sanitizeConditions(conditions: unknown): unknown {
    if (!conditions || typeof conditions !== 'object') return conditions;
    const c = conditions as Record<string, unknown>;
    if (!Array.isArray(c['matchers'])) return conditions;
    return {
      ...c,
      matchers: c['matchers'].map((m: unknown) => {
        if (!m || typeof m !== 'object') return m;
        const matcher = m as Record<string, unknown>;
        if (matcher['op'] === 'matches_sender' && matcher['field'] !== 'from') {
          return { ...matcher, op: 'contains' };
        }
        return matcher;
      }),
    };
  }

  private static extractText(result: unknown): string | undefined {
    if (typeof result === 'string') return result;
    if (!result || typeof result !== 'object') return undefined;
    const r = result as Record<string, unknown>;
    if (typeof r['response'] === 'string') return r['response'];
    if (typeof r['output_text'] === 'string') return r['output_text'];
    if (Array.isArray(r['choices'])) {
      const first = r['choices'][0];
      if (first && typeof first === 'object') {
        const msg = (first as Record<string, unknown>)['message'];
        if (msg && typeof msg === 'object' && typeof (msg as Record<string, unknown>)['content'] === 'string') {
          return (msg as Record<string, unknown>)['content'] as string;
        }
      }
    }
    return undefined;
  }

  private static parseJson(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      // try to extract a JSON object embedded in prose
    }
    const start = text.indexOf('{');
    if (start === -1) return undefined;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i]!;
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(text.slice(start, i + 1)); } catch { return undefined; }
        }
      }
    }
    return undefined;
  }
}

export { EmailRuleSuggestionUtil };
