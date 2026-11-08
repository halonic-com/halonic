// A stand-in with exactly the shape of `@halonicjs/std`'s result.
// Switch to std's once its pull request is on this package's base.

/** A successful outcome that carries a value. */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** A failed outcome that carries an error. */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/** The outcome of an operation that can fail in an expected way. Check `ok` first. */
export type Result<T, E = Error> = Ok<T> | Err<E>;

/** Wraps a value as a successful result. */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/** Wraps an error as a failed result. */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}
