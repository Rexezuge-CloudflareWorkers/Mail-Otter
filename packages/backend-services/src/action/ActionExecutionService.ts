import {
  EMAIL_ACTION_STATUS_EXPIRED,
  EMAIL_ACTION_STATUS_FAILED,
  EMAIL_ACTION_STATUS_SUCCEEDED,
  EMAIL_ACTION_TRIGGER_AUTO_EXECUTE,
  EMAIL_ACTION_TRIGGER_EMAIL_CALLBACK,
  EMAIL_ACTION_TRIGGER_SCHEDULED,
  EMAIL_ACTION_TRIGGER_WEB_UI,
} from '@mail-otter/shared/constants';
import { ConnectedApplicationDAO } from '@mail-otter/backend-data/dao';
import { BadRequestError } from '@mail-otter/backend-errors';
import { CryptoUtil, TimestampUtil } from '@mail-otter/shared/utils';
import type {
  EmailAction,
  EmailActionResult,
} from '@mail-otter/shared/model';
import type { CreatedEmailAction } from './ActionCreationService';
import { getBackendStrings } from '@mail-otter/shared/i18n';
import { ActionHandlerRegistry } from './handlers/ActionHandlerRegistry';
import { createActionDAO, hashToken } from './ActionServiceUtils';
import type { ActionCreationEnv } from './ActionCreationService';
import { renderConfirmationPage, renderMessagePage, renderResultPage } from './ActionRenderService';

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

async function resolveActionLocale(action: EmailAction, env: ActionCallbackEnv): Promise<string> {
  try {
    const applicationDAO = new ConnectedApplicationDAO(env.DB, await env.AES_ENCRYPTION_KEY_SECRET.get());
    const application = await applicationDAO.getMetadataByIdForUser(action.applicationId, action.userEmail);
    return application?.contentLanguage ?? 'en';
  } catch {
    return 'en';
  }
}

async function hashUserAgent(request: Request | null, env: ActionExecutionEnv): Promise<string | null> {
  if (!request) return null;
  const userAgent: string = request.headers.get('User-Agent')?.trim() || '';
  if (!userAgent) return null;
  return CryptoUtil.hmacSha256Hex(`email-action-user-agent\n${userAgent}`, await env.ACTION_SIGNING_SECRET.get());
}

async function executeProviderOperation(action: EmailAction, env: ActionExecutionEnv): Promise<EmailActionResult> {
  const locale = await resolveActionLocale(action, env);
  const strings = getBackendStrings(locale);
  const handler = ActionHandlerRegistry.get(action.actionType);
  if (!handler) throw new BadRequestError('Unsupported email action type.');
  return handler.execute(action, { env, locale, strings });
}

async function executeAction(
  action: EmailAction,
  triggeredBy:
    | typeof EMAIL_ACTION_TRIGGER_EMAIL_CALLBACK
    | typeof EMAIL_ACTION_TRIGGER_WEB_UI
    | typeof EMAIL_ACTION_TRIGGER_AUTO_EXECUTE
    | typeof EMAIL_ACTION_TRIGGER_SCHEDULED,
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
  const locale = action ? await resolveActionLocale(action, env) : 'en';
  const strings = getBackendStrings(locale);
  if (!action) {
    return { statusCode: 404, html: renderMessagePage(strings.actionPage.notFoundTitle, strings.actionPage.notFoundBody, locale) };
  }
  return { statusCode: 200, html: renderConfirmationPage(action, token, locale) };
}

async function executeActionWithToken(actionId: string, token: string, request: Request, env: ActionCallbackEnv): Promise<ActionHtmlResponse> {
  const action: EmailAction | undefined = await getActionForToken(actionId, token, env);
  const locale = action ? await resolveActionLocale(action, env) : 'en';
  const strings = getBackendStrings(locale);
  if (!action) {
    return { statusCode: 404, html: renderMessagePage(strings.actionPage.notFoundTitle, strings.actionPage.notFoundBody, locale) };
  }
  const result: EmailAction = await executeAction(action, EMAIL_ACTION_TRIGGER_EMAIL_CALLBACK, request, env);
  return { statusCode: 200, html: renderResultPage(result, locale) };
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
