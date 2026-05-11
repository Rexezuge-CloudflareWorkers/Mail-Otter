#!/usr/bin/env tsx

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'jsonc-parser';

interface QueueBinding {
  binding: string;
  queue: string;
}

interface QueuesConfig {
  producers?: QueueBinding[];
  consumers?: QueueBinding[];
}

interface WranglerConfig {
  queues?: QueuesConfig;
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

function checkQueueExists(queueName: string): boolean {
  try {
    exec(`npx wrangler queues info ${queueName}`);
    return true;
  } catch {
    return false;
  }
}

function createQueue(queueName: string): void {
  console.log(`Creating queue: ${queueName}`);
  exec(`npx wrangler queues create ${queueName}`);
}

async function main() {
  console.log('Initializing Cloudflare Queues...');
  const config = parseWranglerConfig();

  if (!config.queues) {
    console.log('No queues configured');
    return;
  }

  const queueNames = new Set<string>();

  if (config.queues.producers) {
    for (const binding of config.queues.producers) {
      queueNames.add(binding.queue);
    }
  }

  if (config.queues.consumers) {
    for (const binding of config.queues.consumers) {
      queueNames.add(binding.queue);
    }
  }

  for (const queueName of queueNames) {
    if (checkQueueExists(queueName)) {
      console.log(`Queue ${queueName} already exists`);
    } else {
      createQueue(queueName);
      console.log(`Created queue: ${queueName}`);
    }
  }
  console.log('Queue initialization complete');
}

main().catch(console.error);
