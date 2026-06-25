import {
  EMAIL_ACTION_RISK_LOW,
  EMAIL_ACTION_RISK_MEDIUM,
  EMAIL_ACTION_TYPE_APPOINTMENT_CONFIRM,
  EMAIL_ACTION_TYPE_CALENDAR_ADD_EVENT,
  EMAIL_ACTION_TYPE_DELIVERY_TRACK_PACKAGE,
  EMAIL_ACTION_TYPE_EMAIL_DRAFT_REPLY,
  EMAIL_ACTION_TYPE_EXTERNAL_OPEN_LINK,
  EMAIL_ACTION_TYPE_FINANCE_PAY_BILL,
  EMAIL_ACTION_TYPE_MANUAL_TODO,
  EMAIL_ACTION_TYPE_TRAVEL_TRACK_FLIGHT,
} from '@mail-otter/shared/constants';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import type {
  ConnectedApplication,
  EmailAction,
  EmailActionPayload,
  EmailActionProposal,
  ProcessedMessage,
} from '@mail-otter/shared/model';
import type { EmailActionRiskLevel, EmailActionType } from '@mail-otter/shared/constants';
import { CryptoUtil, TimestampUtil, UUIDUtil } from '@mail-otter/shared/utils';
import { createActionDAO, hashToken } from './ActionServiceUtils';
import type { ActionDAOEnv } from './ActionServiceUtils';



const MAX_ACTIONS_PER_SUMMARY = 4;
const MAX_TEXT_LENGTH = 1000;

interface CreatedEmailAction {
  action: EmailAction;
  token: string;
  confirmationUrl: string;
}

interface CreateActionsForSummaryInput {
  application: Pick<ConnectedApplication, 'applicationId' | 'userEmail' | 'providerId' | 'timeZone'>;
  processedMessage: ProcessedMessage;
  subject: string;
  from: string;
  body: string;
  proposals: EmailActionProposal[];
  callbackBaseUrl?: string;
}

interface NormalizedActionProposal {
  actionType: EmailActionType;
  riskLevel: EmailActionRiskLevel;
  payload: EmailActionPayload;
  expiresAt: number;
}

interface ActionCreationEnv extends ActionDAOEnv {
  ACTION_SIGNING_SECRET: SecretsStoreSecret;
  ACTION_CALLBACK_BASE_URL?: string;
  ACTION_DEFAULT_EXPIRY_HOURS?: string;
}

function resolveCallbackBaseUrl(callbackBaseUrl: string | undefined, env: ActionCreationEnv): string {
  let url = callbackBaseUrl?.trim() || ConfigurationManager.getActionCallbackBaseUrl(env);
  while (url.endsWith('/')) url = url.slice(0, -1);
  return url;
}

function resolveExpiresAt(now: number, env: ActionCreationEnv): number {
  return TimestampUtil.addHours(now, ConfigurationManager.getActionDefaultExpiryHours(env));
}

function extractUrls(body: string): Set<string> {
  const urls = new Set<string>();
  for (const match of body.matchAll(/https?:\/\/[^\s<>"]+/gi)) {
    let raw = match[0];
    while (raw.length > 0 && '),.;!?'.includes(raw.at(-1)!)) raw = raw.slice(0, -1);
    urls.add(raw);
  }
  return urls;
}

function findAllowedUrl(url: string, allowedUrls: Set<string>): string | undefined {
  let candidate = url.trim();
  while (candidate.length > 0 && '),.;!?'.includes(candidate.at(-1)!)) candidate = candidate.slice(0, -1);
  if (!candidate.startsWith('http://') && !candidate.startsWith('https://')) return undefined;
  if (allowedUrls.has(candidate)) return candidate;
  for (const allowed of allowedUrls) {
    let a = allowed;
    let c = candidate;
    while (a.endsWith('/')) a = a.slice(0, -1);
    while (c.endsWith('/')) c = c.slice(0, -1);
    if (a === c) return allowed;
  }
  return undefined;
}

function getString(parameters: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value: unknown = parameters[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function isValidIsoDateTime(value: string): boolean {
  return Boolean(value && Number.isFinite(new Date(value).getTime()));
}

function getFallbackActionTitle(type: string): string {
  if (type === EMAIL_ACTION_TYPE_CALENDAR_ADD_EVENT) return 'Add event to calendar';
  if (type === EMAIL_ACTION_TYPE_EMAIL_DRAFT_REPLY) return 'Draft a reply';
  if (type === EMAIL_ACTION_TYPE_EXTERNAL_OPEN_LINK) return 'Open related link';
  if (type === EMAIL_ACTION_TYPE_DELIVERY_TRACK_PACKAGE) return 'Track package';
  if (type === EMAIL_ACTION_TYPE_TRAVEL_TRACK_FLIGHT) return 'Track flight';
  if (type === EMAIL_ACTION_TYPE_FINANCE_PAY_BILL) return 'Pay bill';
  if (type === EMAIL_ACTION_TYPE_APPOINTMENT_CONFIRM) return 'Appointment confirmation';
  return 'Review action item';
}

function cleanText(value: string): string {
  return value.replaceAll(/\s+/g, ' ').trim().slice(0, MAX_TEXT_LENGTH);
}

function cleanOptionalText(value: string | undefined): string | undefined {
  const cleaned: string = cleanText(value || '');
  return cleaned || undefined;
}

type BasePayload = { title: string; description: string; sourceSubject?: string; sourceFrom?: string };

function toManualTodo(base: BasePayload, instructions: string, expiresAt: number): NormalizedActionProposal {
  return {
    actionType: EMAIL_ACTION_TYPE_MANUAL_TODO,
    riskLevel: EMAIL_ACTION_RISK_LOW,
    expiresAt,
    payload: { ...base, type: EMAIL_ACTION_TYPE_MANUAL_TODO, instructions },
  };
}

function normalizeProposal(
  proposal: EmailActionProposal,
  input: CreateActionsForSummaryInput,
  allowedUrls: Set<string>,
  now: number,
  env: ActionCreationEnv,
): NormalizedActionProposal | undefined {
  const title: string = cleanText(proposal.title || getFallbackActionTitle(proposal.type));
  const description: string = cleanText(proposal.description || title);
  const parameters: Record<string, unknown> = proposal.parameters || {};
  const expiresAt: number = resolveExpiresAt(now, env);
  const base: BasePayload = { title, description, sourceSubject: input.subject, sourceFrom: input.from };

  if (proposal.type === EMAIL_ACTION_TYPE_CALENDAR_ADD_EVENT) {
    const eventTitle = cleanText(getString(parameters, 'eventTitle', 'title', 'summary') || title);
    const startTime = getString(parameters, 'startTime', 'startDateTime', 'startsAt') || '';
    const endTime = getString(parameters, 'endTime', 'endDateTime', 'endsAt') || '';
    const timeZone = getString(parameters, 'timeZone', 'timezone') || input.application.timeZone || 'UTC';
    if (isValidIsoDateTime(startTime) && isValidIsoDateTime(endTime)) {
      return {
        actionType: EMAIL_ACTION_TYPE_CALENDAR_ADD_EVENT,
        riskLevel: EMAIL_ACTION_RISK_MEDIUM,
        expiresAt,
        payload: {
          ...base,
          type: EMAIL_ACTION_TYPE_CALENDAR_ADD_EVENT,
          eventTitle,
          startTime,
          endTime,
          timeZone,
          location: cleanOptionalText(getString(parameters, 'location')),
          notes: cleanOptionalText(getString(parameters, 'notes', 'description')),
        },
      };
    }
    return toManualTodo(base, `Review calendar details manually: ${description}`, expiresAt);
  }

  if (proposal.type === EMAIL_ACTION_TYPE_EMAIL_DRAFT_REPLY) {
    const draftBody = cleanText(getString(parameters, 'draftBody', 'body', 'replyText') || description);
    return {
      actionType: EMAIL_ACTION_TYPE_EMAIL_DRAFT_REPLY,
      riskLevel: EMAIL_ACTION_RISK_MEDIUM,
      expiresAt,
      payload: {
        ...base,
        type: EMAIL_ACTION_TYPE_EMAIL_DRAFT_REPLY,
        draftSubject: cleanOptionalText(getString(parameters, 'draftSubject', 'subject')),
        draftBody,
      },
    };
  }

  if (proposal.type === EMAIL_ACTION_TYPE_EXTERNAL_OPEN_LINK) {
    const url = getString(parameters, 'url', 'href', 'link') || '';
    const normalizedUrl = findAllowedUrl(url, allowedUrls);
    if (normalizedUrl) {
      return {
        actionType: EMAIL_ACTION_TYPE_EXTERNAL_OPEN_LINK,
        riskLevel: EMAIL_ACTION_RISK_LOW,
        expiresAt,
        payload: { ...base, type: EMAIL_ACTION_TYPE_EXTERNAL_OPEN_LINK, url: normalizedUrl },
      };
    }
    return toManualTodo(base, `Open the related link manually: ${description}`, expiresAt);
  }

  if (proposal.type === EMAIL_ACTION_TYPE_MANUAL_TODO) {
    return toManualTodo(base, cleanText(getString(parameters, 'instructions') || description), expiresAt);
  }

  if (proposal.type === EMAIL_ACTION_TYPE_DELIVERY_TRACK_PACKAGE) {
    const trackingNumber = cleanText(getString(parameters, 'trackingNumber', 'tracking_number', 'parcelNumber') || '');
    if (!trackingNumber) return toManualTodo(base, `Review delivery details manually: ${description}`, expiresAt);
    const rawTrackingUrl = getString(parameters, 'trackingUrl', 'url', 'href');
    const trackingUrl = rawTrackingUrl ? findAllowedUrl(rawTrackingUrl, allowedUrls) : undefined;
    return {
      actionType: EMAIL_ACTION_TYPE_DELIVERY_TRACK_PACKAGE,
      riskLevel: EMAIL_ACTION_RISK_LOW,
      expiresAt,
      payload: {
        ...base,
        type: EMAIL_ACTION_TYPE_DELIVERY_TRACK_PACKAGE,
        trackingNumber,
        carrier: cleanOptionalText(getString(parameters, 'carrier', 'shippingCarrier')),
        trackingUrl: trackingUrl ?? undefined,
      },
    };
  }

  if (proposal.type === EMAIL_ACTION_TYPE_TRAVEL_TRACK_FLIGHT) {
    const flightNumber = cleanText(getString(parameters, 'flightNumber', 'flight', 'flightCode') || '');
    if (!flightNumber) return toManualTodo(base, `Review flight details manually: ${description}`, expiresAt);
    const rawTrackingUrl = getString(parameters, 'trackingUrl', 'url', 'href');
    const trackingUrl = rawTrackingUrl ? findAllowedUrl(rawTrackingUrl, allowedUrls) : undefined;
    return {
      actionType: EMAIL_ACTION_TYPE_TRAVEL_TRACK_FLIGHT,
      riskLevel: EMAIL_ACTION_RISK_LOW,
      expiresAt,
      payload: {
        ...base,
        type: EMAIL_ACTION_TYPE_TRAVEL_TRACK_FLIGHT,
        flightNumber,
        airline: cleanOptionalText(getString(parameters, 'airline')),
        departureAirport: cleanOptionalText(getString(parameters, 'departureAirport', 'origin')),
        arrivalAirport: cleanOptionalText(getString(parameters, 'arrivalAirport', 'destination')),
        departureTime: cleanOptionalText(getString(parameters, 'departureTime', 'departure')),
        trackingUrl: trackingUrl ?? undefined,
      },
    };
  }

  if (proposal.type === EMAIL_ACTION_TYPE_FINANCE_PAY_BILL) {
    const payee = cleanOptionalText(getString(parameters, 'payee', 'biller', 'merchant'));
    const amount = cleanOptionalText(getString(parameters, 'amount', 'total'));
    const currency = cleanOptionalText(getString(parameters, 'currency'));
    const dueDate = cleanOptionalText(getString(parameters, 'dueDate', 'due_date', 'paymentDue'));
    const invoiceNumber = cleanOptionalText(getString(parameters, 'invoiceNumber', 'invoice_number', 'invoiceId'));
    if (!payee && !amount && !dueDate && !invoiceNumber) {
      return toManualTodo(base, `Review bill details manually: ${description}`, expiresAt);
    }
    const rawPaymentUrl = getString(parameters, 'paymentUrl', 'url', 'href');
    const paymentUrl = rawPaymentUrl ? findAllowedUrl(rawPaymentUrl, allowedUrls) : undefined;
    return {
      actionType: EMAIL_ACTION_TYPE_FINANCE_PAY_BILL,
      riskLevel: EMAIL_ACTION_RISK_MEDIUM,
      expiresAt,
      payload: {
        ...base,
        type: EMAIL_ACTION_TYPE_FINANCE_PAY_BILL,
        payee,
        amount,
        currency,
        dueDate,
        invoiceNumber,
        paymentUrl: paymentUrl ?? undefined,
      },
    };
  }

  if (proposal.type === EMAIL_ACTION_TYPE_APPOINTMENT_CONFIRM) {
    return {
      actionType: EMAIL_ACTION_TYPE_APPOINTMENT_CONFIRM,
      riskLevel: EMAIL_ACTION_RISK_LOW,
      expiresAt,
      payload: {
        ...base,
        type: EMAIL_ACTION_TYPE_APPOINTMENT_CONFIRM,
        serviceType: cleanOptionalText(getString(parameters, 'serviceType', 'service', 'type')),
        providerName: cleanOptionalText(getString(parameters, 'providerName', 'provider', 'doctor', 'vendor')),
        appointmentTime: cleanOptionalText(getString(parameters, 'appointmentTime', 'dateTime', 'scheduledAt')),
        location: cleanOptionalText(getString(parameters, 'location', 'address', 'venue')),
        confirmationNumber: cleanOptionalText(getString(parameters, 'confirmationNumber', 'confirmationCode', 'referenceNumber')),
        notes: cleanOptionalText(getString(parameters, 'notes', 'instructions')),
      },
    };
  }

  return undefined;
}

async function createActionsForSummary(input: CreateActionsForSummaryInput, env: ActionCreationEnv): Promise<CreatedEmailAction[]> {
  const baseUrl: string = resolveCallbackBaseUrl(input.callbackBaseUrl, env);
  if (!baseUrl || input.proposals.length === 0) return [];

  const actionDAO = await createActionDAO(env);
  await actionDAO.deleteByProcessedMessageId(input.processedMessage.processedMessageId);
  const signingSecret: string = await env.ACTION_SIGNING_SECRET.get();
  const allowedUrls: Set<string> = extractUrls(input.body);
  const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
  const created: CreatedEmailAction[] = [];

  for (const proposal of input.proposals.slice(0, MAX_ACTIONS_PER_SUMMARY)) {
    const normalized = normalizeProposal(proposal, input, allowedUrls, now, env);
    if (!normalized) continue;
    const actionId: string = UUIDUtil.getRandomUUID();
    const token: string = CryptoUtil.randomBase64Url(32);
    const tokenHash: string = await hashToken(actionId, token, signingSecret);
    const action: EmailAction = await actionDAO.create({
      actionId,
      processedMessageId: input.processedMessage.processedMessageId,
      applicationId: input.application.applicationId,
      userEmail: input.application.userEmail,
      providerId: input.application.providerId,
      providerMessageId: input.processedMessage.providerMessageId,
      providerThreadId: input.processedMessage.providerThreadId,
      actionType: normalized.actionType,
      riskLevel: normalized.riskLevel,
      tokenHash,
      payload: normalized.payload,
      expiresAt: normalized.expiresAt,
    });
    created.push({
      action,
      token,
      confirmationUrl: `${baseUrl}/api/actions/${encodeURIComponent(action.actionId)}?token=${encodeURIComponent(token)}`,
    });
  }

  return created;
}

export type { ActionCreationEnv, CreatedEmailAction, CreateActionsForSummaryInput };
export {
  createActionsForSummary,
  normalizeProposal,
  resolveCallbackBaseUrl,
  resolveExpiresAt,
  extractUrls,
  findAllowedUrl,
  cleanText,
  cleanOptionalText,
  toManualTodo,
};

export {hashToken} from './ActionServiceUtils';