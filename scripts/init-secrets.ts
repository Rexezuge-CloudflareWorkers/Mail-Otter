#!/usr/bin/env tsx

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'jsonc-parser';

interface WranglerConfig {
  secrets_store_secrets?: Array<{
    binding: string;
    store_id: string;
    secret_name: string;
  }>;
}

function exec(command: string): string {
  try {
    return execSync(command, { encoding: 'utf8', stdio: 'pipe' });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`Command failed: ${command}\n${error.message}`);
    }
    throw new Error(`Command failed: ${command}\nUnknown error.`);
  }
}

function parseWranglerConfig(): WranglerConfig {
  const configPath = join(process.cwd(), 'wrangler.jsonc');
  const content = readFileSync(configPath, 'utf8');
  return parse(content);
}

function checkSecret(storeId: string, secretName: string): boolean {
  try {
    const output = exec(`npx wrangler secrets-store secret list ${storeId} --remote`);
    return output.includes(secretName);
  } catch {
    return false;
  }
}

async function generateAESGCMKey(): Promise<string> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const exported = await crypto.subtle.exportKey('raw', key);
  return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

function createSecret(storeId: string, secretName: string, secretValue: string): void {
  console.log(`Creating secret: ${secretName}`);
  exec(`echo "${secretValue}" | npx wrangler secrets-store secret create ${storeId} --name ${secretName} --scopes workers --remote`);
}

async function main() {
  console.log('Initializing Cloudflare secrets...');
  const config = parseWranglerConfig();
  if (config.secrets_store_secrets) {
    for (const secret of config.secrets_store_secrets) {
      if (!checkSecret(secret.store_id, secret.secret_name)) {
        let secretValue: string;
        if (secret.secret_name === 'mail-otter-aes-encryption-key') {
          secretValue = await generateAESGCMKey();
          console.log(`Generated AES encryption key`);
        } else {
          throw new Error(`Unknown secret: ${secret.secret_name}`);
        }
        createSecret(secret.store_id, secret.secret_name, secretValue);
        console.log(`Created secret: ${secret.secret_name}`);
      } else {
        console.log(`Secret ${secret.secret_name} already exists`);
      }
    }
  }
  console.log('Secret initialization complete');
}

main().catch(console.error);
