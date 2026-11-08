/**
 * A cron expression or time zone that can't be used. The message says what is
 * wrong in words a person can act on, so callers show it as it is.
 */
export class CronError extends Error {
  override name = "CronError";
}
