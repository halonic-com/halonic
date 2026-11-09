/**
 * Every kind of error a surface (HTTP, CLI, Studio, MCP) can respond to, in a
 * fixed order for exhaustive tests and docs. Each surface turns a kind into
 * its response in one `switch` that ends in `assertNever`, so a new kind
 * fails the typecheck until every surface handles it.
 *
 * - `invalid_input`: the request or file is wrong; the caller fixes the input.
 * - `not_found`: the thing asked for doesn't exist.
 * - `conflict`: it exists, but its state doesn't allow this now: it already
 *   exists, someone else changed it first, or another step must come first.
 * - `unauthenticated`: we don't know who is asking, or their sign-in expired.
 * - `denied`: we know who is asking, but a rule says no.
 * - `limit_reached`: a rate limit, quota or spend budget is used up.
 * - `unavailable`: something we depend on is down or timed out; a retry may work.
 * - `internal`: a bug on our side. Anything without a kind is `internal`.
 */
export const errorKinds = [
  "invalid_input",
  "not_found",
  "conflict",
  "unauthenticated",
  "denied",
  "limit_reached",
  "unavailable",
  "internal",
] as const;

/** One of {@link errorKinds}. */
export type ErrorKind = (typeof errorKinds)[number];

/**
 * True when `value` is one of the error kinds. Use it to decode a kind that
 * came over the wire, such as the `kind` in an HTTP error body.
 *
 * @example
 * isErrorKind("not_found"); // true
 * isErrorKind("not-found"); // false
 */
export function isErrorKind(value: unknown): value is ErrorKind {
  return errorKinds.some((kind) => kind === value);
}

/**
 * An error with a kind, for code that fails in a way a person should hear
 * about. Errors that already have their own class don't have to extend this
 * one: a `kind` property is enough for {@link errorKindOf}.
 *
 * The message must be safe to show and to log: no secrets, tokens, internal
 * paths or internal codes. Surfaces show a generic message for `internal`
 * instead of this one, so don't rely on the text of an `internal` error
 * reaching the user; put what helps there in the log.
 *
 * @example
 * throw new KindedError("not_found", `There is no routine named "${name}".`);
 */
export class KindedError extends Error {
  override readonly name = "KindedError";
  readonly kind: ErrorKind;

  /**
   * @param kind - how a surface should respond
   * @param message - safe to show and to log
   * @param options - `cause` keeps the error this one wraps, for the log
   */
  constructor(kind: ErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.kind = kind;
  }
}

/**
 * The kind of any thrown value, for the one function per surface that turns
 * errors into responses. A value has a kind when it is an object with a
 * valid `kind` string and a `message` string: a `KindedError`, an error class
 * with a `kind` property, or the `{ kind, message }` shape an error takes over
 * HTTP or IPC. Anything else is `internal`, including objects that only have
 * a `kind`, such as events.
 *
 * It reads only the value itself, never its `cause`: code that wraps an error
 * chooses the kind of the wrapper on purpose.
 *
 * @example
 * errorKindOf(new KindedError("conflict", "The run changed.")); // "conflict"
 * errorKindOf({ kind: "not_found", message: "No such hub." }); // "not_found"
 * errorKindOf(new TypeError("x is undefined")); // "internal"
 */
export function errorKindOf(error: unknown): ErrorKind {
  if (typeof error !== "object" || error === null || !("kind" in error) || !("message" in error)) {
    return "internal";
  }
  if (isErrorKind(error.kind) && typeof error.message === "string") {
    return error.kind;
  }
  return "internal";
}
