import { CryptoUtil } from '@mail-otter/shared/utils';

class WebhookSecurityUtil {
  public static generateSecret(): string {
    const bytes: Uint8Array = crypto.getRandomValues(new Uint8Array(32));
    return this.base64UrlEncode(bytes);
  }

  public static async hashSecret(secret: string): Promise<string> {
    return CryptoUtil.sha256Hex(secret);
  }

  public static async matchesSecret(secret: string | undefined | null, expectedHash: string | undefined | null): Promise<boolean> {
    if (!secret || !expectedHash) return false;
    const actualHash: string = await this.hashSecret(secret);
    return actualHash === expectedHash;
  }

  public static base64UrlDecodeToString(value: string): string {
    const normalized: string = value.replaceAll('-', '+').replaceAll('_', '/');
    const padded: string = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    return atob(padded);
  }

  public static base64UrlEncodeString(value: string): string {
    const bytes: Uint8Array = new TextEncoder().encode(value);
    return this.base64UrlEncode(bytes);
  }

  private static base64UrlEncode(bytes: Uint8Array): string {
    let binary = '';
    bytes.forEach((byte: number): void => {
      binary += String.fromCodePoint(byte);
    });
    // btoa + URL-safe transform; Uint8Array#toBase64 not guaranteed in all Workers runtimes
     
    return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/={0,2}$/, '');
  }
}

export { WebhookSecurityUtil };
