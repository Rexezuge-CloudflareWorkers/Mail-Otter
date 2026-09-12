import { describe, expect, it, vi } from 'vitest';

vi.mock('@mail-otter/shared/schema', () => ({
  validateRequestInput: vi.fn().mockResolvedValue({ success: true, data: {} }),
}));

import { IBaseRoute } from '../../apps/api/src/endpoints/IBaseRoute';
import { NotFoundError } from '@mail-otter/backend-errors';

describe('IBaseRoute typed errors', () => {
  class MissingRoute extends IBaseRoute<{ raw: Request }, { ok: boolean }, Record<string, unknown>> {
    async handleRequest(): Promise<{ ok: boolean }> {
      throw new NotFoundError('Connected application was not found.');
    }
  }

  function makeC() {
    return {
      req: {
        raw: new Request('https://example.com/missing', { method: 'GET' }),
        json: vi.fn().mockResolvedValue({}),
      } as unknown,
      json: vi.fn().mockReturnValue(new Response()),
      status: vi.fn(),
      header: vi.fn(),
      body: vi.fn(),
      env: {},
    };
  }

  it('maps NotFoundError to HTTP 404 with its type', async () => {
    const route = new MissingRoute();
    const c = makeC();
    await route.handle(c as never);
    expect(c.json).toHaveBeenCalledWith(
      { Exception: { Type: 'NotFound', Message: 'Connected application was not found.' } },
      404,
    );
  });
});
