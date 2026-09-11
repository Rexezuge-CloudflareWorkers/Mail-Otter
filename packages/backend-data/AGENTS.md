# Mail-Otter — Backend Data (D1/DAO Layer)

Scope: `packages/backend-data/**`. Parent index: `../../AGENTS.md`.

All D1 access via DAOs: `ConnectedApplicationDAO` (incl. `content_language` provider-config row + `updateContentLanguageForUser`), `ApplicationContextDAO` (facade over `ContextAuditLogDAO` + `ContextDeletionRunDAO`), `UserDAO` (`preferred_language` + `updatePreferredLanguage`), `ProcessedMessageDAO`, `OAuth2AuthorizationSessionDAO`, `ProviderSubscriptionDAO`, `AiDailyUsageDAO`, `EmailActionDAO`, `OAuth2AccessTokenCacheDAO`, `OAuth2AccessTokenRefreshStatusDAO`, `ApplicationIntegrationDAO`, `BackgroundTaskRunDAO`, `IntegrationDeliveryLogDAO`, `SyncedCalendarEventDAO`, `ActivityDAO`; KV token cache; utils `D1SessionUtil`, `CursorUtil`, `D1ErrorClassifier`, `D1Utils`, `RepositoryHelper` (`pruneInBatches`, `computeUnixCutoffSeconds`, `computeDateCutoffIso`, `DEFAULT_PRUNE_BATCH_SIZE`); `CryptoService` (AES-GCM); `BaseDAO.withRetry`. Per-app settings without columns (time zone, content language, features, filters, rules) → provider-config key/value rows.

Key provider-config rows: `calendar_time_zone`, `content_language`, `attachment_vision_enabled`, `sender_domain_filters`, `google_drive_page_token`, `onedrive_delta_link`, `digest_enabled`, `digest_send_time`, `digest_sections`, `digest_last_sent_at`.
