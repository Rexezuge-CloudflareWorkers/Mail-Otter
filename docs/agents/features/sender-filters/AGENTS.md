# Mail-Otter — Sender Allowlist

Scope: `packages/backend-services/src/email/SenderFilterUtil.ts`. Parent index: `../../../AGENTS.md`.

Per-application `senderDomainFilters` with `includeRules: string[]` only (max 100). `SenderFilterUtil.shouldSkip`: empty includes = process all; non-empty includes = allowlist (only matching senders processed). There is no `excludeRules` field — legacy excludes were lazily migrated to `skip` processing rules (`ConnectedApplicationDAO`) and deleted. Stored as `sender_domain_filters` provider-config row.

To block a sender, create a processing rule: field `from`, op `matches_sender`, action `skip` (the UI `Sender Allowlist` section hints this).
