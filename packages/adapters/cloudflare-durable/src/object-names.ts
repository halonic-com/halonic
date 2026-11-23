import { isRunId } from "@halonicjs/ports";
import { utf8Bytes } from "./input-rules.ts";

/** The longest timer key the `Scheduler` port takes. */
const maxTimerKeyBytes = 256;

/**
 * Checks a name prefix when a client is built: empty, or ending in `/`. The trailing `/` means no
 * scope's names can be the start of another scope's, so `u/a` and `u/ab` never meet.
 *
 * @throws RangeError when the prefix is neither
 * @returns the prefix, unchanged
 */
export function checkedNamePrefix(prefix: string | undefined): string {
  const checked = prefix ?? "";
  if (checked !== "" && !checked.endsWith("/")) {
    throw new RangeError('A Durable Object name prefix must be empty or end in "/".');
  }
  return checked;
}

/**
 * The name of the run object for `id` behind `prefix`. The id is checked here, where the name is
 * built, and not only by the route that took it: an id with a `/` or `..` could otherwise reach
 * into another scope's names.
 *
 * @throws RangeError when `id` isn't a run id; the message doesn't repeat it
 */
export function runObjectName(prefix: string, id: string): string {
  if (!isRunId(id)) {
    throw new RangeError(
      'A run object is named after a run id: 1 to 128 letters, digits, "_", "-" or ".".',
    );
  }
  return `${prefix}${id}`;
}

/**
 * The name of the run object that keeps the timers of `key` behind `prefix`. The `Scheduler` port
 * takes any key of 1 to 256 UTF-8 bytes, so the key is held to that rule here, where the name is
 * built, and may not hold a `/`, so it can never name an object under a longer prefix.
 *
 * @throws RangeError when `key` breaks either rule; the message doesn't repeat it
 */
export function timerObjectName(prefix: string, key: string): string {
  const bytes = utf8Bytes(key);
  if (bytes < 1 || bytes > maxTimerKeyBytes) {
    throw new RangeError(`A timer key is 1 to ${maxTimerKeyBytes} UTF-8 bytes, not ${bytes}.`);
  }
  if (key.includes("/")) {
    throw new RangeError('A timer key may not hold a "/".');
  }
  return `${prefix}${key}`;
}
