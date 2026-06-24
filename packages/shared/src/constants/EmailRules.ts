const MAX_EMAIL_PROCESSING_RULES = 20;
const MAX_RULE_MATCHERS = 5;

const PRE_PROCESSING_ACTION_TYPES: ReadonlySet<string> = new Set(['skip', 'skip_actions', 'prepend_instruction']);
const POST_PROCESSING_ACTION_TYPES: ReadonlySet<string> = new Set(['apply_label', 'archive_message', 'mark_read', 'star_message']);

export { MAX_EMAIL_PROCESSING_RULES, MAX_RULE_MATCHERS, PRE_PROCESSING_ACTION_TYPES, POST_PROCESSING_ACTION_TYPES };
