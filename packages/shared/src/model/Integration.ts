type OutboundIntegrationType = 'slack' | 'discord' | 'webhook';

interface OutboundIntegration {
  integrationId: string;
  applicationId: string;
  integrationType: OutboundIntegrationType;
  name: string;
  maskedWebhookUrl: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
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
}

export type { OutboundIntegration, OutboundIntegrationInternal, OutboundIntegrationType };
