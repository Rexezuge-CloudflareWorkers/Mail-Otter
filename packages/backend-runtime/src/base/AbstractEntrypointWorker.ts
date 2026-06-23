abstract class AbstractEntrypointWorker {
  public async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url: URL = new URL(request.url);
    if ('/__scheduled' === url.pathname) {
      await this.scheduled(
        {
          cron: url.searchParams.get('cron') || '',
          scheduledTime: Date.now(),
          noRetry: (): void => undefined,
        },
        env,
        ctx,
      );
      return new Response(null, { status: 204 });
    }

    try {
      return await this.onRequest(request, env, ctx);
    } catch (err: unknown) {
      console.error('Unhandled error in fetch():', err);
      return new Response('Internal Error', { status: 500 });
    }
  }

  public async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
      await this.onScheduled(event, env, ctx);
    } catch (err: unknown) {
      console.error('Unhandled error in scheduled():', err);
    }
  }

  protected abstract onRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>;

  protected abstract onScheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void>;
}

export { AbstractEntrypointWorker };
