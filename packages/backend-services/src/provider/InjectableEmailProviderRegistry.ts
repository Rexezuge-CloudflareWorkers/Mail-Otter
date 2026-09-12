import { BadRequestError } from '@mail-otter/backend-errors';
import type { IEmailProvider, ProviderMap } from './EmailProviderRegistry';
import { createEmailProviderRegistry, getEmailProviderRegistryKey } from './EmailProviderRegistry';

/**
 * Injectable (non-static) provider registry.
 *
 * The static `EmailProviderRegistry` holds module-level singletons which
 * cannot be substituted in tests. New code should accept this class via
 * constructor injection; `withDefaults()` preserves the production wiring
 * and `withOverrides()` enables hermetic unit tests.
 */
class InjectableEmailProviderRegistry {
  private readonly providers: ProviderMap;

  constructor(providers?: ProviderMap) {
    this.providers = providers ?? createEmailProviderRegistry();
  }

  public static withDefaults(): InjectableEmailProviderRegistry {
    return new InjectableEmailProviderRegistry(createEmailProviderRegistry());
  }

  public static withOverrides(
    overrides: ReadonlyMap<string, IEmailProvider> | Readonly<Record<string, IEmailProvider>>,
  ): InjectableEmailProviderRegistry {
    return new InjectableEmailProviderRegistry(createEmailProviderRegistry(overrides));
  }

  public resolve(providerId: string, connectionMethod?: string): IEmailProvider {
    const specific = connectionMethod ? this.providers.get(getEmailProviderRegistryKey(providerId, connectionMethod)) : undefined;
    const provider = specific ?? this.providers.get(providerId);
    if (!provider) throw new BadRequestError(`Unsupported provider: ${providerId}`);
    return provider;
  }

  public getAll(): ProviderMap {
    return this.providers;
  }
}

export { InjectableEmailProviderRegistry };
