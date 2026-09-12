import { describe, expect, it, vi } from 'vitest';
import { EmailPipelineFactory } from '@mail-otter/backend-services/email';
import { EmailPipelineOrchestrator } from '@mail-otter/backend-services/email';

describe('EmailPipelineFactory', () => {
  it('builds an orchestrator without duplicating wiring at call sites', () => {
    const db = { prepare: vi.fn() };
    const factory = new EmailPipelineFactory(db as never);
    const orchestrator = factory.create({} as never, ['app-1']);
    expect(orchestrator).toBeInstanceOf(EmailPipelineOrchestrator);
  });

  it('creates independent orchestrators per call', () => {
    const factory = new EmailPipelineFactory({ prepare: vi.fn() } as never);
    expect(factory.create({} as never, [])).not.toBe(factory.create({} as never, []));
  });
});
