import { AbstractEntrypointWorker } from '@mail-otter/backend-runtime/base';
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
import { DURABLE_OBJECT_CRON_TASKS_RUN_URL, DURABLE_OBJECT_NAMESPACE_GLOBAL } from '@mail-otter/backend-runtime/constants';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';

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

    app.get('*', (c) => {
      const path: string = new URL(c.req.url).pathname;
      if (!path.startsWith('/user/')) {
        return c.notFound();
      }
      if (!ConfigurationManager.getServeSpaFromWorker(c.env)) {
        return c.notFound();
      }
      return c.html(SPA_HTML);
    });

    this.app = openapi;
  }

  protected async onRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return this.app.fetch(request, env, ctx);
  }

  protected async onScheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const cronTasksId: DurableObjectId = env.CRON_TASKS.idFromName(DURABLE_OBJECT_NAMESPACE_GLOBAL);
    const cronTasksStub = env.CRON_TASKS.get(cronTasksId);
    const cronTasksRequest: Request = new Request(DURABLE_OBJECT_CRON_TASKS_RUN_URL, {
      method: 'POST',
      body: JSON.stringify({
        cron: event.cron,
        scheduledTime: event.scheduledTime,
      }),
    });

    ctx.waitUntil(
      cronTasksStub
        .fetch(cronTasksRequest)
        .then(async (response: Response): Promise<void> => {
          if (!response.ok && response.status !== 202) {
            console.error('CronTasksWorker returned an error response:', response.status, await response.text());
          }
        })
        .catch((error: unknown): void => {
          console.error('Failed to invoke CronTasksWorker:', error);
        }),
    );
  }
}

export { MailOtterWorker };
