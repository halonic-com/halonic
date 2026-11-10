/**
 * The signals that stop a command, each with the exit code a shell expects
 * for it (cli-output 1.5 and section 2): 130 for Ctrl C, 143 for SIGTERM, which
 * a CI system sends when a job is cancelled.
 */
export const stopExitCode = { SIGINT: 130, SIGTERM: 143 } as const;

/** Ctrl C (`SIGINT`) or `SIGTERM`. */
export type StopSignal = keyof typeof stopExitCode;

/** Where the signals come from: the real `process`, or a stand-in in a test. */
export interface SignalSource {
  on(signal: StopSignal, listener: () => void): unknown;
  off(signal: StopSignal, listener: () => void): unknown;
}

/** A command's watch for Ctrl C and SIGTERM, from {@link watchForStop}. */
export interface StopWatch {
  /** Aborted at the first Ctrl C or SIGTERM; the command passes it on, so its work winds down. */
  readonly signal: AbortSignal;
  /** The signal that stopped the command, or `undefined` while nothing has. */
  stoppedBy(): StopSignal | undefined;
  /** Stops watching, so the process handles the signals itself again. */
  dispose(): void;
}

const stopSignals = Object.keys(stopExitCode) as StopSignal[];

/**
 * Watches for Ctrl C and SIGTERM while a command runs (cli-output 1.5). The
 * first one aborts {@link StopWatch.signal}, so the command can stop cleanly,
 * end with the line from `stopMessages.stopped` saying what that meant, and
 * exit with the signal's {@link stopExitCode}. A second one doesn't wait for
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
