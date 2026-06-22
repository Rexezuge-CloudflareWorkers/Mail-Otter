import { BadRequestError } from '@mail-otter/backend-errors';
import type { EmailProcessingRule, EmailRuleAction, EmailRuleCondition } from '@mail-otter/shared/model';
import { EmailRuleActionSchema, EmailRuleConditionSchema } from '@mail-otter/shared/schema';
import { WorkersAiResponseUtil } from './WorkersAiResponseUtil';
import type { AiTextGenerationUsage } from './WorkersAiResponseUtil';

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

interface EmailRuleSuggestionResult {
  rule: Omit<EmailProcessingRule, 'ruleId'>;
  usage: AiTextGenerationUsage | undefined;
}

class EmailRuleSuggestionUtil {
  public static async suggest(
    ai: Ai,
    model: string,
    description: string,
  ): Promise<Omit<EmailProcessingRule, 'ruleId'>> {
    const { rule } = await EmailRuleSuggestionUtil.suggestWithUsage(ai, model, description);
    return rule;
  }

  public static async suggestWithUsage(
    ai: Ai,
    model: string,
    description: string,
  ): Promise<EmailRuleSuggestionResult> {
    const request: Record<string, unknown> = {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: description },
      ],
      max_tokens: 512,
      temperature: 0.2,
    };

    if (WorkersAiResponseUtil.supportsJsonMode(model)) {
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
    const usage: AiTextGenerationUsage | undefined = WorkersAiResponseUtil.extractUsage(result);

    const text = WorkersAiResponseUtil.extractResponseText(result);
    if (!text) {
      throw new BadRequestError('Could not generate a rule from that description. Try rephrasing.');
    }

    const jsonText = WorkersAiResponseUtil.extractJsonObjectText(text);
    if (!jsonText) {
      throw new BadRequestError('Could not generate a rule from that description. Try rephrasing.');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new BadRequestError('Could not generate a rule from that description. Try rephrasing.');
    }

    const validated = EmailRuleSuggestionUtil.validateRule(parsed);
    if (!validated) {
      throw new BadRequestError('Could not generate a valid rule from that description. Try rephrasing.');
    }

    return { rule: validated, usage };
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
}

export { EmailRuleSuggestionUtil };
export type { EmailRuleSuggestionResult };
