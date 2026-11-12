// The backstop for a command that was stopped (HAL-6677): Ctrl C, SIGTERM or
// a closed terminal cancels the run, and the command closes the engine. That
// close waits for the step in progress, and a step can hang, such as on a
// model call that doesn't stop. A stopped command then waits a bounded time,
// releases the engine lock, and ends: `main.ts` ends the process once a
// stopped command has returned, so the step left behind can't keep it open.

import type { LocalEngine } from "./local-engine-host.ts";

/**
 * How long a stopped command waits for the engine to close: 15 seconds. A
 * harness program that is told to stop gets 10 seconds to exit before it is
 * killed (`exitGraceMs` in the harness kit), and the scheduler then writes
 * the step's end; 5 seconds more covers that write and removing the run's
 * program copies. A model call aborts at once, so a close that runs this
 * long is one that hangs. Ctrl C again ends the process at once anyway.
 */
export const stoppedCloseLimitMs = 15_000;

/**
 * Closes `engine`, and once `stop` has aborted, waits at most `limitMs` for
 * the close. A close that runs over is abandoned: the engine lock is
 * released, so the next command can open the engine, and `onAbandoned`
 * hears it. Until `stop` aborts, the close is waited for, however long.
 *
 * @throws what the close throws before it is abandoned
 *
 * @example
 * await closeAfterStop(engine, context.signal, stoppedCloseLimitMs, () => context.debug(line));
 */
export async function closeAfterStop(
  engine: Pick<LocalEngine, "close" | "abandon">,
  stop: AbortSignal,
  limitMs: number,
  onAbandoned: () => void,
): Promise<void> {
  const closing = engine.close();
  const limit = limitAfter(stop, limitMs);
  try {
    const ended = await Promise.race([closing.then(() => "closed" as const), limit.reached]);
    if (ended === "closed") return;
  } finally {
    limit.cancel();
  }
  // What the abandoned close throws later is of no use any more.
  closing.catch(() => {});
  await engine.abandon();
  onAbandoned();
}

/** A limit that starts when `stop` aborts, or at once when it already has. */
function limitAfter(stop: AbortSignal, limitMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let resolveReached: (value: "limit") => void = () => {};
  const reached = new Promise<"limit">((resolve) => {
    resolveReached = resolve;
  });
  const start = () => {
    timer = setTimeout(() => resolveReached("limit"), limitMs);
  };
  if (stop.aborted) {
    start();
  } else {
    stop.addEventListener("abort", start, { once: true });
  }
  return {
    reached,
    cancel: () => {
      stop.removeEventListener("abort", start);
      clearTimeout(timer);
    },
  };
}
