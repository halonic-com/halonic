/**
 * The signals that stop a command, each with the exit code a shell expects
 * for it (cli-output 1.5 and section 2): 130 for Ctrl C, 143 for SIGTERM, which
 * a CI system sends when a job is cancelled, and 129 for SIGHUP, which the
 * terminal sends when its window is closed (HAL-6558).
 */
export const stopExitCode = { SIGHUP: 129, SIGINT: 130, SIGTERM: 143 } as const;

/** Ctrl C (`SIGINT`), `SIGTERM` or a closed terminal (`SIGHUP`). */
export type StopSignal = keyof typeof stopExitCode;

/** Where the signals come from: the real `process`, or a stand-in in a test. */
export interface SignalSource {
  on(signal: StopSignal, listener: () => void): unknown;
  off(signal: StopSignal, listener: () => void): unknown;
}

/** A command's watch for Ctrl C, SIGTERM and SIGHUP, from {@link watchForStop}. */
export interface StopWatch {
  /** Aborted at the first Ctrl C, SIGTERM or SIGHUP; the command passes it on, so its work winds down. */
  readonly signal: AbortSignal;
  /** The signal that stopped the command, or `undefined` while nothing has. */
  stoppedBy(): StopSignal | undefined;
  /** Stops watching, so the process handles the signals itself again. */
  dispose(): void;
}

const stopSignals = Object.keys(stopExitCode) as StopSignal[];

/**
 * Watches for Ctrl C, SIGTERM and SIGHUP while a command runs (cli-output
 * 1.5). Closing the terminal stops a command as Ctrl C does, so a run ends
 * cancelled rather than killed mid-step (HAL-6558). The first one aborts
 * {@link StopWatch.signal}, so the command can stop cleanly, end with the
 * line from `stopMessages.stopped` saying what that meant, and exit with the
 * signal's {@link stopExitCode}. A second one doesn't wait for
 * that: `exitNow` ends the process at once with the code, for when stopping
 * itself hangs.
 *
 * @param exitNow - ends the process with the code, as `process.exit`
 */
export function watchForStop(source: SignalSource, exitNow: (code: number) => void): StopWatch {
  const controller = new AbortController();
  let stoppedBy: StopSignal | undefined;

  const listeners = stopSignals.map((name) => {
    const listener = () => {
      if (stoppedBy !== undefined) {
        exitNow(stopExitCode[name]);
        return;
      }
      stoppedBy = name;
      controller.abort();
    };
    source.on(name, listener);
    return { name, listener };
  });

  return {
    signal: controller.signal,
    stoppedBy: () => stoppedBy,
    dispose() {
      for (const { name, listener } of listeners) {
        source.off(name, listener);
      }
    },
  };
}

/** An output stream that may still hold text it hasn't handed on: `process.stdout` or `process.stderr`. */
export interface PendingOutput {
  /** How much written text still waits to go out, as on a pipe nobody has read yet. */
  readonly writableLength: number;
  /** Calls `written` once everything written before has gone out. */
  write(text: "", written: () => void): unknown;
}

/**
 * Wraps `exit`, as `process.exit`, so it first lets the streams hand on what
 * they still hold. Through a pipe, `process.exit` would otherwise drop text
 * the reader hasn't taken yet, and cut a `--json` document short. A further
 * call while it waits exits at once, so a reader that never reads can't keep
 * the process open after another Ctrl C.
 */
export function exitOnceWritten(
  streams: readonly PendingOutput[],
  exit: (code: number) => void,
): (code: number) => void {
  let waiting = false;
  return (code) => {
    const pending = streams.filter((stream) => stream.writableLength > 0);
    if (waiting || pending.length === 0) {
      exit(code);
      return;
    }
    waiting = true;
    let left = pending.length;
    for (const stream of pending) {
      stream.write("", () => {
        left -= 1;
        if (left === 0) {
          exit(code);
        }
      });
    }
  };
}

/** An output stream that reports a failed write as an `error` event: `process.stdout` or `process.stderr`. */
export interface ErrorEmitter {
  on(event: "error", listener: (error: Error) => void): unknown;
}

/** The write errors that mean nobody reads the output any more: a closed pipe, a closed terminal. */
const readerIsGone: ReadonlySet<string> = new Set(["EPIPE", "EIO"]);

/**
 * Makes a closed pipe end the output quietly, as when `halonic run … | head -2`
 * has read its two lines (HAL-6007): text written after that is dropped and
 * the command finishes its work. A closed terminal window is treated the
 * same way: writing to it fails with `EIO`, and a run stopped by SIGHUP
 * still has to wind down after its step (HAL-6558). Any other write error
 * still throws, as it did without this.
 */
export function quietOnClosedPipe(stream: ErrorEmitter): void {
  stream.on("error", (error) => {
    if (readerIsGone.has((error as NodeJS.ErrnoException).code ?? "")) return;
    throw error;
  });
}
