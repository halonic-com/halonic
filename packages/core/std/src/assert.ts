/** Thrown when an assertion fails. It always means a bug, never bad user input. */
export class AssertionError extends Error {
  override readonly name = "AssertionError";
}

/**
 * Throws an `AssertionError` with `message` when `condition` is false.
 * TypeScript treats the condition as true after the call.
 *
 * @param condition - what must hold here
 * @param message - says what was expected, so the failure explains itself
 * @throws AssertionError when `condition` is false
 *
 * @example
 * assert(stepMs > 0, `stepMs must be positive, got ${stepMs}`);
 */
export function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new AssertionError(message);
  }
}

/**
 * Returns `value` when it is neither `undefined` nor `null`, and throws
 * otherwise. Use it instead of the non-null `!` operator.
 *
 * @param value - the value that must be present
 * @param what - names the value in the error, such as `"the run's first event"`
 * @returns the value, with `undefined` and `null` removed from its type
 * @throws AssertionError when the value is missing
 *
 * @example
 * const first = assertDefined(events[0], "the run's first event");
 */
export function assertDefined<T>(value: T, what: string): NonNullable<T> {
  if (value === undefined || value === null) {
    throw new AssertionError(`Expected ${what} to be defined, but it was ${String(value)}.`);
  }
  return value;
}

/**
 * Marks a branch that the type system says can't be reached, such as the
 * `default` of a `switch` over every member of a union. It fails to compile
 * when a member is missing, and throws if the code runs anyway.
 *
 * @param value - the value that should have type `never` here
 * @param what - names the value in the error, such as `"state type"`
 * @throws AssertionError always
 */
export function assertNever(value: never, what: string): never {
  throw new AssertionError(`Unexpected ${what}: ${describeValue(value)}.`);
}

/** JSON where possible, so a string shows its quotes; `String()` for what JSON can't write. */
function describeValue(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
