import { AbstractEntrypointWorker } from '@mail-otter/backend-runtime/base';
import { fromHono, HonoOpenAPIRouterType } from 'chanfana';
import { Hono } from 'hono';
import { MiddlewareHandlers } from '@/middleware';
import { allRoutes } from '@/endpoints/routeTable';
import { SPA_HTML } from '@/generated/spa-shell';
import { DURABLE_OBJECT_CRON_TASKS_RUN_URL, DURABLE_OBJECT_NAMESPACE_GLOBAL } from '@mail-otter/backend-runtime/constants';
import { createD1SessionEnv } from '@mail-otter/backend-data/utils';
import { logError } from '@mail-otter/shared/utils';

const D1_BOOKMARK_HEADER: string = 'x-d1-bookmark';

/**
 * Context variables set by the Cloudflare Access middleware.
 *
 * The id is the identity; the current address is what the user sees; the anchor is
 * the frozen value legacy `*_email` columns and the Vectorize namespace hold.
 */
interface AuthenticatedUserVariables {
  AuthenticatedUserId: string;
  AuthenticatedUserEmailAddress: string;
  AuthenticatedUserAnchorEmail: string;
}

type AppRouter = HonoOpenAPIRouterType<{
  Bindings: Env;
  Variables: AuthenticatedUserVariables;
}>;

class MailOtterWorker extends AbstractEntrypointWorker {
  protected readonly app: AppRouter;

  constructor() {
    super();

    const app: Hono<{
      Bindings: Env;
      Variables: AuthenticatedUserVariables;
    }> = new Hono<{
      Bindings: Env;
      Variables: AuthenticatedUserVariables;
    }>();

    app.get('/', (c) => c.redirect('/user/'));
    app.get('/user', (c) => c.redirect('/user/' + new URL(c.req.url).search));
    app.options('/user/*', (_c) => {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': `Content-Type, Authorization, cf-access-jwt-assertion, ${D1_BOOKMARK_HEADER}`,
          'Access-Control-Expose-Headers': D1_BOOKMARK_HEADER,
          'Access-Control-Max-Age': '86400',
        },
      });
    });

    app.use('/user/*', MiddlewareHandlers.userAuthentication());

    const openapi: AppRouter = fromHono(app, {
      docs_url: '/docs',
      openapi_url: '/openapi.json',
    });

    this.registerRoutes(openapi);

    app.get('*', (c) => {
      const path: string = new URL(c.req.url).pathname;
      return path.startsWith('/user/') ? c.html(SPA_HTML) : c.notFound();
    });

    this.app = openapi;
  }

  /**
   * Register every route in the declarative table.
   *
   * Keeping this as data (`endpoints/routeTable.ts`) rather than three blocks
   * of `openapi.get(path, Class)` lets `test/schema` assert that every served
   * route has an input schema registered, which the old imperative form made
   * impossible to check.
   */
  private registerRoutes(openapi: AppRouter): void {
    for (const { method, path, handler } of allRoutes) {
      openapi[method](path, handler);
    }
  }

  protected async onRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const path: string = new URL(request.url).pathname;
    if (!MailOtterWorker.shouldUseD1Session(path, env)) {
      return this.app.fetch(request, env, ctx);
    }

    const isUserRequest: boolean = path.startsWith('/user/');
    const incomingBookmark: string | undefined = isUserRequest ? request.headers.get(D1_BOOKMARK_HEADER)?.trim() || undefined : undefined;
    const sessionEnv = createD1SessionEnv(env, incomingBookmark || 'first-primary');
    const response: Response = await this.app.fetch(request, sessionEnv, ctx);
    if (isUserRequest) {
      const bookmark: D1SessionBookmark | null = sessionEnv.DB.getBookmark();
      if (bookmark) {
        response.headers.set(D1_BOOKMARK_HEADER, bookmark);
      }
      response.headers.set('Access-Control-Expose-Headers', D1_BOOKMARK_HEADER);
    }
    return response;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
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
            logError('error', `CronTasksWorker returned an error response (status ${response.status})`, await response.text());
          }
        })
        .catch((error: unknown): void => {
          logError('error', 'Failed to invoke CronTasksWorker', error);
        }),
    );
  }

  private static shouldUseD1Session(path: string, env: Env): boolean {
    if (!path.startsWith('/user/') && !path.startsWith('/api/')) {
      return false;
    }
    const database = (env as { DB?: { withSession?: unknown } }).DB;
    return typeof database?.withSession === 'function';
  }
}

export { MailOtterWorker };
