import { MailOtterWorker } from '@/workers';
import { describe, expect, it, vi } from 'vitest';

const executionContext: ExecutionContext = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
  props: {},
};

describe('MailOtterWorker', () => {
  it('redirects root visits to the user console', async () => {
    const worker = new MailOtterWorker();

    const response = await worker.fetch(new Request('https://mail.example.com/'), {} as Env, executionContext);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/user/');
  });
});
