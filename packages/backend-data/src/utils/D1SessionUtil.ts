/**
 * Swap a `DB` binding for a session-bound one.
 *
 * `D1Database.withSession` pins every subsequent query to one replica (or to the
 * bookmark a previous request returned), which is what makes a request's reads
 * and writes see one consistent snapshot. The API layer stamps that bookmark on
 * the request and reads it back off the response; the background workers open a
 * `first-primary` session instead.
 *
 * The session type is narrower than `D1Database` — it drops the session-only
 * methods — so the env is retyped rather than cast, and a `DB` handed to this
 * function is not usable as a session afterwards.
 */
type D1SessionEnv<TEnv extends { DB: D1Database }> = Omit<TEnv, 'DB'> & {
  DB: D1DatabaseSession;
};

function createD1SessionEnv<TEnv extends { DB: D1Database }>(
  env: TEnv,
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  constraintOrBookmark: D1SessionBookmark | D1SessionConstraint = 'first-primary',
): D1SessionEnv<TEnv> {
  return {
    ...env,
    DB: env.DB.withSession(constraintOrBookmark),
  };
}

export { createD1SessionEnv };
export type { D1SessionEnv };
