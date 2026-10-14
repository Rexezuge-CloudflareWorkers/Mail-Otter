-- Migration 0029: Add `users.username`
--
-- The kit's canonical `users` table carries a `username` column: a separately
-- mutable public handle, distinct from the frozen `email` anchor and from the
-- mutable `current_email` sign-in address. `@rexezuge/identity`'s `UserDAO`
-- models it and `ensureUsername` / `setUsername` / `getByUsernameCi` read and
-- write it, so adopting those methods needs the column to exist.
--
-- ## What is deliberately NOT here
--
-- This repo keeps `users.preferred_language` (0026). The kit's `UserDAO` does
-- not model it, so `UserDAO` stays a local subclass of the kit's rather than
-- being adopted wholesale — see
-- `packages/backend-data/src/dao/UserDAO.ts`. That is the escape hatch the kit's
-- own migration table describes: a repo whose `users` table has columns the
-- kit's DAO does not model overrides the row instead of forking the kit.
--
-- Nor does this migration touch 0028. D1 cannot drop or retype a column in
-- place, so `id` and `current_email` stay the nullable columns 0028 created and
-- the kit's `USERS_SCHEMA` remains reference-only. Applying the kit's
-- `applyIdentityMigrations` to an already-migrated database would fail on
-- `ALTER TABLE users ADD COLUMN id` (duplicate column) and would leave
-- `username` unmigrated, because its `CREATE TABLE IF NOT EXISTS users` is a
-- silent no-op against an existing table.

ALTER TABLE users ADD COLUMN username TEXT;

-- Nothing to backfill: `username` is a public handle, not an identifier. The
-- kit's `UserDAO.ensureUsername` is the only writer, and it derives the value
-- when a client asks for one. Existing accounts simply have none yet.
--
-- Deliberately NOT unique. The kit indexes it for case-insensitive lookup, but
-- uniqueness is enforced in `setUsername` rather than by the schema, so that
-- swapping two handles in two statements cannot transiently violate a unique
-- index. That is the kit's choice and this column follows it.

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);