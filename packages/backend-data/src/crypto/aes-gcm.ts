export async function generateAESGCMKey(): Promise<string> {
  const key = (await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']));
  const exported = await crypto.subtle.exportKey('raw', key);
  return btoa(String.fromCodePoint(...new Uint8Array(exported)));
}

export async function encryptData(data: string, keyBase64: string, ivBase64?: string): Promise<{ encrypted: string; iv: string }> {
  const keyBuffer = Uint8Array.from(atob(keyBase64), (c) => c.codePointAt(0) ?? 0);
  const key = await crypto.subtle.importKey('raw', keyBuffer, { name: 'AES-GCM' }, false, ['encrypt']);

  const iv = ivBase64 ? Uint8Array.from(atob(ivBase64), (c) => c.codePointAt(0) ?? 0) : crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(data);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

  return {
    encrypted: btoa(String.fromCodePoint(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCodePoint(...iv)),
  };
}

export async function encryptDataWithSalt(
  data: string,
  masterKeyBase64: string,
  saltBase64?: string,
  ivBase64?: string,
): Promise<{ encrypted: string; iv: string; salt: string }> {
  const salt = saltBase64 ? fromBase64(saltBase64) : randomBytes(16);
  const key = await deriveSaltedAESGCMKey(masterKeyBase64, salt);
  const iv = ivBase64 ? fromBase64(ivBase64) : randomBytes(12);
  const encoded = new TextEncoder().encode(data);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

  return {
    encrypted: toBase64(new Uint8Array(encrypted)),
    iv: toBase64(iv),
    salt: toBase64(salt),
  };
}

export async function decryptData(encryptedBase64: string, ivBase64: string, keyBase64: string): Promise<string> {
  const keyBuffer = Uint8Array.from(atob(keyBase64), (c) => c.codePointAt(0) ?? 0);
  const key = await crypto.subtle.importKey('raw', keyBuffer, { name: 'AES-GCM' }, false, ['decrypt']);

  const iv = Uint8Array.from(atob(ivBase64), (c) => c.codePointAt(0) ?? 0);
  const encrypted = Uint8Array.from(atob(encryptedBase64), (c) => c.codePointAt(0) ?? 0);

  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted);
  return new TextDecoder().decode(decrypted);
}

export async function decryptDataWithSalt(
  encryptedBase64: string,
  ivBase64: string,
  saltBase64: string,
  masterKeyBase64: string,
): Promise<string> {
  const key = await deriveSaltedAESGCMKey(masterKeyBase64, fromBase64(saltBase64));
  const iv = fromBase64(ivBase64);
  const encrypted = fromBase64(encryptedBase64);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted);
  return new TextDecoder().decode(decrypted);
}

async function deriveSaltedAESGCMKey(masterKeyBase64: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const masterKey = await crypto.subtle.importKey('raw', fromBase64(masterKeyBase64), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: new TextEncoder().encode('mail-otter-email-action-v1'),
    },
    masterKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (c) => c.codePointAt(0) ?? 0);
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCodePoint(...bytes));
}

function randomBytes(byteLength: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytes;
}
