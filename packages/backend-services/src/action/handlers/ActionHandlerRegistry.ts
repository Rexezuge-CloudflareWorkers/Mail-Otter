import {
  EMAIL_ACTION_TYPE_APPOINTMENT_CONFIRM,
  EMAIL_ACTION_TYPE_CALENDAR_ADD_EVENT,
  EMAIL_ACTION_TYPE_DELIVERY_TRACK_PACKAGE,
  EMAIL_ACTION_TYPE_EMAIL_DRAFT_REPLY,
  EMAIL_ACTION_TYPE_EXTERNAL_OPEN_LINK,
  EMAIL_ACTION_TYPE_FINANCE_PAY_BILL,
  EMAIL_ACTION_TYPE_MANUAL_TODO,
  EMAIL_ACTION_TYPE_TRAVEL_TRACK_FLIGHT,
} from '@mail-otter/shared/constants';
import type { EmailActionType } from '@mail-otter/shared/constants';
import { ConnectedApplicationDAO } from '@mail-otter/backend-data/dao';
import { BadRequestError } from '@mail-otter/backend-errors';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import type {
  AppointmentConfirmActionPayload,
  CalendarAddEventActionPayload,
  ConnectedApplication,
  DeliveryTrackPackageActionPayload,
  EmailAction,
  EmailDraftReplyActionPayload,
  ExternalOpenLinkActionPayload,
  FinancePayBillActionPayload,
  TravelTrackFlightActionPayload,
} from '@mail-otter/shared/model';
import { EmailProviderRegistry } from '../../provider/EmailProviderRegistry';
import { OAuth2AccessTokenService } from '../../oauth2/OAuth2AccessTokenService';
import { createActionDAO } from '../ActionServiceUtils';
import * as PackageTrackingService from '../PackageTrackingService';
import * as FlightTrackingService from '../FlightTrackingService';
import type { ActionHandlerContext, HandlerMap, IActionHandler } from './IActionHandler';
import type { ActionExecutionEnv } from '../ActionExecutionService';

async function resolveApplication(action: EmailAction, env: ActionExecutionEnv): Promise<ConnectedApplication> {
  const applicationDAO = new ConnectedApplicationDAO(env.DB, await env.AES_ENCRYPTION_KEY_SECRET.get());
  const application: ConnectedApplication | undefined = await applicationDAO.getById(action.applicationId);
  if (!application) throw new BadRequestError('Connected application was not found.');
  return application;
}

async function resolveAccessToken(applicationId: string, env: ActionExecutionEnv): Promise<string> {
  return new OAuth2AccessTokenService(env).getAccessToken(applicationId, { forceRefresh: true });
}

const externalOpenLinkHandler: IActionHandler = {
  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(action: EmailAction, ctx: ActionHandlerContext) {
    const payload = action.payload as ExternalOpenLinkActionPayload;
    return { summary: ctx.strings.results.externalLinkReviewed, externalUrl: payload.url, providerUrl: payload.url };
  },
};

const manualTodoHandler: IActionHandler = {
  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(_action: EmailAction, ctx: ActionHandlerContext) {
    return { summary: ctx.strings.results.manualAcknowledged };
  },
};

const deliveryTrackPackageHandler: IActionHandler = {
  async execute(action: EmailAction, ctx: ActionHandlerContext) {
    const payload = action.payload as DeliveryTrackPackageActionPayload;
    const trackingApiKey = ConfigurationManager.digest.getPackageTrackingApiKey(ctx.env);
    if (trackingApiKey) {
      const status = await PackageTrackingService.fetchStatus(payload.trackingNumber, payload.carrier, trackingApiKey, ctx.locale);
      if (status) return { summary: status.summary, externalUrl: payload.trackingUrl ?? undefined };
    }
    if (payload.trackingUrl) return { summary: ctx.strings.results.packageLinkOpened, externalUrl: payload.trackingUrl };
    const via = payload.carrier ? `${ctx.strings.results.packageNotedVia}${payload.carrier}` : '';
    return { summary: `${ctx.strings.results.packageNotedPrefix}${payload.trackingNumber}${via}.` };
  },
};

const travelTrackFlightHandler: IActionHandler = {
  async execute(action: EmailAction, ctx: ActionHandlerContext) {
    const payload = action.payload as TravelTrackFlightActionPayload;
    const flightTrackingApiKey = ConfigurationManager.digest.getFlightTrackingApiKey(ctx.env);
    if (flightTrackingApiKey) {
      const syncStatus = await FlightTrackingService.fetchFlightStatus(payload.flightNumber, flightTrackingApiKey);
      if (syncStatus) {
        const actionDAO = await createActionDAO(ctx.env);
        await actionDAO.updateSyncStatus(action.actionId, JSON.stringify(syncStatus));
        return {
          summary: FlightTrackingService.formatFlightSummary(payload.flightNumber, syncStatus, ctx.locale),
          externalUrl: payload.trackingUrl ?? undefined,
        };
      }
    }
    if (payload.trackingUrl) return { summary: ctx.strings.results.flightLinkOpened, externalUrl: payload.trackingUrl };
    return { summary: `${ctx.strings.results.flightNotedPrefix}${payload.flightNumber}${ctx.strings.results.flightNotedSuffix}` };
  },
};

const financePayBillHandler: IActionHandler = {
  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(action: EmailAction, ctx: ActionHandlerContext) {
    const payload = action.payload as FinancePayBillActionPayload;
    if (payload.paymentUrl) return { summary: ctx.strings.results.paymentLinkOpened, externalUrl: payload.paymentUrl };
    return { summary: ctx.strings.results.billReminderNoted };
  },
};

const appointmentConfirmHandler: IActionHandler = {
  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(action: EmailAction, ctx: ActionHandlerContext) {
    const payload = action.payload as AppointmentConfirmActionPayload;
    const when = payload.appointmentTime ? `${ctx.strings.results.appointmentNotedOn}${payload.appointmentTime}` : '';
    return { summary: `${ctx.strings.results.appointmentNotedPrefix}${when}${ctx.strings.results.appointmentNotedSuffix}` };
  },
};

const calendarAddEventHandler: IActionHandler = {
  async execute(action: EmailAction, ctx: ActionHandlerContext) {
    const application = await resolveApplication(action, ctx.env);
    const accessToken = await resolveAccessToken(application.applicationId, ctx.env);
    const payload = action.payload as CalendarAddEventActionPayload;
    return EmailProviderRegistry.get(action.providerId).createCalendarEvent(accessToken, payload);
  },
};

const emailDraftReplyHandler: IActionHandler = {
  async execute(action: EmailAction, ctx: ActionHandlerContext) {
    const application = await resolveApplication(action, ctx.env);
    const accessToken = await resolveAccessToken(application.applicationId, ctx.env);
    const payload = action.payload as EmailDraftReplyActionPayload;
    const fromEmail = application.providerEmail || application.userEmail;
    return EmailProviderRegistry.get(action.providerId).createDraftReply(accessToken, action.providerMessageId, fromEmail, payload);
  },
};

const HANDLERS: HandlerMap = new Map<EmailActionType, IActionHandler>([
  [EMAIL_ACTION_TYPE_EXTERNAL_OPEN_LINK, externalOpenLinkHandler],
  [EMAIL_ACTION_TYPE_MANUAL_TODO, manualTodoHandler],
  [EMAIL_ACTION_TYPE_DELIVERY_TRACK_PACKAGE, deliveryTrackPackageHandler],
  [EMAIL_ACTION_TYPE_TRAVEL_TRACK_FLIGHT, travelTrackFlightHandler],
  [EMAIL_ACTION_TYPE_FINANCE_PAY_BILL, financePayBillHandler],
  [EMAIL_ACTION_TYPE_APPOINTMENT_CONFIRM, appointmentConfirmHandler],
  [EMAIL_ACTION_TYPE_CALENDAR_ADD_EVENT, calendarAddEventHandler],
  [EMAIL_ACTION_TYPE_EMAIL_DRAFT_REPLY, emailDraftReplyHandler],
]);

class ActionHandlerRegistry {
  public static get(actionType: string): IActionHandler | undefined {
    return HANDLERS.get(actionType as EmailActionType);
  }

  public static getHandlers(): HandlerMap {
    return HANDLERS;
  }
}

export { ActionHandlerRegistry };
