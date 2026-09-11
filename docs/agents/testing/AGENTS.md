# Mail-Otter — Testing

Scope: unit + integration tests. Parent index: `../../../AGENTS.md`.

Current thresholds (`vitest.config.mts`): **statements 62 / branches 52 / functions 70 / lines 63**. Exclusions: `**/*.test.ts`, `**/*.d.ts`, `**/index.ts`, `**/types.d.ts`, `**/model/**` (pure TS types). Integration tests in `test/integration/` use `@cloudflare/vitest-pool-workers` (no V8 coverage — no thresholds there, omitted intentionally).

**Covered** (test files exist): error classes (`BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `MethodNotAllowedError`, `InternalServerError`, `DatabaseError`, `EmailProcessingError`, `RetryableError`, `NonRetryableError`), shared utils, pruning tasks, OAuth2StateUtil, WebhookSecurityUtil, EmailContentUtil, SenderFilterUtil, UserDAO, OAuth2SessionDAO, ProviderSubscriptionDAO, ProcessedMessageDAO, ConnectedApplicationDAO, EmailActionDAO, ApplicationContextDAO, MiddlewareHandlers, IBaseRoute, EmailValidationUtil, WorkersAiErrorUtil, abstract workers, ConfigurationManager, OAuth2AccessTokenService, EmailProcessingUtil, EmailSummaryUtil, EmailContextUtil, EmailRulesUtil, EmailRuleSuggestionUtil, ProviderOrganizationService, SubscriptionRenewalUtil, AiUsageUtil, GmailProviderUtil, OutlookProviderUtil, OAuth2ProviderUtil, FlightTrackingService, PackageTrackingService, ActionService, ActionCreationService, ActionRenderService (+ localized), ActionMaintenanceService, ApplicationService, ApplicationResponseUtil, ContextService, FolderService, WatchService, GmailWebhookService, OutlookWebhookService, FastmailWebhookService, OAuth2AuthorizationService, Worker tests (MailOtterWorker, CronTasksWorker, OAuth2TokenRefreshWorker, EmailProcessingWorkflow, EmailEventsQueueWorker), schema validation, IMAP provider utils, AttachmentAnalysisUtil, ActionSchedulingService, GoogleDriveProviderUtil, OneDriveProviderUtil, GoogleDriveIngestionService, OneDriveIngestionService, ChatService, DigestConfigService, DigestEmailUtil, DigestService, ActionStatusSyncUtil, CalendarEventSyncUtil, IntegrationService, ProcessingService, BackgroundTaskRunDAO, IntegrationDeliveryLogDAO, SyncedCalendarEventDAO, ApplicationIntegrationDAO, AiClient, RepositoryHelper, TaskRegistry, ContextAuditLogDAO, ContextDeletionRunDAO, LocaleUtil, BackendStrings.

**Still uncovered** (0% or near-0%): `D1Utils` (partial), `IServiceError`, `VoidUtil`.

**Mock patterns**:
- DAO tests: `createMockDb()` returning `prepare().bind().run/first/all` chain with shared `vi.fn()` refs.
- Services with DAOs: `vi.mock('@mail-otter/backend-data/dao')`.
- Crypto: `vi.mock('@mail-otter/backend-data/crypto')`.
- Workers AI: mock `env.AI.run()`.
- External APIs: mock provider client imports at package level.
- Use `vi.hoisted()` for mocks referenced across `vi.mock` factories.
- `beforeEach` + `vi.clearAllMocks()` resets call counts.
