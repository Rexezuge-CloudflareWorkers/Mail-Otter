# Mail-Otter — Outbound Integrations

Scope: `packages/backend-services/src/integration/**`. Parent index: `../../../AGENTS.md`.

Per-application webhook integrations receive JSON summary payloads on each processed email. Storage: `ApplicationIntegrationDAO` (D1), `IntegrationDeliveryLogDAO`. Logic: `IntegrationService` (`packages/backend-services/src/integration/`). Routes: `GET /user/application/integrations`, `POST|PUT|DELETE /user/application/integration`, `POST /user/application/integration/test`, `GET /user/application/integration/deliveries`. Retention: `INTEGRATION_DELIVERY_LOG_RETENTION_DAYS` (default 30), pruned by `IntegrationDeliveryLogPruningTask`.
