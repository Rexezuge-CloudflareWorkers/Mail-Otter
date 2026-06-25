class CryptoUtility {
  public static async sha256Hex(value: string): Promise<string> {
    const digest: ArrayBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return this.toHex(new Uint8Array(digest));
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
    return this.toHex(new Uint8Array(signature));
  }

  private static toHex(bytes: Uint8Array): string {
    return Array.from(bytes, (byte: number): string => byte.toString(16).padStart(2, '0')).join('');
  }

  public static toBase64Url(bytes: Uint8Array): string {
    let binary = '';
    bytes.forEach((byte: number): void => {
      binary += String.fromCodePoint(byte);
    });
    // btoa + URL-safe transform; Uint8Array#toBase64 is not guaranteed in all Workers runtimes
     
    return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/={0,2}$/, '');
  }

  public static randomBase64Url(byteLength: number): string {
    return this.toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
  }
}

export { CryptoUtility as CryptoUtil };
