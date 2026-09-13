/**
 * Minimal SQL statement splitter for SQLite migration files.
 *
 * Handles: single/double/backtick quoted strings (incl. `''` escapes),
 * `--` line comments, `/* ... *\/` block comments. Semicolons inside strings
 * or comments do not split. This replaces the naive quote-only splitter that
 * broke on semicolons in comments.
 */
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
    if (ch === "'" || ch === '"' || ch === '`') {
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

export async function applyMigrations(db: D1Database): Promise<void> {
  const statements = splitSql(__INTEGRATION_MIGRATION_SQL__);
  for (const stmt of statements) {
    if (stmt.length === 0) continue;
    // Skip pure-comment statements (no executable SQL).
    const withoutComments = stmt
      .replace(/--[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim();
    if (withoutComments.length === 0) continue;
    await db.prepare(stmt).run();
  }
}

export { splitSql };
