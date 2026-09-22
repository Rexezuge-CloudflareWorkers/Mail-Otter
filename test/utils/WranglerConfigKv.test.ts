import { parse } from 'jsonc-parser';
import { describe, expect, it } from 'vitest';
import { ensureRequiredKvBindings, getRequiredKvBindings } from '../../scripts/prepare-wrangler-config';

const PLACEHOLDER_ID = '00000000000000000000000000000000';

describe('ensureRequiredKvBindings', () => {
  it('requires the OAUTH2_TOKEN_CACHE binding', () => {
    expect(getRequiredKvBindings()).toContain('OAUTH2_TOKEN_CACHE');
  });

  it('injects kv_namespaces when the section is missing', () => {
    const content = JSON.stringify({ name: 'mail-otter' }, null, 2);
    const output = ensureRequiredKvBindings(content, parse(content));
    const config = parse(output) as { kv_namespaces?: Array<{ binding?: string; id?: string }> };
    expect(config.kv_namespaces).toEqual([{ binding: 'OAUTH2_TOKEN_CACHE', id: PLACEHOLDER_ID }]);
  });

  it('appends the missing binding while preserving existing entries', () => {
    const content = JSON.stringify({ kv_namespaces: [{ binding: 'OTHER', id: 'abc' }] }, null, 2);
    const output = ensureRequiredKvBindings(content, parse(content));
    const config = parse(output) as { kv_namespaces?: Array<{ binding?: string; id?: string }> };
    expect(config.kv_namespaces).toEqual([
      { binding: 'OTHER', id: 'abc' },
      { binding: 'OAUTH2_TOKEN_CACHE', id: PLACEHOLDER_ID },
    ]);
  });

  it('leaves configs with a provisioned entry untouched', () => {
    const content = JSON.stringify({ kv_namespaces: [{ binding: 'OAUTH2_TOKEN_CACHE', id: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4' }] }, null, 2);
    expect(ensureRequiredKvBindings(content, parse(content))).toBe(content);
  });
});
