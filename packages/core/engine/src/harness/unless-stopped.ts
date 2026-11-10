import type { StopSignal } from "@halonicjs/std";

/**
 * Waits for `work` unless `stop` is told to stop first. When it is, what
 * `work` gives after that goes to `late`, so nothing it opened is left
 * open; its failure then has no one left to tell.
 *
 * @throws `stop.reason` when `stop` is told to stop before `work` settles, or already was
 * @throws what `work` throws
 */
export async function unlessStopped<T>(
  stop: StopSignal,
  work: Promise<T>,
  late?: (value: T) => Promise<void>,
): Promise<T> {
  if (stop.reason !== undefined) {
    handLate(work, late);
    throw stop.reason;
  }
  const stopped = Promise.withResolvers<never>();
  const removeListener = stop.onStop(() => stopped.reject(stop.reason));
  try {
    return await Promise.race([work, stopped.promise]);
  } catch (error) {
    if (stop.stopped) handLate(work, late);
    throw error;
  } finally {
    removeListener();
  }
}

/** Gives what `work` gives to `late`, once it does. */
function handLate<T>(work: Promise<T>, late: ((value: T) => Promise<void>) | undefined): void {
  work.then((value) => late?.(value)).catch(() => {});
}
