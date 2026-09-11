# Mail-Otter — Email Processing Rules

Scope: `packages/backend-services/src/email/EmailRulesUtil.ts`, `EmailRuleSuggestionUtil.ts`. Parent index: `../../../AGENTS.md`.

Up to 20 rules per application (`MAX_EMAIL_PROCESSING_RULES`, provider-config row). Each rule: condition (`operator: 'all'|'any'`, up to 5 matchers via `MAX_RULE_MATCHERS`) + one action.

- **Pre-processing** (first match wins): `skip`, `skip_actions`, `prepend_instruction` — evaluated before AI summarization.
- **Post-processing** (all matches): `apply_label`, `archive_message`, `mark_read`, `star_message` — evaluated after summarization.

Matcher fields: `from`, `subject`, `body`, `has_attachment`, `detected_action_type`, `always`. Ops: `contains`, `not_contains`, `matches_sender`, `is`, `includes`, `not_includes`, `match_all`. `always` + `match_all` = unconditional match. `detected_action_type` is post-processing-only (enforced in schema + UI).

`EmailRulesUtil` evaluates; `EmailRuleSuggestionUtil` generates AI-suggested rules. Routes: `GET|PUT /user/application/rules`, `POST /user/application/rules/suggest`. UI: `RulesSection` in `apps/web/src/components/mailboxes/` (`MAX_RULES=20`).
