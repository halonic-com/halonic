/** How `eventually` tries a check. */
export interface EventuallyOptions {
  /** How many times to try the check, passes included. Defaults to 12. */
  readonly attempts?: number;
  /**
   * How many passes in a row count as done. Defaults to 3: while a new Worker version rolls out,
   * one request can reach it and the next an older one, so a single pass proves nothing.
   */
  readonly passesInARow?: number;
  /** Milliseconds between tries, after a pass as after a failure. Defaults to 5000. */
  readonly delayMs?: number;
  /**
   * Whether a failure may still be the older version answering. Any other failure is thrown at
   * once, so a wrong answer the new version gives isn't hidden behind later passes. Defaults to
   * retrying every failure.
   */
  readonly retryIf?: (error: unknown) => boolean;
  /** Tests inject this; defaults to a timer. */
  readonly sleep?: (ms: number) => Promise<void>;
}

/**
 * Runs `check` until it passes `passesInARow` times in a row. Setting or removing a Workers secret
 * makes a new Worker version, which takes a few seconds to answer everywhere; until then, requests
 * reach the old and the new version in turn. A failure starts the count again.
 *
 * @throws the error of `check` when it isn't one to retry, or the last error when the tries ran out
 */
export async function eventually(
  check: () => Promise<void>,
  options: EventuallyOptions = {},
): Promise<void> {
  const {
    attempts = 12,
    passesInARow = 3,
    delayMs = 5_000,
    retryIf = () => true,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  } = options;
  let passes = 0;
  let lastError: unknown = new Error(`The check passed fewer than ${passesInARow} times in a row.`);
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await check();
      passes++;
      if (passes >= passesInARow) return;
    } catch (error) {
      if (!retryIf(error)) throw error;
      passes = 0;
      lastError = error;
    }
    if (attempt < attempts) await sleep(delayMs);
  }
  throw lastError;
}
