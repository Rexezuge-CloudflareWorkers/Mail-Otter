import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseUrlUtil } from '@mail-otter/shared/utils';
import { VoidUtil } from '@mail-otter/shared/utils';

describe('BaseUrlUtil', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns protocol and host from request URL', () => {
    const request = new Request('https://example.com/api/webhooks/gmail/abc123?token=xyz');
    const result = BaseUrlUtil.getBaseUrl(request);
    expect(result).toBe('https://example.com');
  });

  it('handles http protocol', () => {
    const request = new Request('http://localhost:8787/some/path');
    const result = BaseUrlUtil.getBaseUrl(request);
    expect(result).toBe('http://localhost:8787');
  });
});

describe('VoidUtil', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns undefined when called with no arguments', () => {
    expect(VoidUtil.void()).toBeUndefined();
  });

  it('returns undefined when called with arguments', () => {
    expect(VoidUtil.void('anything', 42, { key: 'value' })).toBeUndefined();
  });
});
