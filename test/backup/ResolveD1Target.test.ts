import { describe, expect, it } from 'vitest';
import { DEFAULT_UUID } from '../../scripts/lib/wrangler-config/types';
import { resolveD1Target } from '../../scripts/backup/d1-target';

const REAL_ID = '11111111-2222-3333-4444-555555555555';

describe('resolveD1Target', () => {
  it('exports by database name, which is what `wrangler d1 export` accepts', () => {
    const target = resolveD1Target({
      d1_databases: [{ binding: 'DB', database_name: 'mail-otter-db', database_id: REAL_ID }],
    });

    expect(target).toEqual({ binding: 'DB', databaseId: REAL_ID, target: 'mail-otter-db' });
  });

  it('falls back to the binding when a hand-written config omits database_name', () => {
    expect(resolveD1Target({ d1_databases: [{ binding: 'DB', database_id: REAL_ID }] }).target).toBe('DB');
  });

  it('rejects a config with no d1_databases entry', () => {
    expect(() => resolveD1Target({})).toThrow(/No d1_databases entry/);
    expect(() => resolveD1Target({ d1_databases: [{ database_id: REAL_ID }] })).toThrow(/binding/);
  });

  it('refuses to back up a database prepare-wrangler-config just created', () => {
    expect(() =>
      resolveD1Target({
        d1_databases: [{ binding: 'DB', database_name: 'mail-otter-db', database_id: DEFAULT_UUID }],
      }),
    ).toThrow(/still the template placeholder/);
  });

  it('accepts a config whose database_id is absent, leaving verification to wrangler', () => {
    expect(resolveD1Target({ d1_databases: [{ binding: 'DB' }] }).databaseId).toBe('');
  });
});
