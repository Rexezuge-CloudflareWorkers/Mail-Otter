class CryptoUtil {
  public static async sha256Hex(value: string): Promise<string> {
    const digest: ArrayBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return CryptoUtil.toHex(new Uint8Array(digest));
  }

  public static async hmacSha256Hex(value: string, secret: string): Promise<string> {
    const key: CryptoKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signature: ArrayBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
    return CryptoUtil.toHex(new Uint8Array(signature));
  }

  private static toHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((byte: number): string => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  public static toBase64Url(bytes: Uint8Array): string {
    let binary = '';
    bytes.forEach((byte: number): void => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  public static randomBase64Url(byteLength: number): string {
    return CryptoUtil.toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
  }
}

export { CryptoUtil };
