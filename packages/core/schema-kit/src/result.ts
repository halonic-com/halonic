// A stand-in until `@halonicjs/std` ships its result type (HAL-104). Switch to
// std's before this package's pull requests leave draft.

/** A value or a list of reasons why there is none. */
export type Result<Value, Failure> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly error: Failure };

/** Wraps a successful value. */
export function ok<Value>(value: Value): Result<Value, never> {
  return { ok: true, value };
}

/** Wraps a failure. */
export function err<Failure>(error: Failure): Result<never, Failure> {
  return { ok: false, error };
}
