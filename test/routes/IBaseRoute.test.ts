import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@mail-otter/shared/schema', () => ({
  validateRequestInput: vi.fn(),
}));

import { IBaseRoute } from '../../apps/api/src/endpoints/IBaseRoute';
import { validateRequestInput } from '@mail-otter/shared/schema';
import { DatabaseError } from '@rexezuge/errors';

describe('IBaseRoute', () => {
  class TestRoute extends IBaseRoute<{ raw: Request }, { message: string }, Record<string, unknown>> {
    async handleRequest(request: { raw: Request }, _env: Record<string, unknown>): Promise<{ message: string }> {
      return { message: `Hello ${request.raw.url}` };
    }
  }

  let route: TestRoute;

  beforeEach(() => {
    vi.clearAllMocks();
    route = new TestRoute();
  });

  function makeC(path: string) {
    return {
      req: {
        raw: new Request(`https://example.com${path}`),
        json: vi.fn().mockResolvedValue({}),
      } as unknown,
      json: vi.fn().mockReturnValue(new Response()),
      status: vi.fn(),
      header: vi.fn(),
      body: vi.fn(),
      env: {},
    } as ReturnType<typeof makeC>;
  }

  it('handles valid request and returns JSON response', async () => {
    (validateRequestInput as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: {} });

    const c = makeC('/test');
    await route.handle(c as never);

    expect(c.json).toHaveBeenCalledWith({ message: 'Hello https://example.com/test' });
  });

  it('handles JSON parse error by falling back to empty body', async () => {
    (validateRequestInput as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: {} });

    const c = makeC('/test');
    (c.req as { json: ReturnType<typeof vi.fn> }).json = vi.fn().mockRejectedValue(new Error('Invalid JSON'));

    await route.handle(c as never);
    expect(c.json).toHaveBeenCalled();
  });

  it('returns validation error when validation fails', async () => {
    (validateRequestInput as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: 'Invalid input',
    });

    const c = makeC('/test');
    await route.handle(c as never);

    expect(c.json).toHaveBeenCalledWith({ Exception: { Type: 'BadRequest', Message: 'Invalid input' } }, 400);
  });

  it('masks the message of a 5xx DatabaseError', async () => {
    (validateRequestInput as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: {} });

    vi.spyOn(route, 'handleRequest' as never).mockRejectedValue(new DatabaseError('Database error occurred'));

    const c = makeC('/test');
    await route.handle(c as never);

    // The taxonomy's `expose` rule: a 5xx message is for operators. This test
    // previously asserted the opposite — that `Database error occurred` reached
    // the client — which is the leak. A `DatabaseError` carries the failing D1
    // context in its message, so shipping it verbatim put storage internals on
    // the wire.
    expect(c.json).toHaveBeenCalledWith(
      {
        Exception: {
          Type: 'DatabaseError',
          Message: 'The server encountered an internal error and was unable to complete your request.',
        },
      },
      500,
    );
  });

  it('returns InternalError for unexpected errors', async () => {
    (validateRequestInput as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: {} });

    vi.spyOn(route, 'handleRequest' as never).mockRejectedValue(new Error('Unexpected'));

    const c = makeC('/test');
    await route.handle(c as never);

    // `ServiceError.from` wraps an untyped throw as `InternalError`, rather than
    // the old mapper substituting the `DefaultInternalServerError` *singleton*.
    // The status and the masked message are unchanged; only the reported type
    // differs, and it now names the wrap rather than the class it substitutes.
    expect(c.json).toHaveBeenCalledWith(
      {
        Exception: {
          Type: 'InternalError',
          Message: 'The server encountered an internal error and was unable to complete your request.',
        },
      },
      500,
    );
  });

  it('handles ExtendedResponse with status code and headers', async () => {
    (validateRequestInput as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: {} });

    vi.spyOn(route, 'handleRequest' as never).mockResolvedValue({
      body: { message: 'redirected' },
      statusCode: 302,
      headers: { Location: '/new' },
    });

    const c = makeC('/test');
    await route.handle(c as never);

    expect(c.status).toHaveBeenCalledWith(302);
    expect(c.header).toHaveBeenCalledWith('Location', '/new');
  });

  it('handles ExtendedResponse with rawBody', async () => {
    (validateRequestInput as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: {} });

    vi.spyOn(route, 'handleRequest' as never).mockResolvedValue({
      rawBody: 'raw data' as never,
      statusCode: 200,
    });

    const c = makeC('/test');
    await route.handle(c as never);

    expect(c.body).toHaveBeenCalledWith('raw data');
  });

  it('handles redirect status code with null body', async () => {
    (validateRequestInput as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: {} });

    vi.spyOn(route, 'handleRequest' as never).mockResolvedValue({
      statusCode: 301,
      headers: { Location: '/new' },
    });

    const c = makeC('/test');
    await route.handle(c as never);

    expect(c.body).toHaveBeenCalledWith(null);
    expect(c.json).not.toHaveBeenCalled();
  });
});
