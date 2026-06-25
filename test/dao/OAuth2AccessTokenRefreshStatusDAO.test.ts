import { describe, expect, it, vi } from 'vitest';
import { OAuth2AccessTokenRefreshStatusDAO } from '@mail-otter/backend-data/dao';
import { CONNECTED_APPLICATION_STATUS_CONNECTED, CONNECTION_METHOD_OAUTH2 } from '@mail-otter/shared/constants';

function createStatement(rows: unknown[] = [], firstRow: unknown = null) {
  const statement = {
    bind: vi.fn(() => statement),
    run: vi.fn(async () => ({ success: true })),
    first: vi.fn(async () => firstRow),
    all: vi.fn(async () => ({ results: rows })),
  };
  return statement;
}

describe('OAuth2AccessTokenRefreshStatusDAO', () => {
  it('lists connected OAuth2 applications due for token refresh', async () => {
    const statement = createStatement([{ application_id: 'app-1' }, { application_id: 'app-2' }]);
    const database = {
      prepare: vi.fn(() => statement),
    } as unknown as D1Database;
    const dao = new OAuth2AccessTokenRefreshStatusDAO(database);

    const applicationIds: string[] = await dao.listDueApplicationIds(1_778_200_000, 25);

    expect(applicationIds).toEqual(['app-1', 'app-2']);
    expect(statement.bind).toHaveBeenCalledWith(CONNECTION_METHOD_OAUTH2, CONNECTED_APPLICATION_STATUS_CONNECTED, 1_778_200_000, 25);
    expect(database.prepare).toHaveBeenCalledWith(expect.stringContaining('LEFT JOIN oauth2_access_token_refresh_status'));
  });

  it('records successful refresh metadata without storing access tokens', async () => {
    const statement = createStatement();
    const database = {
      prepare: vi.fn(() => statement),
    } as unknown as D1Database;
    const dao = new OAuth2AccessTokenRefreshStatusDAO(database);

    await dao.recordRefreshSuccess('app-1', 1_778_200_000);

    expect(database.prepare).toHaveBeenCalledWith(expect.not.stringContaining('access_token TEXT'));
    expect(statement.bind).toHaveBeenCalledWith('app-1', 1_778_200_000, expect.any(Number), expect.any(Number), expect.any(Number));
  });
});
