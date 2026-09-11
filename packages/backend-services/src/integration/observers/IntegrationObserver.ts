import type { OutboundIntegrationType } from '@mail-otter/shared/model';

interface EmailSummaryNotification {
  applicationId: string;
  emailSubject: string;
  emailFrom: string;
  gist: string;
  keyDetails: string[];
  actions: Array<{
    type: string;
    title: string;
    description: string;
    riskLevel: string;
    callbackUrl: string;
  }>;
  processedAt: number;
}

interface DispatchResult {
  status: 'success' | 'failure';
  httpStatus: number | null;
  errorMessage: string | null;
}

// Observer contract for outbound integrations.
// Each integration type (slack/discord/webhook) has one observer; IntegrationService dispatches via the registry.
interface IntegrationObserver {
  readonly integrationType: OutboundIntegrationType;
  dispatch(webhookUrl: string, notification: EmailSummaryNotification, locale?: string | null): Promise<DispatchResult>;
}

async function postIntegrationJson(url: string, payload: unknown): Promise<DispatchResult> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return { status: 'failure', httpStatus: response.status, errorMessage: `HTTP ${response.status}` };
    }
    return { status: 'success', httpStatus: response.status, errorMessage: null };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { status: 'failure', httpStatus: null, errorMessage: msg };
  }
}

export type { DispatchResult, EmailSummaryNotification, IntegrationObserver };
export { postIntegrationJson };
