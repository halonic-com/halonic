/** What {@link withTimeLimit} rejects with when the work takes too long. */
export class TimeLimitError extends Error {
  override readonly name = "TimeLimitError";

  constructor(what: string, limitMs: number) {
    super(`${what} took longer than ${limitMs} ms.`);
  }
}

/**
 * Settles like `work`, or rejects with a {@link TimeLimitError} once `limitMs` has passed.
 * The work itself is not stopped, since a promise can't be cancelled; the caller just
 * stops waiting for it.
 *
 * @param work - what to wait for
 * @param limitMs - how long to wait, in milliseconds
 * @param what - names the work in the error's message, such as "The routine tick"
 */
export function withTimeLimit<T>(work: Promise<T>, limitMs: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeLimitError(what, limitMs)), limitMs);
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
