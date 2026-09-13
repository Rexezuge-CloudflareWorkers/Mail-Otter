import { describe, expect, it, vi } from 'vitest';
import { Tokens, createRequestScope } from '@mail-otter/backend-services/composition';
import { ApplicationService } from '@mail-otter/backend-services/application';
import { ContextService } from '@mail-otter/backend-services/email';
import { Container } from '@mail-otter/backend-runtime/di';

function makeEnv() {
  return {
    DB: {},
    AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('master') },
    ACTION_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('action') },
  };
}

describe('createRequestScope', () => {
  it('wires services as per-scope singletons', () => {
    const scope = createRequestScope(makeEnv() as never);
    expect(scope.get(Tokens.ApplicationService)).toBe(scope.get(Tokens.ApplicationService));
    expect(scope.get(Tokens.ContextService)).toBeInstanceOf(ContextService);
    expect(scope.get(Tokens.ApplicationService)).toBeInstanceOf(ApplicationService);
  });

  it('memoizes secret-derived DAO factories', async () => {
    const env = makeEnv();
    const scope = createRequestScope(env as never);
    const factory = scope.get(Tokens.ApplicationDAO) as () => Promise<unknown>;
    const first = await factory();
    await expect(factory()).resolves.toBe(first);
    expect(env.AES_ENCRYPTION_KEY_SECRET.get).toHaveBeenCalledTimes(1);
  });

  it('resolves keys lazily without upfront secret fetches', async () => {
    const env = makeEnv();
    createRequestScope(env as never);
    expect(env.AES_ENCRYPTION_KEY_SECRET.get).not.toHaveBeenCalled();
  });

  it('shares one container child per scope without leaking singletons', () => {
    const env = makeEnv() as never;
    const first = createRequestScope(env);
    const second = createRequestScope(env);
    expect(first).not.toBe(second);
    expect(first).toBeInstanceOf(Container);
    expect(second.get(Tokens.UserService)).not.toBe(first.get(Tokens.UserService));
  });
});

describe('constructor injection without module mocks', () => {
  it('ApplicationService uses the injected DAO', async () => {
    const fakeDAO = { getMetadataByIdForUser: vi.fn().mockResolvedValue({ applicationId: 'app-1' }) };
    const svc = new ApplicationService({ DB: {} } as never, { applicationDAO: async () => fakeDAO as never });
    const app = await svc.getOwnedApplication('u@x', 'app-1');
    expect(app).toEqual({ applicationId: 'app-1' });
    expect(fakeDAO.getMetadataByIdForUser).toHaveBeenCalledWith('app-1', 'u@x');
  });

  it('ContextService uses the injected DAO', async () => {
    const fakeDAO = { listDocumentsForUser: vi.fn().mockResolvedValue({ documents: [] }) };
    const svc = new ContextService({ DB: {} } as never, { contextDAO: async () => fakeDAO as never });
    await expect(svc.listDocuments('u@x', {})).resolves.toEqual({ documents: [] });
  });
});
