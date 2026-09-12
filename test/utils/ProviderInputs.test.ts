import { describe, expect, it } from 'vitest';
import {
  filterImageAttachments,
  isProviderNotFoundError,
  isSupportedImageMimeType,
  normalizeImageAttachmentFilter,
} from '@mail-otter/provider-clients';

describe('ProviderInputs', () => {
  it('normalizes attachment filters with a default count', () => {
    expect(normalizeImageAttachmentFilter({ maxSizeBytes: 100 })).toEqual({ maxCount: 5, maxSizeBytes: 100 });
    expect(normalizeImageAttachmentFilter({ maxSizeBytes: 100, maxCount: 2 })).toEqual({ maxCount: 2, maxSizeBytes: 100 });
  });

  it('matches supported image MIME types case-insensitively', () => {
    expect(isSupportedImageMimeType('image/PNG')).toBe(true);
    expect(isSupportedImageMimeType('application/pdf')).toBe(false);
  });

  it('filters candidates by type, size, and count', () => {
    const candidates = [
      { filename: 'a.png', mimeType: 'image/png', base64Data: 'x', sizeBytes: 10 },
      { filename: 'b.pdf', mimeType: 'application/pdf', base64Data: 'x', sizeBytes: 10 },
      { filename: 'c.png', mimeType: 'image/png', base64Data: 'x', sizeBytes: 999 },
      { filename: 'd.png', mimeType: 'image/png', base64Data: 'x', sizeBytes: 10 },
    ];
    const selected = filterImageAttachments(candidates, { maxSizeBytes: 100, maxCount: 1 });
    expect(selected.map((a) => a.filename)).toEqual(['a.png']);
  });

  it('detects provider not-found errors across Gmail/Outlook shapes', () => {
    expect(isProviderNotFoundError(new Error('Gmail request failed (404): nope'))).toBe(true);
    expect(isProviderNotFoundError(new Error('ErrorItemNotFound'))).toBe(true);
    expect(isProviderNotFoundError(new Error('ResourceNotFound'))).toBe(true);
    expect(isProviderNotFoundError(new Error('Request failed (429): slow down'))).toBe(false);
    expect(isProviderNotFoundError('nope')).toBe(false);
  });
});
