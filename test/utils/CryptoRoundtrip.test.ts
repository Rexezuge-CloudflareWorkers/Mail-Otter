import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CryptoService } from '@mail-otter/backend-data/crypto';
import { decryptData, decryptDataWithSalt, encryptData, encryptDataWithSalt, generateAESGCMKey } from '@mail-otter/backend-data/crypto';

describe('aes-gcm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates a non-empty base64 key', async () => {
    const key = await generateAESGCMKey();
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });

  it('round-trips encrypt/decrypt with a generated key', async () => {
    const key = await generateAESGCMKey();
    const { encrypted, iv } = await encryptData('hello secret world', key);
    await expect(decryptData(encrypted, iv, key)).resolves.toBe('hello secret world');
  });

  it('produces different ciphertexts for the same plaintext (random IV)', async () => {
    const key = await generateAESGCMKey();
    const first = await encryptData('same', key);
    const second = await encryptData('same', key);
    expect(first.encrypted).not.toBe(second.encrypted);
    expect(first.iv).not.toBe(second.iv);
  });

  it('supports an explicit IV for deterministic output', async () => {
    const key = await generateAESGCMKey();
    const iv = btoa(String.fromCodePoint(...new Uint8Array(12).fill(7)));
    const first = await encryptData('deterministic', key, iv);
    const second = await encryptData('deterministic', key, iv);
    expect(first.encrypted).toBe(second.encrypted);
    await expect(decryptData(first.encrypted, first.iv, key)).resolves.toBe('deterministic');
  });

  it('fails to decrypt with the wrong key', async () => {
    const key = await generateAESGCMKey();
    const other = await generateAESGCMKey();
    const { encrypted, iv } = await encryptData('top secret', key);
    await expect(decryptData(encrypted, iv, other)).rejects.toThrow();
  });

  it('round-trips salted encrypt/decrypt with random salt', async () => {
    const masterKey = await generateAESGCMKey();
    const { encrypted, iv, salt } = await encryptDataWithSalt('salted secret', masterKey);
    await expect(decryptDataWithSalt(encrypted, iv, salt, masterKey)).resolves.toBe('salted secret');
  });

  it('round-trips salted encrypt/decrypt with explicit salt and iv', async () => {
    const masterKey = await generateAESGCMKey();
    const salt = btoa(String.fromCodePoint(...new Uint8Array(16).fill(3)));
    const iv = btoa(String.fromCodePoint(...new Uint8Array(12).fill(9)));
    const result = await encryptDataWithSalt('explicit salted', masterKey, salt, iv);
    expect(result.salt).toBe(salt);
    expect(result.iv).toBe(iv);
    await expect(decryptDataWithSalt(result.encrypted, result.iv, result.salt, masterKey)).resolves.toBe(
      'explicit salted',
    );
  });

  it('fails salted decrypt with the wrong master key', async () => {
    const masterKey = await generateAESGCMKey();
    const other = await generateAESGCMKey();
    const { encrypted, iv, salt } = await encryptDataWithSalt('data', masterKey);
    await expect(decryptDataWithSalt(encrypted, iv, salt, other)).rejects.toThrow();
  });
});

describe('CryptoService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('encrypts and decrypts through the service wrapper', async () => {
    const service = new CryptoService(await generateAESGCMKey());
    const { encrypted, iv } = await service.encrypt('service payload');
    await expect(service.decrypt(encrypted, iv)).resolves.toBe('service payload');
  });

  it('handles empty-string payloads', async () => {
    const service = new CryptoService(await generateAESGCMKey());
    const { encrypted, iv } = await service.encrypt('');
    await expect(service.decrypt(encrypted, iv)).resolves.toBe('');
  });
});
