import {
  EMAIL_ACTION_STATUS_EXPIRED,
  EMAIL_ACTION_STATUS_FAILED,
  EMAIL_ACTION_STATUS_SUCCEEDED,
  EMAIL_ACTION_TRIGGER_AUTO_EXECUTE,
  EMAIL_ACTION_TRIGGER_EMAIL_CALLBACK,
  EMAIL_ACTION_TRIGGER_WEB_UI,
  EMAIL_ACTION_TYPE_APPOINTMENT_CONFIRM,
  EMAIL_ACTION_TYPE_CALENDAR_ADD_EVENT,
  EMAIL_ACTION_TYPE_DELIVERY_TRACK_PACKAGE,
  EMAIL_ACTION_TYPE_EMAIL_DRAFT_REPLY,
  EMAIL_ACTION_TYPE_EXTERNAL_OPEN_LINK,
  EMAIL_ACTION_TYPE_FINANCE_PAY_BILL,
  EMAIL_ACTION_TYPE_MANUAL_TODO,
  EMAIL_ACTION_TYPE_TRAVEL_TRACK_FLIGHT,
} from '@mail-otter/shared/constants';
import { ConnectedApplicationDAO } from '@mail-otter/backend-data/dao';
import { BadRequestError } from '@mail-otter/backend-errors';
import { CryptoUtil, TimestampUtil } from '@mail-otter/shared/utils';
import type {
  AppointmentConfirmActionPayload,
  CalendarAddEventActionPayload,
  ConnectedApplication,
  DeliveryTrackPackageActionPayload,
  EmailAction,
  EmailActionResult,
  EmailDraftReplyActionPayload,
  ExternalOpenLinkActionPayload,
  FinancePayBillActionPayload,
  TravelTrackFlightActionPayload,
} from '@mail-otter/shared/model';
import type { CreatedEmailAction } from './ActionCreationService';
import { EmailProviderRegistry } from '../provider/EmailProviderRegistry';
import { OAuth2AccessTokenService } from '../oauth2/OAuth2AccessTokenService';
import { createActionDAO, hashToken } from './ActionServiceUtils';
import type { ActionCreationEnv } from './ActionCreationService';
import { renderConfirmationPage, renderMessagePage, renderResultPage } from './ActionRenderService';
import * as PackageTrackingService from './PackageTrackingService';
import * as FlightTrackingService from './FlightTrackingService';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';

interface ActionHtmlResponse {
  statusCode: number;
  html: string;
}

interface ActionExecutionEnv extends ActionCreationEnv {
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
}

type ActionCallbackEnv = ActionExecutionEnv;
type UserActionEnv = ActionExecutionEnv;

async function getActionForToken(actionId: string, token: string, env: ActionCallbackEnv): Promise<EmailAction | undefined> {
  const tokenHash: string = await hashToken(actionId, token, await env.ACTION_SIGNING_SECRET.get());
  const dao = await createActionDAO(env);
  return dao.getByTokenHash(actionId, tokenHash);
}

async function hashUserAgent(request: Request | null, env: ActionExecutionEnv): Promise<string | null> {
  if (!request) return null;
  const userAgent: string = request.headers.get('User-Agent')?.trim() || '';
  if (!userAgent) return null;
  return CryptoUtil.hmacSha256Hex(`email-action-user-agent\n${userAgent}`, await env.ACTION_SIGNING_SECRET.get());
}

async function executeCalendarAction(action: EmailAction, accessToken: string): Promise<EmailActionResult> {
  const payload = action.payload as CalendarAddEventActionPayload;
  return EmailProviderRegistry.get(action.providerId).createCalendarEvent(accessToken, payload);
}

async function executeDraftReplyAction(
  action: EmailAction,
  accessToken: string,
  application: ConnectedApplication,
): Promise<EmailActionResult> {
  const payload = action.payload as EmailDraftReplyActionPayload;
  const fromEmail = application.providerEmail || application.userEmail;
  return EmailProviderRegistry.get(action.providerId).createDraftReply(accessToken, action.providerMessageId, fromEmail, payload);
}

async function executeProviderOperation(action: EmailAction, env: ActionExecutionEnv): Promise<EmailActionResult> {
  if (action.actionType === EMAIL_ACTION_TYPE_EXTERNAL_OPEN_LINK) {
    const payload = action.payload as ExternalOpenLinkActionPayload;
    return { summary: 'External link reviewed.', externalUrl: payload.url, providerUrl: payload.url };
  }
  if (action.actionType === EMAIL_ACTION_TYPE_MANUAL_TODO) {
    return { summary: 'Manual action acknowledged.' };
  }
  if (action.actionType === EMAIL_ACTION_TYPE_DELIVERY_TRACK_PACKAGE) {
    const payload = action.payload as DeliveryTrackPackageActionPayload;
    const trackingApiKey = ConfigurationManager.digest.getPackageTrackingApiKey(env);
    if (trackingApiKey) {
      const status = await PackageTrackingService.fetchStatus(payload.trackingNumber, payload.carrier, trackingApiKey);
      if (status) return { summary: status.summary, externalUrl: payload.trackingUrl ?? undefined };
    }
    if (payload.trackingUrl) return { summary: 'Package tracking link opened.', externalUrl: payload.trackingUrl };
    const via = payload.carrier ? ` via ${payload.carrier}` : '';
    return { summary: `Package tracking noted: ${payload.trackingNumber}${via}.` };
  }
  if (action.actionType === EMAIL_ACTION_TYPE_TRAVEL_TRACK_FLIGHT) {
    const payload = action.payload as TravelTrackFlightActionPayload;
    const flightTrackingApiKey = ConfigurationManager.digest.getFlightTrackingApiKey(env);
    if (flightTrackingApiKey) {
      const syncStatus = await FlightTrackingService.fetchFlightStatus(payload.flightNumber, flightTrackingApiKey);
      if (syncStatus) {
        const actionDAO = await createActionDAO(env);
        await actionDAO.updateSyncStatus(action.actionId, JSON.stringify(syncStatus));
        return {
          summary: FlightTrackingService.formatFlightSummary(payload.flightNumber, syncStatus),
          externalUrl: payload.trackingUrl ?? undefined,
        };
      }
    }
    if (payload.trackingUrl) return { summary: 'Flight tracking link opened.', externalUrl: payload.trackingUrl };
    return { summary: `Flight ${payload.flightNumber} details noted.` };
  }
  if (action.actionType === EMAIL_ACTION_TYPE_FINANCE_PAY_BILL) {
    const payload = action.payload as FinancePayBillActionPayload;
    if (payload.paymentUrl) return { summary: 'Payment link opened.', externalUrl: payload.paymentUrl };
    return { summary: 'Bill payment reminder noted.' };
  }
  if (action.actionType === EMAIL_ACTION_TYPE_APPOINTMENT_CONFIRM) {
    const payload = action.payload as AppointmentConfirmActionPayload;
    const when = payload.appointmentTime ? ` on ${payload.appointmentTime}` : '';
    return { summary: `Appointment${when} details noted.` };
  }

  const applicationDAO = new ConnectedApplicationDAO(env.DB, await env.AES_ENCRYPTION_KEY_SECRET.get());
  const application: ConnectedApplication | undefined = await applicationDAO.getById(action.applicationId);
  if (!application) throw new BadRequestError('Connected application was not found.');
  const accessToken: string = await new OAuth2AccessTokenService(env).getAccessToken(application.applicationId, { forceRefresh: true });

  if (action.actionType === EMAIL_ACTION_TYPE_CALENDAR_ADD_EVENT) {
    return executeCalendarAction(action, accessToken);
  }
  if (action.actionType === EMAIL_ACTION_TYPE_EMAIL_DRAFT_REPLY) {
    return executeDraftReplyAction(action, accessToken, application);
  }
  throw new BadRequestError('Unsupported email action type.');
}

async function executeAction(
  action: EmailAction,
  triggeredBy: typeof EMAIL_ACTION_TRIGGER_EMAIL_CALLBACK | typeof EMAIL_ACTION_TRIGGER_WEB_UI | typeof EMAIL_ACTION_TRIGGER_AUTO_EXECUTE,
  request: Request | null,
  env: ActionExecutionEnv,
): Promise<EmailAction> {
  const actionDAO = await createActionDAO(env);
  const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
  const userAgentHash: string | null = await hashUserAgent(request, env);

  if ([EMAIL_ACTION_STATUS_SUCCEEDED, EMAIL_ACTION_STATUS_FAILED, EMAIL_ACTION_STATUS_EXPIRED].includes(action.status)) {
    return action;
  }
  if (action.expiresAt <= now) {
    await actionDAO.markExpired(action.actionId);
    await actionDAO.recordExecution({
      actionId: action.actionId,
      triggeredBy,
      status: EMAIL_ACTION_STATUS_EXPIRED,
      requestUserAgentHash: userAgentHash,
    });
    return (await actionDAO.getForUser(action.actionId, action.userEmail)) ?? { ...action, status: EMAIL_ACTION_STATUS_EXPIRED };
  }

  const claimed: boolean = await actionDAO.claimForExecution(action.actionId);
  if (!claimed) return action;

  try {
    const result: EmailActionResult = await executeProviderOperation(action, env);
    await actionDAO.markSucceeded(action.actionId, result);
    await actionDAO.recordExecution({
      actionId: action.actionId,
      triggeredBy,
      status: EMAIL_ACTION_STATUS_SUCCEEDED,
      providerOperationId: result.providerOperationId,
      requestUserAgentHash: userAgentHash,
    });
  } catch (error: unknown) {
    const message: string = error instanceof Error ? error.message : String(error);
    await actionDAO.markFailed(action.actionId, message);
    await actionDAO.recordExecution({
      actionId: action.actionId,
      triggeredBy,
      status: EMAIL_ACTION_STATUS_FAILED,
      requestUserAgentHash: userAgentHash,
      errorMessage: message,
    });
  }

  const refreshed: EmailAction | undefined = await actionDAO.getForUser(action.actionId, action.userEmail);
  return refreshed ?? action;
}

async function getConfirmationResponse(actionId: string, token: string, env: ActionCallbackEnv): Promise<ActionHtmlResponse> {
  const action: EmailAction | undefined = await getActionForToken(actionId, token, env);
  if (!action) {
    return { statusCode: 404, html: renderMessagePage('Action not found', 'This action link is invalid or has expired.') };
  }
  return { statusCode: 200, html: renderConfirmationPage(action, token) };
}

async function executeActionWithToken(actionId: string, token: string, request: Request, env: ActionCallbackEnv): Promise<ActionHtmlResponse> {
  const action: EmailAction | undefined = await getActionForToken(actionId, token, env);
  if (!action) {
    return { statusCode: 404, html: renderMessagePage('Action not found', 'This action link is invalid or has expired.') };
  }
  const result: EmailAction = await executeAction(action, EMAIL_ACTION_TRIGGER_EMAIL_CALLBACK, request, env);
  return { statusCode: 200, html: renderResultPage(result) };
}

async function executeActionForUser(actionId: string, userEmail: string, request: Request, env: UserActionEnv): Promise<EmailAction> {
  const actionDAO = await createActionDAO(env);
  const action: EmailAction | undefined = await actionDAO.getForUser(actionId, userEmail);
  if (!action) throw new BadRequestError('Email action was not found.');
  return executeAction(action, EMAIL_ACTION_TRIGGER_WEB_UI, request, env);
}

async function autoExecuteCreatedActions(
  autoExecuteTypes: string[],
  createdActions: CreatedEmailAction[],
  env: ActionExecutionEnv,
): Promise<void> {
  const typeSet = new Set(autoExecuteTypes);
  const eligible = createdActions.filter((a) => typeSet.has(a.action.actionType));
  if (eligible.length === 0) return;
  await Promise.all(
    eligible.map(async (created) => {
      try {
        await executeAction(created.action, EMAIL_ACTION_TRIGGER_AUTO_EXECUTE, null, env);
      } catch (error: unknown) {
        console.warn(`Auto-execute failed for action ${created.action.actionId}:`, error);
      }
    }),
  );
}

export type { ActionHtmlResponse, ActionCallbackEnv, ActionExecutionEnv, UserActionEnv };
export { getConfirmationResponse, executeActionWithToken, executeActionForUser, executeAction, autoExecuteCreatedActions };
