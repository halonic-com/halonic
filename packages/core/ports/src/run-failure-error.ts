import type { RunFailureReason } from "@halonicjs/events";

/** Every failure a {@link RunFailureError} can name, in {@link AdapterFailure} order. */
export const adapterFailures = [
  "disk-full",
  "sandbox-start-failed",
  "harness-start-failed",
] as const satisfies readonly RunFailureReason[];

/**
 * The run failure reasons an adapter that isn't a model provider can tell the
 * engine about by throwing a {@link RunFailureError}:
 * - `disk-full`: the disk ran out of space while the run wrote to it.
 * - `sandbox-start-failed`: the sandbox the run needs didn't start.
 * - `harness-start-failed`: the coding agent harness didn't start.
 *
 * A provider says why a model call failed with a `ModelCallError` instead, so
 * the model fallback can read it. The engine decides `budget`, `cancelled`,
 * `interrupted` and `error` itself.
 */
export type AdapterFailure = (typeof adapterFailures)[number];

/**
 * An error an adapter that isn't a model provider throws when it knows why a
 * run can't go on, so the engine puts that reason on `run.failed`
 * (requirement `ports.run-failure-error`).
 *
 * The message must be safe to show and to log. Keep the adapter's own text in
 * `cause`, not in the message.
 *
 * Check for it with {@link isRunFailureError}, not `instanceof`: an adapter
 * may be built against its own copy of this package.
 *
 * @example
 * throw new RunFailureError("sandbox-start-failed", "The sandbox didn't start.", { cause });
 */
export class RunFailureError extends Error {
  override readonly name = "RunFailureError";
  readonly failure: AdapterFailure;

  /**
   * @param failure - why the run can't go on
   * @param message - safe to show and to log
   * @param options - `cause` keeps the error this one wraps, for the log
   */
  constructor(failure: AdapterFailure, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.failure = failure;
  }
}

/**
 * Whether `value` is a {@link RunFailureError}: an `Error` named
 * "RunFailureError" with one of the known failures. It works across copies
 * of this package, where `instanceof` doesn't.
 *
 * @example
 * const failure = isRunFailureError(error) ? error.failure : "error";
 */
export function isRunFailureError(value: unknown): value is RunFailureError {
  if (!(value instanceof Error) || value.name !== "RunFailureError") return false;
  const failure: unknown = (value as { failure?: unknown }).failure;
  return adapterFailures.some((known) => known === failure);
}
