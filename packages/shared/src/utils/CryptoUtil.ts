class CryptoUtil {
  public static async sha256Hex(value: string): Promise<string> {
    const digest: ArrayBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest))
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
