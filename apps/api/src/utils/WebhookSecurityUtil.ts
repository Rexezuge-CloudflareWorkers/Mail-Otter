import { CryptoUtil } from '@mail-otter/shared/utils';

class WebhookSecurityUtil {
  public static generateSecret(): string {
    const bytes: Uint8Array = crypto.getRandomValues(new Uint8Array(32));
    return WebhookSecurityUtil.base64UrlEncode(bytes);
  }

  public static async hashSecret(secret: string): Promise<string> {
    return CryptoUtil.sha256Hex(secret);
  }

  public static async matchesSecret(secret: string | undefined | null, expectedHash: string | undefined | null): Promise<boolean> {
    if (!secret || !expectedHash) return false;
    const actualHash: string = await WebhookSecurityUtil.hashSecret(secret);
    return actualHash === expectedHash;
  }

  public static base64UrlDecodeToString(value: string): string {
    const normalized: string = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded: string = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    return atob(padded);
  }

  public static base64UrlEncodeString(value: string): string {
    const bytes: Uint8Array = new TextEncoder().encode(value);
    return WebhookSecurityUtil.base64UrlEncode(bytes);
  }

  private static base64UrlEncode(bytes: Uint8Array): string {
    let binary = '';
    bytes.forEach((byte: number): void => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
}

export { WebhookSecurityUtil };
