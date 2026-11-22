import { KindedError } from "@halonicjs/std";

/**
 * How long an answer may take before the Inbox gives up on it, so a hanging engine ends in an
 * error on the card and not in a spinner that never stops.
 */
export const answerTimeoutMs = 30_000;

/** The answer didn't come back in time; the card shows it as a failed answer, with **Try again**. */
export class AnswerTimedOut extends KindedError {
  constructor() {
    super(
      "unavailable",
      "The engine didn't answer in time. Your answer may not have been recorded.",
    );
  }
}

/** `work`, or {@link AnswerTimedOut} once {@link answerTimeoutMs} has passed without it. */
export function withTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AnswerTimedOut()), answerTimeoutMs);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}
