import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetConfirmationResponse,
  mockExecuteActionWithToken,
  mockCompleteCallback,
  mockHandleGmail,
  mockHandleOutlook,
  mockHandleLifecycle,
  mockHandleFastmail,
} = vi.hoisted(() => ({
  mockGetConfirmationResponse: vi.fn(),
  mockExecuteActionWithToken: vi.fn(),
  mockCompleteCallback: vi.fn(),
  mockHandleGmail: vi.fn(),
  mockHandleOutlook: vi.fn(),
  mockHandleLifecycle: vi.fn(),
  mockHandleFastmail: vi.fn(),
}));

vi.mock('@mail-otter/backend-services/action', () => ({
  ActionService: {
    getConfirmationResponse: mockGetConfirmationResponse,
    executeActionWithToken: mockExecuteActionWithToken,
  },
}));

vi.mock('@mail-otter/backend-services/oauth2', () => ({
  OAuth2AuthorizationService: vi.fn(function () {
    return { completeCallback: mockCompleteCallback };
  }),
}));

vi.mock('@mail-otter/backend-services/webhook', () => ({
  GmailWebhookService: { handleNotification: mockHandleGmail },
  OutlookWebhookService: { handleNotifications: mockHandleOutlook, handleLifecycleNotifications: mockHandleLifecycle },
  FastmailWebhookService: { handleNotification: mockHandleFastmail },
}));

import { GetActionConfirmationRoute } from '../../apps/api/src/endpoints/api/actions/GET';
import { ExecuteActionCallbackRoute } from '../../apps/api/src/endpoints/api/actions/execute/POST';
import { OAuth2CallbackRoute } from '../../apps/api/src/endpoints/api/oauth2/callback/GET';
import { GmailWebhookRoute } from '../../apps/api/src/endpoints/api/webhooks/gmail/POST';
import { OutlookWebhookRoute } from '../../apps/api/src/endpoints/api/webhooks/outlook/POST';
import { OutlookLifecycleWebhookRoute } from '../../apps/api/src/endpoints/api/webhooks/outlook/lifecycle/POST';
import { FastmailWebhookRoute } from '../../apps/api/src/endpoints/api/webhooks/fastmail/POST';
import { BadRequestError } from '@mail-otter/backend-errors';

function makeCxt(params: Record<string, string | undefined> = {}) {
  return {
    get: vi.fn(),
    req: { param: vi.fn((name: string) => params[name]) },
  } as never;
}

function makeEnv() {
  return { DB: {} } as never;
}

function call(route: unknown, request: unknown, env: never, cxt: never) {
  return (route as { handleRequest(request: unknown, env: never, cxt: never): Promise<unknown> }).handleRequest(
    request,
    env,
    cxt,
  );
}

function req(url: string, extra: Record<string, unknown> = {}) {
  return { raw: new Request(url), ...extra };
}

describe('public api routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET action confirmation requires actionId, then renders HTML', async () => {
    await expect(call(new GetActionConfirmationRoute(), req('https://x/'), makeEnv(), makeCxt())).rejects.toThrow(
      BadRequestError,
    );
    mockGetConfirmationResponse.mockResolvedValue({ statusCode: 200, html: '<h1>ok</h1>' });
    const result = (await call(
      new GetActionConfirmationRoute(),
      req('https://x/?token=t'),
      makeEnv(),
      makeCxt({ actionId: 'a-1' }),
    )) as { rawBody: string };
    expect(mockGetConfirmationResponse).toHaveBeenCalledWith('a-1', 't', expect.anything());
    expect(result.rawBody).toBe('<h1>ok</h1>');
  });

  it('POST action execute requires actionId, then renders HTML', async () => {
    await expect(call(new ExecuteActionCallbackRoute(), req('https://x/'), makeEnv(), makeCxt())).rejects.toThrow(
      BadRequestError,
    );
    mockExecuteActionWithToken.mockResolvedValue({ statusCode: 200, html: '<h1>done</h1>' });
    const result = (await call(
      new ExecuteActionCallbackRoute(),
      req('https://x/?token=t'),
      makeEnv(),
      makeCxt({ actionId: 'a-1' }),
    )) as { rawBody: string };
    expect(mockExecuteActionWithToken).toHaveBeenCalledWith('a-1', 't', expect.any(Request), expect.anything());
    expect(result.rawBody).toBe('<h1>done</h1>');
  });

  it('OAuth2 callback validates params, redirects on error/success', async () => {
    await expect(call(new OAuth2CallbackRoute(), req('https://x/'), makeEnv(), makeCxt())).rejects.toThrow(
      BadRequestError,
    );
    const errRedirect = (await call(
      new OAuth2CallbackRoute(),
      req('https://x/?error=denied'),
      makeEnv(),
      makeCxt({ applicationId: 'app-1' }),
    )) as { statusCode: number };
    expect(errRedirect.statusCode).toBeGreaterThanOrEqual(300);
    await expect(
      call(new OAuth2CallbackRoute(), req('https://x/'), makeEnv(), makeCxt({ applicationId: 'app-1' })),
    ).rejects.toThrow(BadRequestError);
    mockCompleteCallback.mockResolvedValue(undefined);
    const okRedirect = (await call(
      new OAuth2CallbackRoute(),
      req('https://x/?code=c&state=s'),
      makeEnv(),
      makeCxt({ applicationId: 'app-1' }),
    )) as { statusCode: number };
    expect(mockCompleteCallback).toHaveBeenCalledWith({ applicationId: 'app-1', code: 'c', state: 's' });
    expect(okRedirect.statusCode).toBeGreaterThanOrEqual(300);
    mockCompleteCallback.mockRejectedValue(new Error('bad verifier'));
    const failRedirect = (await call(
      new OAuth2CallbackRoute(),
      req('https://x/?code=c&state=s'),
      makeEnv(),
      makeCxt({ applicationId: 'app-1' }),
    )) as { statusCode: number };
    expect(failRedirect.statusCode).toBeGreaterThanOrEqual(300);
  });

  it('Gmail webhook requires applicationId, then accepts', async () => {
    await expect(
      call(new GmailWebhookRoute(), req('https://x/', { message: {} }), makeEnv(), makeCxt()),
    ).rejects.toThrow(BadRequestError);
    const result = (await call(
      new GmailWebhookRoute(),
      req('https://x/?token=t', { message: { data: 'd', messageId: 'm' } }),
      makeEnv(),
      makeCxt({ applicationId: 'app-1' }),
    )) as { message: string };
    expect(mockHandleGmail).toHaveBeenCalledWith(
      expect.objectContaining({ applicationId: 'app-1', token: 't' }),
      expect.anything(),
    );
    expect(result.message).toBe('accepted');
  });

  it('Outlook webhook echoes validationToken, else accepts notifications', async () => {
    const echo = (await call(
      new OutlookWebhookRoute(),
      req('https://x/?validationToken=vt'),
      makeEnv(),
      makeCxt({ applicationId: 'app-1' }),
    )) as { rawBody: string };
    expect(echo.rawBody).toBe('vt');
    expect(mockHandleOutlook).not.toHaveBeenCalled();
    await expect(
      call(new OutlookWebhookRoute(), req('https://x/', { value: [] }), makeEnv(), makeCxt()),
    ).rejects.toThrow(BadRequestError);
    const accepted = (await call(
      new OutlookWebhookRoute(),
      req('https://x/', { value: [] }),
      makeEnv(),
      makeCxt({ applicationId: 'app-1' }),
    )) as { statusCode: number };
    expect(mockHandleOutlook).toHaveBeenCalledWith('app-1', [], expect.anything(), expect.any(String));
    expect(accepted.statusCode).toBe(202);
  });

  it('Outlook lifecycle webhook echoes validationToken, else accepts', async () => {
    const echo = (await call(
      new OutlookLifecycleWebhookRoute(),
      req('https://x/?validationToken=vt'),
      makeEnv(),
      makeCxt({ applicationId: 'app-1' }),
    )) as { rawBody: string };
    expect(echo.rawBody).toBe('vt');
    await expect(
      call(new OutlookLifecycleWebhookRoute(), req('https://x/', { value: [] }), makeEnv(), makeCxt()),
    ).rejects.toThrow(BadRequestError);
    const accepted = (await call(
      new OutlookLifecycleWebhookRoute(),
      req('https://x/', { value: [] }),
      makeEnv(),
      makeCxt({ applicationId: 'app-1' }),
    )) as { statusCode: number };
    expect(mockHandleLifecycle).toHaveBeenCalledWith('app-1', [], expect.anything());
    expect(accepted.statusCode).toBe(202);
  });

  it('Fastmail webhook validates applicationId and emailId', async () => {
    await expect(
      call(new FastmailWebhookRoute(), req('https://x/', { emailId: 'e' }), makeEnv(), makeCxt()),
    ).rejects.toThrow(BadRequestError);
    await expect(
      call(new FastmailWebhookRoute(), req('https://x/', {}), makeEnv(), makeCxt({ applicationId: 'app-1' })),
    ).rejects.toThrow(BadRequestError);
    const result = (await call(
      new FastmailWebhookRoute(),
      req('https://x/?token=t', { emailId: 'e-1' }),
      makeEnv(),
      makeCxt({ applicationId: 'app-1' }),
    )) as { message: string };
    expect(mockHandleFastmail).toHaveBeenCalledWith(
      expect.objectContaining({ applicationId: 'app-1', emailId: 'e-1', token: 't' }),
      expect.anything(),
    );
    expect(result.message).toBe('accepted');
  });
});
