import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetD1Bookmark } from '@/lib/api';

/**
 * The `services/` layer is a thin, uniform wrapper over `apiFetch`: each export
 * maps a caller's arguments onto a path, query, or body. The value under test is
 * that mapping, so `fetch` is stubbed and the resulting request is inspected;
 * response handling is already covered by `lib/api.test.ts`.
 *
 * These paths are the SPA's contract with the API worker. A typo here is a 404
 * in the browser and invisible to the type checker, which is why the mapping is
 * pinned explicitly rather than left to integration.
 */
const services = import.meta.glob<Record<string, unknown>>('../services/*.ts', { eager: true });

const jsonResponse = (body: unknown): Response => Response.json(body);

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetD1Bookmark();
  fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ entries: [], ok: true })));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const url = (call = 0): string => String(fetchMock.mock.calls[call]?.[0]);
const init = (call = 0): RequestInit => fetchMock.mock.calls[call]?.[1] as RequestInit;
/**
These service calls only ever send a JSON body.
*/
const bodyJson = (call = 0): unknown => JSON.parse(init(call).body as string);
// The glob erases each module's precise signatures, so the calls below are
// checked against a permissive shape. What is under test here is the
// request each service builds; the real signatures are enforced at the app's
// own import sites.
type ServiceFn = (...args: unknown[]) => unknown;
const service = (name: string): Record<string, ServiceFn> => services[`../services/${name}.ts`] as never;

describe('service module surface', () => {
  it('loads every service module', () => {
    expect(Object.keys(services).map((p) => p.split('/').pop())).toEqual([
      'actionService.ts',
      'activityService.ts',
      'analyticsService.ts',
      'applicationService.ts',
      'chatService.ts',
      'contextService.ts',
      'processingService.ts',
      'userService.ts',
    ]);
  });
});

describe('userService', () => {
  it('reads the current user', async () => {
    await service('userService').loadCurrentUser();
    expect(url()).toBe('/user/me');
    expect(init()?.method).toBeUndefined();
  });

  it('writes the preferred language as a PUT body', async () => {
    await service('userService').updatePreferredLanguage('pt-BR');
    expect(url()).toBe('/user/me');
    expect(init()?.method).toBe('PUT');
    expect(init()?.body).toBe('{"preferredLanguage":"pt-BR"}');
  });
});

describe('activityService', () => {
  it('stringifies a numeric limit and forwards the cursor', async () => {
    await service('activityService').loadActivity({ limit: 25, cursor: 'abc' });
    expect(url()).toContain('limit=25');
    expect(url()).toContain('cursor=abc');
  });

  it('omits an absent limit instead of sending "undefined"', async () => {
    await service('activityService').loadActivity({});
    expect(url()).not.toContain('limit');
  });

  it('repeats the types parameter once per value', async () => {
    await service('activityService').loadActivity({ types: ['action_created', 'action_executed'] });
    expect(url().match(/types=/g)).toHaveLength(2);
  });
});

describe('actionService', () => {
  it('targets the actions collection', async () => {
    await service('actionService').loadActions({});
    expect(url().startsWith('/user/actions')).toBe(true);
  });

  it('addresses a single action for execution', async () => {
    await service('actionService').executeAction('action-1');
    expect(url()).toBe('/user/actions/action-1/execute');
    expect(init()?.method).toBe('POST');
  });

  it('addresses a single action for snooze', async () => {
    await service('actionService').snoozeAction('action-1', '2026-01-01T00:00:00.000Z');
    expect(url()).toBe('/user/actions/action-1/snooze');
    expect(init()?.body).toContain('snoozedUntil');
  });
});

describe('chatService', () => {
  it('posts the question with its history', async () => {
    await service('chatService').sendChatMessage({ query: 'what came in?', history: [] });
    expect(url()).toBe('/user/chat');
    expect(init()?.method).toBe('POST');
    expect(bodyJson()).toEqual({ query: 'what came in?', history: [] });
  });
});

describe('analyticsService', () => {
  it('passes the day window as a clamped query', async () => {
    await service('analyticsService').loadAnalytics(30);
    expect(url().startsWith('/user/analytics')).toBe(true);
    expect(url()).toContain('days=30');
  });
});

describe('processingService', () => {
  it('reads task runs', async () => {
    await service('processingService').loadTaskRuns({});
    expect(url().startsWith('/user/processing/task-runs')).toBe(true);
  });

  it('triggers a task run by POSTing the type and application', async () => {
    await service('processingService').triggerTaskRun('calendar_sync', 'app-1');
    expect(url()).toBe('/user/processing/run-task');
    expect(init()?.method).toBe('POST');
    expect(bodyJson()).toEqual({ taskType: 'calendar_sync', applicationId: 'app-1' });
  });
});
