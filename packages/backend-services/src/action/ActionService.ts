import {
  EMAIL_ACTION_RISK_LOW,
  EMAIL_ACTION_RISK_MEDIUM,
  EMAIL_ACTION_STATUS_EXPIRED,
  EMAIL_ACTION_STATUS_FAILED,
  EMAIL_ACTION_STATUS_PENDING,
  EMAIL_ACTION_STATUS_SUCCEEDED,
  EMAIL_ACTION_TRIGGER_EMAIL_CALLBACK,
  EMAIL_ACTION_TRIGGER_WEB_UI,
  EMAIL_ACTION_TYPE_CALENDAR_ADD_EVENT,
  EMAIL_ACTION_TYPE_EMAIL_DRAFT_REPLY,
  EMAIL_ACTION_TYPE_EXTERNAL_OPEN_LINK,
  EMAIL_ACTION_TYPE_MANUAL_TODO,
  PROVIDER_GOOGLE_GMAIL,
  PROVIDER_MICROSOFT_OUTLOOK,
} from '@mail-otter/shared/constants';
import { ConnectedApplicationDAO, EmailActionDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { BadRequestError } from '@mail-otter/backend-errors';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { GmailProviderUtil } from '@mail-otter/provider-clients/gmail';
import { OutlookProviderUtil } from '@mail-otter/provider-clients/outlook';
import type {
  CalendarAddEventActionPayload,
  ConnectedApplication,
  EmailAction,
  EmailActionExecutionList,
  EmailActionList,
  EmailActionPayload,
  EmailActionProposal,
  EmailActionResult,
  EmailDraftReplyActionPayload,
  ExternalOpenLinkActionPayload,
  ManualTodoActionPayload,
  ProcessedMessage,
} from '@mail-otter/shared/model';
import type { EmailActionExecutionTrigger, EmailActionRiskLevel, EmailActionStatus, EmailActionType } from '@mail-otter/shared/constants';
import { CryptoUtil, TimestampUtil, UUIDUtil } from '@mail-otter/shared/utils';
import { OAuth2AccessTokenService } from '../oauth2/OAuth2AccessTokenService';

const MAX_ACTIONS_PER_SUMMARY = 4;
const MAX_TEXT_LENGTH = 1000;

class ActionService {
  public static async createActionsForSummary(input: CreateActionsForSummaryInput, env: ActionCreationEnv): Promise<CreatedEmailAction[]> {
    const baseUrl: string = ActionService.resolveCallbackBaseUrl(input.callbackBaseUrl, env);
    if (!baseUrl || input.proposals.length === 0) return [];

    const actionDAO: EmailActionDAO = await ActionService.createActionDAO(env);
    const signingSecret: string = await env.ACTION_SIGNING_SECRET.get();
    const allowedUrls: Set<string> = ActionService.extractUrls(input.body);
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const created: CreatedEmailAction[] = [];

    for (const proposal of input.proposals.slice(0, MAX_ACTIONS_PER_SUMMARY)) {
      const normalized: NormalizedActionProposal | undefined = ActionService.normalizeProposal(proposal, input, allowedUrls, now, env);
      if (!normalized) continue;
      const actionId: string = UUIDUtil.getRandomUUID();
      const token: string = CryptoUtil.randomBase64Url(32);
      const tokenHash: string = await ActionService.hashToken(actionId, token, signingSecret);
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

  public static renderEmailActionSection(actions: CreatedEmailAction[]): string {
    if (actions.length === 0) return '';
    return [
      '',
      '<p><strong>Available actions:</strong></p>',
      '<ul>',
      ...actions.map((item: CreatedEmailAction): string => {
        const expires: string = new Date(item.action.expiresAt * 1000).toLocaleString('en-US', { timeZone: 'UTC', timeZoneName: 'short' });
        return [
          '<li>',
          `<strong>${ActionService.escapeHtml(item.action.title)}</strong><br>`,
          `${ActionService.escapeHtml(item.action.description)}<br>`,
          `<a href="${ActionService.escapeHtml(item.confirmationUrl)}">Review action</a>`,
          ` <span style="color:#666;">Expires ${ActionService.escapeHtml(expires)}</span>`,
          '</li>',
        ].join('');
      }),
      '</ul>',
      '<p><small>Mail-Otter will show a confirmation page before executing any action.</small></p>',
    ].join('\n');
  }

  public static async getConfirmationResponse(actionId: string, token: string, env: ActionCallbackEnv): Promise<ActionHtmlResponse> {
    const action: EmailAction | undefined = await ActionService.getActionForToken(actionId, token, env);
    if (!action) {
      return { statusCode: 404, html: ActionService.renderMessagePage('Action not found', 'This action link is invalid or has expired.') };
    }
    return { statusCode: 200, html: ActionService.renderConfirmationPage(action, token) };
  }

  public static async executeActionWithToken(actionId: string, token: string, request: Request, env: ActionCallbackEnv): Promise<ActionHtmlResponse> {
    const action: EmailAction | undefined = await ActionService.getActionForToken(actionId, token, env);
    if (!action) {
      return { statusCode: 404, html: ActionService.renderMessagePage('Action not found', 'This action link is invalid or has expired.') };
    }
    const result: EmailAction = await ActionService.executeAction(action, EMAIL_ACTION_TRIGGER_EMAIL_CALLBACK, request, env);
    return { statusCode: 200, html: ActionService.renderResultPage(result) };
  }

  public static async executeActionForUser(actionId: string, userEmail: string, request: Request, env: UserActionEnv): Promise<EmailAction> {
    const actionDAO: EmailActionDAO = await ActionService.createActionDAO(env);
    const action: EmailAction | undefined = await actionDAO.getForUser(actionId, userEmail);
    if (!action) throw new BadRequestError('Email action was not found.');
    return ActionService.executeAction(action, EMAIL_ACTION_TRIGGER_WEB_UI, request, env);
  }

  public static async listActionsForUser(userEmail: string, input: ListActionsInput, env: UserActionListEnv): Promise<EmailActionList> {
    return (await ActionService.createActionDAO(env)).listActionsForUser(userEmail, input);
  }

  public static async listExecutionsForUser(actionId: string, userEmail: string, env: UserActionListEnv): Promise<EmailActionExecutionList> {
    return (await ActionService.createActionDAO(env)).listExecutionsForUser(actionId, userEmail);
  }

  public static async expirePendingActions(env: ActionMaintenanceEnv, limit: number): Promise<number> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    return (await ActionService.createActionDAO(env)).expirePendingActions(now, limit);
  }

  public static async deleteOldActions(env: ActionMaintenanceEnv, limit: number): Promise<number> {
    const retentionDays: number = ConfigurationManager.getActionRetentionDays(env);
    const olderThan: number = TimestampUtil.subtractDays(TimestampUtil.getCurrentUnixTimestampInSeconds(), retentionDays);
    return (await ActionService.createActionDAO(env)).deleteOlderThan(olderThan, limit);
  }

  private static async executeAction(
    action: EmailAction,
    triggeredBy: EmailActionExecutionTrigger,
    request: Request,
    env: ActionExecutionEnv,
  ): Promise<EmailAction> {
    const actionDAO: EmailActionDAO = await ActionService.createActionDAO(env);
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const userAgentHash: string | null = await ActionService.hashUserAgent(request, env);

    if (action.status === EMAIL_ACTION_STATUS_SUCCEEDED || action.status === EMAIL_ACTION_STATUS_FAILED || action.status === EMAIL_ACTION_STATUS_EXPIRED) {
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
      return (await actionDAO.getForUser(action.actionId, action.userEmail)) ?? {
        ...action,
        status: EMAIL_ACTION_STATUS_EXPIRED,
      };
    }

    const claimed: boolean = await actionDAO.claimForExecution(action.actionId);
    if (!claimed) {
      return action;
    }

    try {
      const result: EmailActionResult = await ActionService.executeProviderOperation(action, env);
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

  private static async executeProviderOperation(action: EmailAction, env: ActionExecutionEnv): Promise<EmailActionResult> {
    if (action.actionType === EMAIL_ACTION_TYPE_EXTERNAL_OPEN_LINK) {
      const payload = action.payload as ExternalOpenLinkActionPayload;
      return { summary: 'External link reviewed.', externalUrl: payload.url, providerUrl: payload.url };
    }
    if (action.actionType === EMAIL_ACTION_TYPE_MANUAL_TODO) {
      return { summary: 'Manual action acknowledged.' };
    }

    const applicationDAO = new ConnectedApplicationDAO(env.DB, await env.AES_ENCRYPTION_KEY_SECRET.get());
    const application: ConnectedApplication | undefined = await applicationDAO.getById(action.applicationId);
    if (!application) throw new BadRequestError('Connected application was not found.');
    const accessToken: string = await OAuth2AccessTokenService.getAccessToken(application.applicationId, env, { forceRefresh: true });

    if (action.actionType === EMAIL_ACTION_TYPE_CALENDAR_ADD_EVENT) {
      return ActionService.executeCalendarAction(action, accessToken);
    }
    if (action.actionType === EMAIL_ACTION_TYPE_EMAIL_DRAFT_REPLY) {
      return ActionService.executeDraftReplyAction(action, accessToken, application);
    }
    throw new BadRequestError('Unsupported email action type.');
  }

  private static async executeCalendarAction(action: EmailAction, accessToken: string): Promise<EmailActionResult> {
    const payload = action.payload as CalendarAddEventActionPayload;
    if (action.providerId === PROVIDER_GOOGLE_GMAIL) {
      const result = await GmailProviderUtil.createCalendarEvent(accessToken, payload);
      return {
        summary: 'Calendar event created.',
        providerOperationId: result.id,
        providerUrl: result.htmlLink,
      };
    }
    if (action.providerId === PROVIDER_MICROSOFT_OUTLOOK) {
      const result = await OutlookProviderUtil.createCalendarEvent(accessToken, payload);
      return {
        summary: 'Calendar event created.',
        providerOperationId: result.id,
        providerUrl: result.webLink,
      };
    }
    throw new BadRequestError('Unsupported calendar provider.');
  }

  private static async executeDraftReplyAction(
    action: EmailAction,
    accessToken: string,
    application: ConnectedApplication,
  ): Promise<EmailActionResult> {
    const payload = action.payload as EmailDraftReplyActionPayload;
    if (action.providerId === PROVIDER_GOOGLE_GMAIL) {
      const message = await GmailProviderUtil.getMessage(accessToken, action.providerMessageId);
      const result = await GmailProviderUtil.createDraftReply(
        accessToken,
        application.providerEmail || application.userEmail,
        message,
        payload.draftBody,
        payload.draftSubject,
      );
      return {
        summary: 'Draft reply created.',
        providerOperationId: result.id || result.message?.id,
      };
    }
    if (action.providerId === PROVIDER_MICROSOFT_OUTLOOK) {
      const result = await OutlookProviderUtil.createDraftReply(accessToken, action.providerMessageId, payload.draftBody);
      return {
        summary: 'Draft reply created.',
        providerOperationId: result.id,
        providerUrl: result.webLink,
      };
    }
    throw new BadRequestError('Unsupported draft provider.');
  }

  private static normalizeProposal(
    proposal: EmailActionProposal,
    input: CreateActionsForSummaryInput,
    allowedUrls: Set<string>,
    now: number,
    env: ActionCreationEnv,
  ): NormalizedActionProposal | undefined {
    const title: string = ActionService.cleanText(proposal.title || ActionService.getFallbackActionTitle(proposal.type));
    const description: string = ActionService.cleanText(proposal.description || title);
    const parameters: Record<string, unknown> = proposal.parameters || {};
    const expiresAt: number = ActionService.resolveExpiresAt(proposal.expiresAt, now, env);
    const base = { title, description, sourceSubject: input.subject, sourceFrom: input.from };

    if (proposal.type === EMAIL_ACTION_TYPE_CALENDAR_ADD_EVENT) {
      const eventTitle: string = ActionService.cleanText(ActionService.getString(parameters, 'eventTitle', 'title', 'summary') || title);
      const startTime: string = ActionService.getString(parameters, 'startTime', 'startDateTime', 'startsAt') || '';
      const endTime: string = ActionService.getString(parameters, 'endTime', 'endDateTime', 'endsAt') || '';
      const timeZone: string = ActionService.getString(parameters, 'timeZone', 'timezone') || 'UTC';
      if (ActionService.isValidIsoDateTime(startTime) && ActionService.isValidIsoDateTime(endTime)) {
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
            location: ActionService.cleanOptionalText(ActionService.getString(parameters, 'location')),
            notes: ActionService.cleanOptionalText(ActionService.getString(parameters, 'notes', 'description')),
          },
        };
      }
      return ActionService.toManualTodo(base, `Review calendar details manually: ${description}`, expiresAt);
    }

    if (proposal.type === EMAIL_ACTION_TYPE_EMAIL_DRAFT_REPLY) {
      const draftBody: string = ActionService.cleanText(ActionService.getString(parameters, 'draftBody', 'body', 'replyText') || description);
      return {
        actionType: EMAIL_ACTION_TYPE_EMAIL_DRAFT_REPLY,
        riskLevel: EMAIL_ACTION_RISK_MEDIUM,
        expiresAt,
        payload: {
          ...base,
          type: EMAIL_ACTION_TYPE_EMAIL_DRAFT_REPLY,
          draftSubject: ActionService.cleanOptionalText(ActionService.getString(parameters, 'draftSubject', 'subject')),
          draftBody,
        },
      };
    }

    if (proposal.type === EMAIL_ACTION_TYPE_EXTERNAL_OPEN_LINK) {
      const url: string = ActionService.getString(parameters, 'url', 'href', 'link') || '';
      const normalizedUrl: string | undefined = ActionService.findAllowedUrl(url, allowedUrls);
      if (normalizedUrl) {
        return {
          actionType: EMAIL_ACTION_TYPE_EXTERNAL_OPEN_LINK,
          riskLevel: EMAIL_ACTION_RISK_LOW,
          expiresAt,
          payload: {
            ...base,
            type: EMAIL_ACTION_TYPE_EXTERNAL_OPEN_LINK,
            url: normalizedUrl,
          },
        };
      }
      return ActionService.toManualTodo(base, `Open the related link manually: ${description}`, expiresAt);
    }

    if (proposal.type === EMAIL_ACTION_TYPE_MANUAL_TODO) {
      return ActionService.toManualTodo(base, ActionService.cleanText(ActionService.getString(parameters, 'instructions') || description), expiresAt);
    }

    return undefined;
  }

  private static toManualTodo(
    base: { title: string; description: string; sourceSubject?: string | undefined; sourceFrom?: string | undefined },
    instructions: string,
    expiresAt: number,
  ): NormalizedActionProposal {
    return {
      actionType: EMAIL_ACTION_TYPE_MANUAL_TODO,
      riskLevel: EMAIL_ACTION_RISK_LOW,
      expiresAt,
      payload: {
        ...base,
        type: EMAIL_ACTION_TYPE_MANUAL_TODO,
        instructions,
      },
    };
  }

  private static async getActionForToken(actionId: string, token: string, env: ActionCallbackEnv): Promise<EmailAction | undefined> {
    const tokenHash: string = await ActionService.hashToken(actionId, token, await env.ACTION_SIGNING_SECRET.get());
    return (await ActionService.createActionDAO(env)).getByTokenHash(actionId, tokenHash);
  }

  private static async createActionDAO(env: ActionDAOEnv): Promise<EmailActionDAO> {
    return new EmailActionDAO(env.DB, await env.ACTION_ENCRYPTION_KEY_SECRET.get());
  }

  private static async hashToken(actionId: string, token: string, signingSecret: string): Promise<string> {
    return CryptoUtil.hmacSha256Hex(`email-action-token\n${actionId}\n${token}`, signingSecret);
  }

  private static async hashUserAgent(request: Request, env: ActionExecutionEnv): Promise<string | null> {
    const userAgent: string = request.headers.get('User-Agent')?.trim() || '';
    if (!userAgent) return null;
    return CryptoUtil.hmacSha256Hex(`email-action-user-agent\n${userAgent}`, await env.ACTION_SIGNING_SECRET.get());
  }

  private static resolveCallbackBaseUrl(callbackBaseUrl: string | undefined, env: ActionCreationEnv): string {
    return (callbackBaseUrl?.trim() || ConfigurationManager.getActionCallbackBaseUrl(env)).replace(/\/+$/, '');
  }

  private static resolveExpiresAt(expiresAt: string | undefined, now: number, env: ActionCreationEnv): number {
    const defaultExpiresAt: number = TimestampUtil.addHours(now, ConfigurationManager.getActionDefaultExpiryHours(env));
    if (!expiresAt) return defaultExpiresAt;
    const parsed: number = Math.floor(new Date(expiresAt).getTime() / 1000);
    if (!Number.isFinite(parsed) || parsed <= now) return defaultExpiresAt;
    return Math.min(parsed, defaultExpiresAt);
  }

  private static extractUrls(body: string): Set<string> {
    const urls = new Set<string>();
    for (const match of body.matchAll(/https?:\/\/[^\s<>"]+/gi)) {
      const url: string = match[0].replace(/[),.;!?]+$/, '');
      urls.add(url);
    }
    return urls;
  }

  private static findAllowedUrl(url: string, allowedUrls: Set<string>): string | undefined {
    const candidate: string = url.trim().replace(/[),.;!?]+$/, '');
    if (!candidate.startsWith('http://') && !candidate.startsWith('https://')) return undefined;
    if (allowedUrls.has(candidate)) return candidate;
    for (const allowed of allowedUrls) {
      if (allowed.replace(/\/+$/, '') === candidate.replace(/\/+$/, '')) return allowed;
    }
    return undefined;
  }

  private static getString(parameters: Record<string, unknown>, ...keys: string[]): string | undefined {
    for (const key of keys) {
      const value: unknown = parameters[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return undefined;
  }

  private static isValidIsoDateTime(value: string): boolean {
    return Boolean(value && Number.isFinite(new Date(value).getTime()));
  }

  private static getFallbackActionTitle(type: string): string {
    if (type === EMAIL_ACTION_TYPE_CALENDAR_ADD_EVENT) return 'Add event to calendar';
    if (type === EMAIL_ACTION_TYPE_EMAIL_DRAFT_REPLY) return 'Draft a reply';
    if (type === EMAIL_ACTION_TYPE_EXTERNAL_OPEN_LINK) return 'Open related link';
    return 'Review action item';
  }

  private static cleanText(value: string): string {
    return value.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_LENGTH);
  }

  private static cleanOptionalText(value: string | undefined): string | undefined {
    const cleaned: string = ActionService.cleanText(value || '');
    return cleaned || undefined;
  }

  private static renderConfirmationPage(action: EmailAction, token: string): string {
    const expired: boolean = action.expiresAt <= TimestampUtil.getCurrentUnixTimestampInSeconds() || action.status === EMAIL_ACTION_STATUS_EXPIRED;
    const alreadyDone: boolean = action.status !== EMAIL_ACTION_STATUS_PENDING;
    const details: string = ActionService.renderActionDetails(action);
    return ActionService.renderPage(
      `Confirm ${action.title}`,
      [
        `<h1>${ActionService.escapeHtml(action.title)}</h1>`,
        `<p>${ActionService.escapeHtml(action.description)}</p>`,
        details,
        `<p><strong>Status:</strong> ${ActionService.escapeHtml(action.status)}</p>`,
        `<p><strong>Expires:</strong> ${ActionService.escapeHtml(new Date(action.expiresAt * 1000).toUTCString())}</p>`,
        expired
          ? '<p class="error">This action has expired.</p>'
          : alreadyDone
            ? '<p>This action is no longer pending. The latest result is shown below.</p>'
            : `<form method="post" action="/api/actions/${encodeURIComponent(action.actionId)}/execute?token=${encodeURIComponent(token)}"><button type="submit">Confirm action</button></form>`,
        action.result ? ActionService.renderResultDetails(action.result) : '',
      ].join('\n'),
    );
  }

  private static renderResultPage(action: EmailAction): string {
    return ActionService.renderPage(
      `Action ${action.status}`,
      [
        `<h1>${ActionService.escapeHtml(action.title)}</h1>`,
        `<p><strong>Status:</strong> ${ActionService.escapeHtml(action.status)}</p>`,
        action.errorMessage ? `<p class="error">${ActionService.escapeHtml(action.errorMessage)}</p>` : '',
        action.result ? ActionService.renderResultDetails(action.result) : '',
      ].join('\n'),
    );
  }

  private static renderResultDetails(result: EmailActionResult): string {
    return [
      '<section>',
      '<h2>Result</h2>',
      `<p>${ActionService.escapeHtml(result.summary)}</p>`,
      result.providerUrl || result.externalUrl
        ? `<p><a href="${ActionService.escapeHtml(result.providerUrl || result.externalUrl || '')}" rel="noopener noreferrer">Open result</a></p>`
        : '',
      '</section>',
    ].join('\n');
  }

  private static renderActionDetails(action: EmailAction): string {
    const payload: EmailActionPayload = action.payload;
    if (payload.type === EMAIL_ACTION_TYPE_CALENDAR_ADD_EVENT) {
      return [
        '<section><h2>Calendar Event</h2>',
        `<p><strong>Title:</strong> ${ActionService.escapeHtml(payload.eventTitle)}</p>`,
        `<p><strong>Start:</strong> ${ActionService.escapeHtml(payload.startTime)} ${ActionService.escapeHtml(payload.timeZone)}</p>`,
        `<p><strong>End:</strong> ${ActionService.escapeHtml(payload.endTime)} ${ActionService.escapeHtml(payload.timeZone)}</p>`,
        payload.location ? `<p><strong>Location:</strong> ${ActionService.escapeHtml(payload.location)}</p>` : '',
        '</section>',
      ].join('\n');
    }
    if (payload.type === EMAIL_ACTION_TYPE_EMAIL_DRAFT_REPLY) {
      return `<section><h2>Draft Reply</h2><pre>${ActionService.escapeHtml(payload.draftBody)}</pre></section>`;
    }
    if (payload.type === EMAIL_ACTION_TYPE_EXTERNAL_OPEN_LINK) {
      return `<section><h2>Link</h2><p>${ActionService.escapeHtml(payload.url)}</p></section>`;
    }
    const manualPayload = payload as ManualTodoActionPayload;
    return `<section><h2>Manual Task</h2><p>${ActionService.escapeHtml(manualPayload.instructions)}</p></section>`;
  }

  private static renderMessagePage(title: string, message: string): string {
    return ActionService.renderPage(title, `<h1>${ActionService.escapeHtml(title)}</h1><p>${ActionService.escapeHtml(message)}</p>`);
  }

  private static renderPage(title: string, body: string): string {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${ActionService.escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: #101319; color: #f3f4f6; }
    main { max-width: 760px; margin: 0 auto; padding: 40px 20px; }
    section { margin: 20px 0; padding: 16px; border: 1px solid #2d3745; border-radius: 8px; background: #171c25; }
    button, a { display: inline-block; border: 0; border-radius: 6px; padding: 10px 14px; background: #0f766e; color: white; text-decoration: none; font-size: 16px; cursor: pointer; }
    pre { white-space: pre-wrap; color: #d1d5db; }
    .error { color: #fca5a5; }
  </style>
</head>
<body>
  <main>${body}</main>
</body>
</html>`;
  }

  private static escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (char: string): string => {
      switch (char) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '"':
          return '&quot;';
        case "'":
          return '&#39;';
        default:
          return char;
      }
    });
  }
}

interface CreatedEmailAction {
  action: EmailAction;
  token: string;
  confirmationUrl: string;
}

interface CreateActionsForSummaryInput {
  application: Pick<ConnectedApplication, 'applicationId' | 'userEmail' | 'providerId'>;
  processedMessage: ProcessedMessage;
  subject: string;
  from: string;
  body: string;
  proposals: EmailActionProposal[];
  callbackBaseUrl?: string | undefined;
}

interface NormalizedActionProposal {
  actionType: EmailActionType;
  riskLevel: EmailActionRiskLevel;
  payload: EmailActionPayload;
  expiresAt: number;
}

interface ListActionsInput {
  applicationId?: string | undefined;
  status?: EmailActionStatus | undefined;
  cursor?: string | undefined;
}

interface ActionHtmlResponse {
  statusCode: number;
  html: string;
}

interface ActionDAOEnv {
  DB: D1Queryable;
  ACTION_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
}

interface ActionCreationEnv extends ActionDAOEnv {
  ACTION_SIGNING_SECRET: SecretsStoreSecret;
  ACTION_CALLBACK_BASE_URL?: string | undefined;
  ACTION_DEFAULT_EXPIRY_HOURS?: string | undefined;
}

type UserActionListEnv = ActionDAOEnv;

interface ActionMaintenanceEnv extends ActionDAOEnv {
  ACTION_RETENTION_DAYS?: string | undefined;
}

type ActionCallbackEnv = ActionExecutionEnv;

type UserActionEnv = ActionExecutionEnv;

interface ActionExecutionEnv extends ActionCreationEnv {
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string | undefined;
}

export { ActionService };
export type {
  ActionCallbackEnv,
  ActionCreationEnv,
  ActionExecutionEnv,
  ActionHtmlResponse,
  ActionMaintenanceEnv,
  CreatedEmailAction,
  CreateActionsForSummaryInput,
  ListActionsInput,
  UserActionEnv,
  UserActionListEnv,
};
