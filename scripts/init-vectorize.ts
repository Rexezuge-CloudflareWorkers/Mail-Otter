#!/usr/bin/env tsx

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'jsonc-parser';

interface VectorizeBinding {
  binding: string;
  index_name: string;
}

interface WranglerConfig {
  vectorize?: VectorizeBinding[];
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

function checkIndexExists(indexName: string): boolean {
  try {
    exec(`npx wrangler vectorize info ${indexName}`);
    return true;
  } catch {
    return false;
  }
}

function createIndex(indexName: string, dimensions: number): void {
  console.log(`Creating Vectorize index: ${indexName} with ${dimensions} dimensions`);
  exec(`npx wrangler vectorize create ${indexName} --dimensions=${dimensions} --metric=cosine`);
}

async function main() {
  console.log('Initializing Vectorize indexes...');
  const config = parseWranglerConfig();

  if (!config.vectorize || config.vectorize.length === 0) {
    console.log('No Vectorize indexes configured');
    return;
  }

  for (const binding of config.vectorize) {
    const indexName = binding.index_name;
    const dimensions = 1024;

    if (checkIndexExists(indexName)) {
      console.log(`Index ${indexName} already exists`);
    } else {
      createIndex(indexName, dimensions);
      console.log(`Created index: ${indexName}`);
    }
  }
  console.log('Vectorize index initialization complete');
}

main().catch(console.error);
