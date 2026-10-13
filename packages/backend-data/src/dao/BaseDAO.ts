import { BaseDAO } from '@rexezuge/d1';
import type { D1Queryable } from '@rexezuge/d1';
import type { D1Result } from '@rexezuge/d1';

/**
 * `BaseDAO` is the kit's, sql-first: `run` / `first` / `all` / `count` / `batch`
 * take SQL and bindings rather than a closure.
 *
 * The old closure-first form meant every read site paid for a wrapper the
 * kit-shaped call sites never needed, and the two shapes had drifted into
 * different method names (`withRetry` here, `run(sql, bindings)` there). The
 * sql-first form is the one that survived across the family, so this is the kit
 * deciding, not this repo.
 *
 * Two things the kit's `BaseDAO` does not carry, kept here:
 *
 * - `EncryptedDAO`, because the master key is this app's sealed-credential
 *   concern and the kit has no key management.
 * - `findRowById` / `deleteOlderThan`, the identifier-validated generic
 *   lookups. The kit dropped `findById` as a *static* — it is a name business
 *   DAOs also use for their own lookups, so a codemod cannot anchor it — but the
 *   queries are still in use, and the identifier allow-listing is the safety
 *   property rather than an implementation detail.
 */
abstract class EncryptedDAO extends BaseDAO {
  constructor(
    database: D1Queryable,
    protected readonly masterKey: string,
  ) {
    super(database);
  }
}

/**
 * Identifier allow-listing for the generic lookups below.
 *
 * Values always travel as bindings; only table and column names are ever
 * interpolated, so they are the part that has to be constrained.
 */
const SQL_IDENTIFIER_PATTERN = /^[a-z_]\w*$/i;

function assertSqlIdentifier(value: string, label: string): void {
  if (!SQL_IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`Invalid SQL identifier for ${label}: ${value}`);
  }
}

/**
 * Generic row lookup by primary key.
 */
async function findRowById<T>(db: D1Queryable, table: string, idColumn: string, idValue: string, columns = '*'): Promise<T | null> {
  assertSqlIdentifier(table, 'table');
  assertSqlIdentifier(idColumn, 'idColumn');
  let selectColumns = '*';
  if (columns !== '*') {
    const validated: string[] = columns.split(',').map((column: string): string => {
      const trimmed: string = column.trim();
      assertSqlIdentifier(trimmed, 'column');
      return trimmed;
    });
    selectColumns = validated.join(', ');
  }
  const row: T | null = await db.prepare(`SELECT ${selectColumns} FROM ${table} WHERE ${idColumn} = ? LIMIT 1`).bind(idValue).first<T>();
  return row ?? null;
}

/**
 * Generic batched delete of rows older than a cutoff.
 *
 * The `IN (SELECT … LIMIT ?)` subquery is what keeps one delete bounded: D1 has
 * no `DELETE … LIMIT`, so without it a retention prune on a large table would try
 * to remove every matching row in a single statement.
 */
async function deleteOlderThan(
  db: D1Queryable,
  table: string,
  timeColumn: string,
  cutoff: number | string,
  limit: number,
  idColumn: string,
): Promise<number> {
  assertSqlIdentifier(table, 'table');
  assertSqlIdentifier(timeColumn, 'timeColumn');
  assertSqlIdentifier(idColumn, 'idColumn');
  const result: D1Result = await db
    .prepare(
      `DELETE FROM ${table}
             WHERE ${idColumn} IN (
               SELECT ${idColumn} FROM ${table}
               WHERE ${timeColumn} < ?
               LIMIT ?
             )`,
    )
    .bind(cutoff, limit)
    .run();
  return (result.meta as { changes?: number })?.changes ?? 0;
}

export { EncryptedDAO, assertSqlIdentifier, deleteOlderThan, findRowById };

export { BaseDAO } from '@rexezuge/d1';
