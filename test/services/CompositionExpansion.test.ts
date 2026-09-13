import { describe, expect, it, vi } from 'vitest';
import { Tokens, createRequestScope } from '@mail-otter/backend-services/composition';
import { ActionService } from '@mail-otter/backend-services/action';
import { ChatService } from '@mail-otter/backend-services/chat';
import { ProcessingService } from '@mail-otter/backend-services/processing';
import { DigestService } from '@mail-otter/backend-services/digest';
import { AiService } from '@mail-otter/backend-services/ai';

function makeEnv() {
  return {
    DB: {},
    AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('master') },
    ACTION_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('action') },
  };
}

describe('composition expansion', () => {
  it('resolves new service tokens as per-scope singletons', () => {
    const scope = createRequestScope(makeEnv() as never);
    expect(scope.get(Tokens.ActionService)).toBeInstanceOf(ActionService);
    expect(scope.get(Tokens.ActionService)).toBe(scope.get(Tokens.ActionService));
    expect(scope.get(Tokens.ChatService)).toBeInstanceOf(ChatService);
    expect(scope.get(Tokens.ProcessingService)).toBeInstanceOf(ProcessingService);
    expect(scope.get(Tokens.DigestService)).toBeInstanceOf(DigestService);
    expect(scope.get(Tokens.AiService)).toBeInstanceOf(AiService);
    expect(scope.get(Tokens.ActionHandlerRegistry).getHandlers().size).toBeGreaterThan(0);
    expect(scope.get(Tokens.IntegrationObserverRegistry).getObservers().size).toBe(3);
    expect(scope.get(Tokens.AppConfig).getMaxApplicationsPerUser()).toBeGreaterThan(0);
  });

  it('ActionService uses the injected DAO', async () => {
    const dao = {
      listActionsForUser: vi.fn().mockResolvedValue({ actions: [] }),
      listExecutionsForUser: vi.fn().mockResolvedValue({ executions: [] }),
    };
    const svc = new ActionService({ actionDAO: async () => dao as never });
    await expect(svc.listActionsForUser('u@x', {}, {} as never)).resolves.toEqual({ actions: [] });
    await expect(svc.listExecutionsForUser('a1', 'u@x', {} as never)).resolves.toEqual({ executions: [] });
  });

  it('ProcessingService uses injected DAOs without secrets', async () => {
    const svc = new ProcessingService({ DB: {} } as never, {
      taskRunDAO: async () => ({ listForUser: vi.fn().mockResolvedValue({ runs: [] }) }) as never,
      calendarEventDAO: async () => ({ listForUser: vi.fn().mockResolvedValue({ events: [] }) }) as never,
      processedMessageDAO: async () => ({ listForUser: vi.fn().mockResolvedValue({ messages: [] }) }) as never,
    });
    await expect(svc.listTaskRuns('u@x', {})).resolves.toEqual({ runs: [] });
    await expect(svc.listCalendarEvents('u@x', {})).resolves.toEqual({ events: [] });
    await expect(svc.listProcessedMessages('u@x', {})).resolves.toEqual({ messages: [] });
  });
});
