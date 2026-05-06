import { AbstractEntrypointWorker } from '@/base';
import { fromHono, HonoOpenAPIRouterType } from 'chanfana';
import { Hono } from 'hono';
import {
  CreateApplicationRoute,
  CreateOAuth2AuthorizationRoute,
  DeleteApplicationRoute,
  GetCurrentUserRoute,
  GmailWebhookRoute,
  ListApplicationsRoute,
  OAuth2CallbackRoute,
  OutlookLifecycleWebhookRoute,
  OutlookWebhookRoute,
  StartApplicationWatchRoute,
  StopApplicationWatchRoute,
  UpdateApplicationRoute,
} from '@/endpoints';
import { MiddlewareHandlers } from '@/middleware';
import { SPA_HTML } from '@/generated/spa-shell';
import { EmailProcessingUtil, SubscriptionRenewalUtil } from '@/utils';
import type { EmailQueueMessage } from '@mail-otter/shared/model';

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

  protected async onQueue(batch: MessageBatch<unknown>, env: Env, _ctx: ExecutionContext): Promise<void> {
    for (const message of batch.messages) {
      try {
        await EmailProcessingUtil.processQueueMessage(message.body as EmailQueueMessage, env);
        message.ack();
      } catch (error: unknown) {
        console.error('Failed to process email event queue message:', error);
        message.retry();
      }
    }
  }
}

export { MailOtterWorker };
