type OutboundIntegrationType = 'slack' | 'discord' | 'webhook';

type IntegrationDeliveryStatus = 'success' | 'failure';

interface OutboundIntegration {
  integrationId: string;
  applicationId: string;
  integrationType: OutboundIntegrationType;
  name: string;
  maskedWebhookUrl: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  lastDeliveryAt: number | null;
  lastDeliveryStatus: IntegrationDeliveryStatus | null;
  consecutiveFailures: number;
}

interface OutboundIntegrationInternal {
  integration_id: string;
  application_id: string;
  integration_type: string;
  name: string;
  encrypted_webhook_url: string;
  webhook_url_iv: string;
  webhook_url_prefix: string;
  enabled: number;
  created_at: number;
  updated_at: number;
  last_delivery_at: number | null;
  last_delivery_status: string | null;
  consecutive_failures: number;
}

interface IntegrationDeliveryLog {
  logId: string;
  integrationId: string;
  applicationId: string;
  status: IntegrationDeliveryStatus;
  httpStatus: number | null;
  errorMessage: string | null;
  emailSubject: string | null;
  createdAt: number;
}

interface IntegrationDeliveryLogInternal {
  log_id: string;
  integration_id: string;
  application_id: string;
  status: string;
  http_status: number | null;
  error_message: string | null;
  email_subject: string | null;
  created_at: number;
}

export type {
  OutboundIntegration,
  OutboundIntegrationInternal,
  OutboundIntegrationType,
  IntegrationDeliveryStatus,
  IntegrationDeliveryLog,
  IntegrationDeliveryLogInternal,
};
