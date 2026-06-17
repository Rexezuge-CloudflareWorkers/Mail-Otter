import { describe, expect, it } from 'vitest';
import { ConfigurationManager } from '../../packages/backend-runtime/src/config/ConfigurationManager';

describe('ConfigurationManager', () => {
  it('uses the extended default expiry for action callback tokens', () => {
    expect(ConfigurationManager.getActionDefaultExpiryHours({})).toBe(720);
  });
});
