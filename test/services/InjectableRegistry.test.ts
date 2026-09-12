import { describe, expect, it } from 'vitest';
import { InjectableEmailProviderRegistry } from '@mail-otter/backend-services/provider';
import { EmailProviderRegistry } from '@mail-otter/backend-services/provider';

describe('InjectableEmailProviderRegistry', () => {
  it('withDefaults() resolves the same providers as the static registry', () => {
    const registry = InjectableEmailProviderRegistry.withDefaults();
    expect(registry.resolve('google-gmail').providerId).toBe(
      EmailProviderRegistry.get('google-gmail').providerId,
    );
    expect(registry.resolve('google-gmail', 'imap-password').providerId).toBe(
      EmailProviderRegistry.get('google-gmail', 'imap-password').providerId,
    );
  });

  it('withOverrides() substitutes providers for hermetic tests', () => {
    const stub = EmailProviderRegistry.get('google-gmail');
    const registry = InjectableEmailProviderRegistry.withOverrides({ 'custom-test': stub });
    expect(registry.resolve('custom-test')).toBe(stub);
  });

  it('throws BadRequest for unknown providers', () => {
    expect(() => InjectableEmailProviderRegistry.withDefaults().resolve('nope')).toThrow('Unsupported provider');
  });

  it('exposes the full provider map', () => {
    expect(InjectableEmailProviderRegistry.withDefaults().getAll().size).toBeGreaterThan(5);
  });
});
