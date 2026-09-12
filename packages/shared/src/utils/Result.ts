type Ok<T> = { readonly ok: true; readonly value: T };
type Err<E> = { readonly ok: false; readonly error: E };
type Result<T, E = Error> = Ok<T> | Err<E>;

function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

function mapResult<T, U, E>(result: Result<T, E>, map: (value: T) => U): Result<U, E> {
  return result.ok ? ok(map(result.value)) : result;
}

function getOrThrow<T>(result: Result<T, Error>): T {
  if (!result.ok) throw result.error;
  return result.value;
}

export { err, getOrThrow, isOk, mapResult, ok };
export type { Err, Ok, Result };
