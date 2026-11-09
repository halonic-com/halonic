/** How long {@link eventually} may keep checking, and how it waits between checks. */
export interface EventuallyOptions {
  /**
   * The most time to wait, in milliseconds. It counts only the `every` steps
   * waited, never the time a check takes or wall-clock time, so a slow
   * machine runs exactly the same checks as a fast one. Vitest's test
   * timeout stays the wall-clock backstop.
   */
  readonly within: number;
  /** The time to wait between two checks, in milliseconds. */
  readonly every: number;
  /**
   * Waits `ms` milliseconds. Pass your fake world's step here (for example
   * the scheduler harness's `wait`, or `(ms) => vi.advanceTimersByTimeAsync(ms)`),
   * so the wait moves fake time instead of sleeping. Defaults to a real timer,
   * for checks on the real world, such as a child process.
   */
  readonly wait?: (ms: number) => Promise<unknown> | unknown;
  /** What must become true, in words, for the error when it never does. */
  readonly intent?: string;
}

/**
 * Runs `check` until it stops throwing, and returns what it returned. Use it
 * instead of a sleep followed by a check, when the intent is "at some point
 * within X". When the intent is "not before T, and exactly at T", wait the
 * exact time and check once instead, or an off-by-one would pass.
 *
 * The first check runs at once. After each failed check it waits `every`
 * milliseconds and checks again, as long as the steps waited stay within
 * `within` milliseconds: `within` is the sum of the waits, not a wall-clock
 * limit, so the number of checks is always `floor(within / every) + 1`, also
 * when `every` is a fraction.
 *
 * @param check - throws (for example with `expect`) until the state is right
 * @param options - the time budget, the step and how to wait
 * @returns what `check` returned on the check that passed
 * @throws a `RangeError` when `every` isn't a finite number above 0, or
 *   `within` isn't a finite number at least `every` (such as `NaN` or `Infinity`)
 * @throws an `Error` naming the intent and the number of checks, with the
 *   last check's error as its `cause`, when no check passed within the budget
 *
 * @example
 * const delivered = await eventually(
 *   () => {
 *     expect(listener.timers).toHaveLength(1);
 *     return listener.timers[0];
 *   },
 *   { intent: "the timer is delivered", within: minute, every: second, wait },
 * );
 */
export async function eventually<Result>(
  check: () => Promise<Result> | Result,
  options: EventuallyOptions,
): Promise<Result> {
  const { within, every, wait = waitRealTime, intent = "the check" } = options;
  rejectBadBudget(within, every);

  // Count the steps rather than add up `every`, so a fraction can't round
  // the budget into one check more or less than the formula above.
  const steps = Math.floor(within / every);
  for (let checks = 1; ; checks += 1) {
    try {
      return await check();
    } catch (error) {
      if (checks > steps) {
        throw new Error(
          `${intent} didn't hold within ${within} ms: ${checks} checks, ${every} ms apart. Last failure: ${messageOf(error)}`,
          { cause: error },
        );
      }
    }
    await wait(every);
  }
}

/** Both limits must be finite, `every` above 0 and `within` at least `every`, so the loop always ends. */
function rejectBadBudget(within: number, every: number): void {
  if (!Number.isFinite(every) || every <= 0) {
    throw new RangeError(
      `eventually: every must be a number of milliseconds above 0, not ${every}.`,
    );
  }
  if (!Number.isFinite(within) || within < every) {
    throw new RangeError(
      `eventually: within must be a number of milliseconds at least every (${every}), not ${within}.`,
    );
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function waitRealTime(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
