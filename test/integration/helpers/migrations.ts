/**
 * Minimal SQL statement splitter for SQLite migration files.
 *
 * Handles: single/double/backtick quoted strings (incl. `''` escapes),
 * `--` line comments, `/* ... *\/` block comments. Semicolons inside strings
 * or comments do not split. This replaces the naive quote-only splitter that
 * broke on semicolons in comments.
 */
const QUOTE_CHARS: ReadonlySet<string> = new Set(["'", '"', '`']);

function splitSql(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inString = false;
  let stringChar = '';
  let inLineComment = false;
  let inBlockComment = false;
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1] ?? '';

    if (inLineComment) {
      current += ch;
      if (ch === '\n') inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      current += ch;
      if (ch === '*' && next === '/') {
        current += next;
        i += 2;
        inBlockComment = false;
        continue;
      }
      i++;
      continue;
    }
    if (inString) {
      current += ch;
      if (ch === stringChar) {
        // SQL escapes a quote by doubling it ('it''s'); do not end the string.
        if (sql[i + 1] === stringChar) {
          current += sql[i + 1];
          i += 2;
          continue;
        }
        if (sql[i - 1] !== '\\') inString = false;
      }
      i++;
      continue;
    }
    if (ch === '-' && next === '-') {
      inLineComment = true;
      current += ch;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      current += ch;
      i++;
      continue;
    }
    if (QUOTE_CHARS.has(ch)) {
      inString = true;
      stringChar = ch;
      current += ch;
      i++;
      continue;
    }
    if (ch === ';') {
      const trimmed = current.trim();
      if (trimmed.length > 0) statements.push(trimmed);
      current = '';
      i++;
      continue;
    }
    current += ch;
    i++;
  }
  const trimmed = current.trim();
  if (trimmed.length > 0) statements.push(trimmed);
  return statements;
}

/**
 * Apply every migration statement through a single `db.batch()`.
 *
 * D1 rejects `BEGIN TRANSACTION`; a migration file is only atomic because
 * wrangler wraps it, and `batch()` is the only way to reproduce that behaviour
 * from the Workers binding. Running statements one at a time (as this helper
 * used to) auto-commits each one, so an interrupted or failing migration left
 * the schema half-migrated and the tests were exercising a schema that
 * production could never reach.
 *
 * Every migration must therefore be ordered so each intermediate state is a
 * valid schema — see `migrations/0027_action_execution_scheduled_trigger.sql`.
 */
export async function applyMigrations(db: D1Database): Promise<void> {
  const statements = splitSql(__INTEGRATION_MIGRATION_SQL__);
  const executable = statements.filter((stmt) => {
    // Skip pure-comment statements (no executable SQL).
    return (
      stmt
        .replaceAll(/--[^\n]*/g, '')
        .replaceAll(/\/\*[\s\S]*?\*\//g, '')
        .trim().length > 0
    );
  });
  if (executable.length === 0) return;
  await db.batch(executable.map((stmt) => db.prepare(stmt)));
}

export { splitSql };
