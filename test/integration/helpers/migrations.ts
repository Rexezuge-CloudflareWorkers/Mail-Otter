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

interface MigrationFile {
  name: string;
  sql: string;
}

/**
 * The migration files, with their boundaries intact.
 *
 * Prefers the per-file list injected at config time and falls back to the flat
 * concatenation, so a harness that only injects the old global still works.
 */
function migrationFiles(): MigrationFile[] {
  const files: MigrationFile[] | undefined =
    typeof __INTEGRATION_MIGRATION_FILES__ === 'undefined' ? undefined : __INTEGRATION_MIGRATION_FILES__;
  return files && files.length > 0 ? [...files] : [{ name: 'all.sql', sql: __INTEGRATION_MIGRATION_SQL__ }];
}

function migrationFileNames(): string[] {
  return migrationFiles().map((file) => file.name);
}

/**
Drop statements that carry no executable SQL (pure comments).
*/
function executableStatements(sql: string): string[] {
  return splitSql(sql).filter(
    (statement) =>
      statement
        .replaceAll(/--[^\n]*/g, '')
        .replaceAll(/\/\*[\s\S]*?\*\//g, '')
        .trim().length > 0,
  );
}

function stripLeadingComments(statement: string): string {
  return statement.replaceAll(/^(?:\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/))+/g, '').trim();
}

/**
 * `PRAGMA` statements that scope a connection or transaction rather than the
 * schema. `foreign_key_check` and the `table_`/`index_` introspection pragmas are
 * excluded: they report, they do not reconfigure.
 */
function isConnectionPragma(statement: string): boolean {
  return /^pragma\s+(?!foreign_key_check|table_|index_|quick_check|integrity_check)\w/iu.test(stripLeadingComments(statement));
}

/**
 * Apply one migration file inside a single `db.batch()`.
 *
 * D1 rejects `BEGIN TRANSACTION`; a migration file is only atomic because
 * wrangler wraps it, and `batch()` is the only way to reproduce that behaviour
 * from the Workers binding. Running statements one at a time auto-commits each
 * one, so an interrupted or failing migration left the schema half-migrated and
 * the tests were exercising a schema that production could never reach.
 *
 * Every migration must therefore be ordered so each intermediate state is a
 * valid schema — see `migrations/0027_action_execution_scheduled_trigger.sql`.
 *
 * D1 scopes PRAGMAs to the current transaction and does not guarantee that a
 * `db.batch()` behaves as one transaction for them, so a file that opens with a
 * connection PRAGMA re-issues that PRAGMA before each statement rather than
 * betting on batch semantics. Files without one take the single-batch fast path.
 */
async function applyMigrationFile(db: D1Database, file: MigrationFile): Promise<void> {
  const statements = executableStatements(file.sql);
  if (statements.length === 0) return;
  const pragmas: string[] = statements.filter((statement) => isConnectionPragma(statement));
  if (pragmas.length === 0) {
    await db.batch(statements.map((sql) => db.prepare(sql)));
    return;
  }
  const pragmaIndex: Map<string, number> = new Map(pragmas.map((pragma) => [pragma, statements.indexOf(pragma)]));
  for (let index = 0; index < statements.length; index += 1) {
    const statement: string = statements[index];
    const preamble: string[] = pragmas.filter((pragma) => (pragmaIndex.get(pragma) as number) < index);
    try {
      await db.batch([...preamble, statement].map((sql) => db.prepare(sql)));
    } catch (error: unknown) {
      throw new Error(
        `${file.name}: statement ${index + 1}/${statements.length} failed: ${stripLeadingComments(statement).slice(0, 200)}\n${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }
  }
}

/**
 * Apply migrations, optionally restricted to an inclusive range of file names.
 *
 * A range is what the identity-upgrade test needs: it has to stand up the
 * pre-0028 schema, seed it, and only then apply the upgrade — re-running 0021
 * after a later migration has already altered a table would not reproduce any
 * state production ever had.
 */
export async function applyMigrations(db: D1Database, range?: { from?: string; to?: string }): Promise<void> {
  const files: MigrationFile[] = migrationFiles();
  const indexOf = (name: string | undefined, fallback: number): number => {
    if (!name) return fallback;
    const found: number = files.findIndex((file) => file.name === name);
    if (found === -1) throw new Error(`Unknown migration file: ${name}. Available: ${files.map((f) => f.name).join(', ')}`);
    return found;
  };
  const start: number = indexOf(range?.from, 0);
  const end: number = indexOf(range?.to, files.length - 1);
  for (const file of files.slice(start, end + 1)) {
    await applyMigrationFile(db, file);
  }
}

export { migrationFileNames, splitSql };
