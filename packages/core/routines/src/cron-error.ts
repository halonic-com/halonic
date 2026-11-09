import type { ErrorKind } from "@halonicjs/std";

/**
 * A cron expression or time zone that can't be used. The message says what is
 * wrong in words a person can act on, so callers show it as it is.
 */
export class CronError extends Error {
  override name = "CronError";

  /** How a surface should respond: the caller fixes the expression or zone. */
  get kind(): ErrorKind {
    return "invalid_input";
  }
}
