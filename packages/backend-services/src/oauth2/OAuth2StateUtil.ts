import { CryptoUtil } from '@mail-otter/shared/utils';

class OAuth2StateUtil {
  public static generateState(): string {
    return CryptoUtil.randomBase64Url(32);
  }

  public static generateCodeVerifier(): string {
    return CryptoUtil.randomBase64Url(64);
  }

  public static async getStateHash(state: string): Promise<string> {
    return CryptoUtil.sha256Hex(state);
  }

  public static async getCodeChallenge(codeVerifier: string): Promise<string> {
    const digest: ArrayBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
    return CryptoUtil.toBase64Url(new Uint8Array(digest));
  }
}

export { OAuth2StateUtil };
