#!/usr/bin/env tsx
/**
 * Change the sign-in address of an account.
 *
 * An account is identified by `users.id` (migration 0028). Its address lives in
 * two places, and this script is the only supported way to move it:
 *
 *   * `users.current_email` — the address the account signs in with. Mutable.
 *   * `users.email`         — the frozen anchor. **Never written by this script.**
 *
 * ## Why `users.email` is never touched
 *
 * Three tables carry `FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE
 * CASCADE`. Rewriting the anchor would cascade the account's connected
 * applications, context documents and deletion history out of the database. The
 * anchor is also the input to the Vectorize namespace
 * (`u_<sha256(email)>`), which is persisted on every document row and stamped into
 * every existing vector — moving it would orphan the account's entire RAG corpus
 * and AI chat history with no error, just empty results.
 *
 * Everything else keeps working untouched, because those rows are keyed on
 * `user_id` and never move:
 *   `connected_applications`, `application_context_documents`,
 *   `application_context_deletion_runs`, `email_summary_actions`,
 *   `context_audit_logs`
 *
 * ## Why the statements run in this order
 *
 *   1. Claim the new address in `user_emails`.
 *   2. Move `users.current_email` to it.
 *   3. Revoke every other verified address.
 *
 * Claiming first means the user is never locked out: there is only a brief window
 * in which both addresses authenticate. Revoking first opens a window in which
 * *neither* does, which is the failure that locks an administrator out of their own
 * account.
 *
 * ## Operational notes
 *
 * `--dry-run` is the only confirmation gate; there is no interactive prompt. Take
 * a D1 backup out of band before running against `--remote`.
 *
 * All three statements are naturally idempotent, so a re-run after a success is a
 * no-op: the account still resolves by `--id` (or by the new address), the
 * takeover guard passes because the target belongs to the same account, and the
 * writes set the values they already hold.
 *
 * Usage:
 *   pnpm exec tsx scripts/change-email.ts --db <name> (--account <email> | --id <usr_id>) --to <new-email> [--remote] [--dry-run]
 *
 * Flags:
 *   --db <name>       D1 database name or binding (required)
 *   --account <email> the account's current sign-in address
 *   --id <usr_id>     the stable account id (preferred; unaffected by past changes)
 *   --to <email>      the new sign-in address
 *   --config <path>   wrangler config (default ./wrangler.jsonc)
 *   --persist-to <d>  local persistence dir (only with --local; must match where the
 *                     database was migrated, or you will hit a different database)
 *   --remote          operate on the remote database (default: local)
 *   --dry-run         print the plan and the SQL, change nothing
 *   --help | -h
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

interface Args {
  db: string;
  account?: string;
  id?: string;
  to?: string;
  config: string;
  persistTo?: string;
  remote: boolean;
  dryRun: boolean;
  help: boolean;
}

interface AccountRow {
  id: string;
  anchor: string;
  current_email: string | null;
}

interface RegistryRow {
  email: string;
  user_id: string;
  is_verified: number;
}

interface HolderRow {
  user_id: string;
  is_verified: number;
  current_email: string | null;
}

interface AppliedRow {
  anchor: string;
  current_email: string | null;
  registry: string | null;
}

const USAGE = `Usage:
  pnpm exec tsx scripts/change-email.ts --db <name> (--account <email> | --id <usr_id>) --to <new-email> [--remote] [--dry-run]

Flags:
  --db <name>       D1 database name or binding (required)
  --account <email> the account's current sign-in address
  --id <usr_id>     the stable account id
  --to <email>      the new sign-in address
  --config <path>   wrangler config (default ./wrangler.jsonc)
  --persist-to <d>  local persistence dir (only with --local)
  --remote          operate on the remote database (default: local)
  --dry-run         print the plan and the SQL, change nothing
  --help | -h
`;

function die(message: string): never {
  process.stderr.write(`error: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const args: Args = { db: '', config: './wrangler.jsonc', remote: false, dryRun: false, help: false };
  const next = (flag: string, index: number): string => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) die(`${flag} requires a value`);
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string;
    if (arg === '--db') args.db = next(arg, index++);
    else if (arg === '--account') args.account = next(arg, index++);
    else if (arg === '--id') args.id = next(arg, index++);
    else if (arg === '--to') args.to = next(arg, index++);
    else if (arg === '--config') args.config = next(arg, index++);
    else if (arg === '--persist-to') args.persistTo = next(arg, index++);
    else if (arg === '--remote') args.remote = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else die(`unknown argument: ${arg}`);
  }
  return args;
}

/**
 * The safety property of this script: these values are interpolated into SQL
 * rather than bound, so they are allow-listed and refused, not escaped and hoped
 * for. A bogus id simply matches no account.
 */
function sqlEmail(value: string): string {
  if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$/.test(value)) die(`refusing to interpolate ${JSON.stringify(value)}: not a plain email address`);
  return `'${value.toLowerCase()}'`;
}

function sqlToken(value: string, label: string): string {
  if (!/^[A-Za-z0-9_.@-]+$/.test(value)) die(`refusing to interpolate ${JSON.stringify(value)}: not a plain ${label}`);
  return `'${value}'`;
}

/**
 * Run one statement through wrangler and return the first result set.
 *
 * `--json` emits one JSON array per statement, so the payload is sliced from the
 * first `[` to the last `]` rather than parsed as a whole.
 */
function d1(args: Args, sql: string): unknown[] {
  if (!existsSync(resolve(args.config))) die(`wrangler config not found: ${args.config}`);
  const target = args.remote ? ['--remote'] : ['--local', ...(args.persistTo ? ['--persist-to', args.persistTo] : [])];
  const result = spawnSync(
    'pnpm',
    ['exec', 'wrangler', 'd1', 'execute', args.db, '--command', sql, '--config', args.config, '--json', ...target],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  if (result.status !== 0) die(`wrangler d1 execute failed:\n${result.stderr || result.stdout}`);
  const stdout: string = result.stdout ?? '';
  const start: number = stdout.indexOf('[');
  const end: number = stdout.lastIndexOf(']');
  if (start === -1 || end === -1) return [];
  const parsed: unknown = JSON.parse(stdout.slice(start, end + 1));
  const first: unknown = Array.isArray(parsed) ? parsed[0] : parsed;
  if (first && typeof first === 'object' && Array.isArray((first as { results?: unknown[] }).results)) {
    return (first as { results: unknown[] }).results;
  }
  return [];
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

async function main(): Promise<void> {
  const args: Args = (() => {
    try {
      return parseArgs(process.argv.slice(2));
    } catch (error: unknown) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`);
      process.exit(2);
    }
  })();

  if (args.help) {
    process.stdout.write(USAGE);
    return;
  }
  if (!args.db || (!args.account && !args.id) || !args.to) {
    process.stderr.write(USAGE);
    process.exit(2);
  }

  // ── Resolve the account ────────────────────────────────────────────────────
  const account: AccountRow | undefined = (
    args.id
      ? d1(args, `SELECT id, email AS anchor, current_email FROM users WHERE id = ${sqlToken(args.id, 'account id')} LIMIT 1`)
      : d1(
          args,
          `SELECT id, email AS anchor, current_email FROM users WHERE lower(current_email) = lower(${sqlEmail(args.account as string)}) LIMIT 1`,
        )
  )[0] as AccountRow | undefined;

  if (!account) {
    die(
      args.id
        ? `no account matched id ${args.id}.`
        : `no account matched ${args.account}. Check the current sign-in address; the frozen anchor is not searchable by the new address, so use --id if you have it.`,
    );
  }

  const current: string = (account.current_email ?? account.anchor).toLowerCase();
  const target: string = sqlEmail(args.to);
  const accountId: string = sqlToken(account.id, 'account id');

  // ── Refuse rather than half-apply ─────────────────────────────────────────
  // Re-pointing a live address would hand one account's identity to another, so
  // this aborts before anything is written.
  const holder: HolderRow | undefined = (
    d1(
      args,
      `SELECT ue.user_id, ue.is_verified, u.current_email
         FROM user_emails ue JOIN users u ON u.id = ue.user_id
        WHERE ue.email = ${target} LIMIT 1`,
    )[0] as HolderRow | undefined
  );
  if (holder && holder.is_verified === 1 && holder.user_id !== account.id) {
    die(
      `${args.to} is already a live sign-in address for account ${holder.user_id}${
        holder.current_email ? ` (current address ${holder.current_email})` : ''
      }. Re-pointing it would hand that account to this user. Resolve the conflict first.`,
    );
  }

  // ── Plan ──────────────────────────────────────────────────────────────────
  const now: number = nowSeconds();
  const existing: RegistryRow | undefined = d1(
    args,
    `SELECT email, user_id, is_verified FROM user_emails WHERE email = ${target} LIMIT 1`,
  )[0] as RegistryRow | undefined;

  const statements: string[] = [
    `INSERT INTO user_emails (email, user_id, is_verified, created_at) VALUES (${target}, ${accountId}, 1, ${now})
       ON CONFLICT(email) DO UPDATE SET user_id = excluded.user_id, is_verified = excluded.is_verified;`,
    `UPDATE users SET current_email = ${target}, updated_at = ${now} WHERE id = ${accountId};`,
    `UPDATE user_emails SET is_verified = 0 WHERE user_id = ${accountId} AND email != ${target};`,
  ];

  const out: string = [];
  out.push(`account  ${account.id}`);
  out.push(`anchor   ${account.anchor}  (frozen — never updated)`);
  out.push(`from     ${current}`);
  out.push(`to       ${args.to}`);
  out.push(`target   ${args.remote ? 'REMOTE' : 'local'} database '${args.db}'`);
  if (existing) {
    out.push(
      `note     ${target} is already known to this account (is_verified=${existing.is_verified}); the run re-verifies it and revokes the rest.`,
    );
  }
  out.push('', 'statements (applied in this order, as one batch):');
  statements.forEach((statement, index) => out.push(`  ${index + 1}. ${statement.replaceAll(/\s+/gu, ' ').trim()}`));
  process.stdout.write(`${out.join('\n')}\n`);

  if (args.dryRun) {
    process.stdout.write('\ndry run — nothing was changed.\n');
    return;
  }

  // ── Apply ─────────────────────────────────────────────────────────────────
  d1(args, statements.join(' '));

  // ── Verify ────────────────────────────────────────────────────────────────
  const applied: AppliedRow | undefined = d1(
    args,
    `SELECT u.email AS anchor, u.current_email,
            (SELECT group_concat(email || ':' || is_verified, ' ') FROM user_emails WHERE user_id = u.id) AS registry
       FROM users u WHERE u.id = ${accountId} LIMIT 1`,
  )[0] as AppliedRow | undefined;

  const report: string[] = ['', 'applied. verify:'];
  if (!applied) {
    report.push('  the account row could not be re-read — inspect the database manually.');
  } else {
    report.push(`  anchor         ${applied.anchor}  (unchanged)`);
    report.push(`  current_email  ${applied.current_email}`);
    report.push(`  registry       ${applied.registry ?? '(empty)'}`);
  }
  report.push('', 'not touched, because they key on the account id and keep working:');
  report.push('  connected_applications, application_context_documents, application_context_deletion_runs,');
  report.push('  email_summary_actions, context_audit_logs');
  report.push('  and the Vectorize namespace, which stays derived from the anchor.');
  if (existing === undefined) {
    report.push('', 'If rows for this account were written before the identity migration and still have a NULL user_id,');
    report.push('backfill them with:');
    report.push(`  UPDATE connected_applications SET user_id = ${accountId} WHERE lower(user_email) = lower(${sqlEmail(current)});`);
  }
  process.stdout.write(`${report.join('\n')}\n`);
}

main().catch((error: unknown) => {
  die(error instanceof Error ? error.message : String(error));
});
