import { AbstractEntrypointWorker } from '@/base';
import { fromHono, HonoOpenAPIRouterType } from 'chanfana';
import { Hono } from 'hono';
import {
  CreateApplicationRoute,
  CreateOAuth2AuthorizationRoute,
  DeleteApplicationRoute,
  DeleteApplicationContextDocumentsRoute,
  GetCurrentUserRoute,
  GetApplicationContextDocumentProviderLinkRoute,
  GmailWebhookRoute,
  ListApplicationContextDeletionRunsRoute,
  ListApplicationContextDocumentsRoute,
  ListApplicationsRoute,
  OAuth2CallbackRoute,
  OutlookLifecycleWebhookRoute,
  OutlookWebhookRoute,
  StartApplicationWatchRoute,
  StopApplicationWatchRoute,
  UpdateApplicationContextRoute,
  UpdateApplicationRoute,
} from '@/endpoints';
import { MiddlewareHandlers } from '@/middleware';
import { SPA_HTML } from '@/generated/spa-shell';
import { SubscriptionRenewalUtil } from '@/utils';

class MailOtterWorker extends AbstractEntrypointWorker {
  protected readonly app: HonoOpenAPIRouterType<{
    Bindings: Env;
    Variables: { AuthenticatedUserEmailAddress: string };
  }>;

  constructor() {
    super();

    const app: Hono<{
      Bindings: Env;
      Variables: { AuthenticatedUserEmailAddress: string };
    }> = new Hono<{
      Bindings: Env;
      Variables: { AuthenticatedUserEmailAddress: string };
    }>();

    app.get('/', (c) => c.redirect('/user/'));
    app.get('/user', (c) => c.redirect('/user/'));
    app.options('/user/*', (_c) => {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, cf-access-jwt-assertion',
          'Access-Control-Max-Age': '86400',
        },
      });
    });

    app.use('/user/*', MiddlewareHandlers.userAuthentication());

    const openapi: HonoOpenAPIRouterType<{
      Bindings: Env;
      Variables: { AuthenticatedUserEmailAddress: string };
    }> = fromHono(app, {
      docs_url: '/docs',
      openapi_url: '/openapi.json',
    });

    openapi.get('/user/me', GetCurrentUserRoute);
    openapi.get('/user/applications', ListApplicationsRoute);
    openapi.post('/user/application', CreateApplicationRoute);
    openapi.put('/user/application', UpdateApplicationRoute);
    openapi.delete('/user/application', DeleteApplicationRoute);
    openapi.put('/user/application/context', UpdateApplicationContextRoute);
    openapi.post('/user/application/context/delete-documents', DeleteApplicationContextDocumentsRoute);
    openapi.get('/user/application/context/documents', ListApplicationContextDocumentsRoute);
    openapi.get('/user/application/context/deletions', ListApplicationContextDeletionRunsRoute);
    openapi.get('/user/application/context/document/:contextDocumentId/provider-link', GetApplicationContextDocumentProviderLinkRoute);
    openapi.post('/user/application/oauth2/authorize', CreateOAuth2AuthorizationRoute);
    openapi.post('/user/application/watch', StartApplicationWatchRoute);
    openapi.post('/user/application/stop', StopApplicationWatchRoute);

    openapi.get('/api/oauth2/callback/:applicationId', OAuth2CallbackRoute);
    openapi.post('/api/webhooks/gmail/:applicationId', GmailWebhookRoute);
    openapi.get('/api/webhooks/outlook/:applicationId', OutlookWebhookRoute);
    openapi.post('/api/webhooks/outlook/:applicationId', OutlookWebhookRoute);
    openapi.get('/api/webhooks/outlook/lifecycle/:applicationId', OutlookLifecycleWebhookRoute);
    openapi.post('/api/webhooks/outlook/lifecycle/:applicationId', OutlookLifecycleWebhookRoute);

    app.get('/user/*', (c) => {
      return c.html(SPA_HTML);
    });

    this.app = openapi;
  }

  protected async onRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return this.app.fetch(request, env, ctx);
  }

  protected async onScheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    await SubscriptionRenewalUtil.renewDueSubscriptions(env, env.PUBLIC_BASE_URL);
  }
}

export { MailOtterWorker };
