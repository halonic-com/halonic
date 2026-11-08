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

/**
 * The outcome of an operation that can fail in an expected way. Check `ok`
 * before reading `value` or `error`; TypeScript narrows the type for you.
 *
 * @example
 * const parsed = parsePort("8080");
 * if (!parsed.ok) return parsed;
 * listen(parsed.value);
 */
export type Result<T, E = Error> = Ok<T> | Err<E>;

/**
 * Wraps a value as a successful result.
 *
 * @param value - the value to carry
 * @returns `{ ok: true, value }`
 */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/**
 * Wraps an error as a failed result.
 *
 * @param error - the error to carry
 * @returns `{ ok: false, error }`
 */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/**
 * Changes the value of a successful result and passes a failed one through
 * unchanged.
 *
 * @param result - the result to transform
 * @param transform - called with the value when `result` is successful
 * @returns a new result with the transformed value, or the original failure
 *
 * @example
 * mapResult(ok(2), (n) => n * 10); // ok(20)
 */
export function mapResult<T, U, E>(result: Result<T, E>, transform: (value: T) => U): Result<U, E> {
  if (!result.ok) {
    return result;
  }
  return ok(transform(result.value));
}

/**
 * Returns the value of a successful result, or throws for a failed one.
 * Use it where a failure is a bug, such as in tests and fixtures.
 *
 * @param result - the result to unwrap
 * @returns the value
 * @throws the carried error when it is an `Error`, otherwise an `Error` that describes it
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  if (result.error instanceof Error) {
    throw result.error;
  }
  throw new Error(`Expected a successful result, but it failed with: ${String(result.error)}`);
}
