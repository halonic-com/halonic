import type { AnnouncerTimers } from "../announcer/timers.ts";

/** How long the shell waits for a starting engine to answer. */
export const engineAnswerTimeoutMs = 30_000;
/** How long the shell waits before it restarts an engine that stopped. */
export const engineRestartDelayMs = 2_000;
/** An engine that stops again this soon after its restart isn't restarted again. */
export const engineRestartWindowMs = 60_000;

/**
 * Why the engine didn't start: it stopped before it answered, it didn't
 * answer in time, or it can't write its data folder. Each needs a different
 * action from the user, so the shell never merges them.
 */
export type EngineStartFailureReason =
  | "stopped-while-starting"
  | "no-answer"
  | "data-folder-not-writable";

/** An engine start that failed. */
export interface EngineStartFailure {
  readonly reason: EngineStartFailureReason;
  /**
   * The exit code for `stopped-while-starting`, `null` when a signal ended
   * the process. The engine's last log lines go to the log, not here.
   */
  readonly exitCode?: number | null;
}

/** What the shell reports while it starts and keeps the engine. */
export type EngineStartEvent =
  | {
      readonly state: "starting";
      /** 1 for the first start, 2 for the restart after a stop. */
      readonly attempt: number;
      /** When this attempt started, from the shell's timers. */
      readonly since: number;
      /** On a restart: the exit code of the engine that stopped. */
      readonly lastExitCode?: number | null;
    }
  | { readonly state: "connected" }
  | { readonly state: "lost" }
  | { readonly state: "failed"; readonly failure: EngineStartFailure };

/** What an engine process tells the shell. Calls after the first ending are ignored. */
export interface EngineProcessEvents {
  /** The engine answered and is ready. */
  ready(): void;
  /** The engine found it can't write its data folder. */
  dataFolderNotWritable(): void;
  /** The process ended, with its exit code, or `null` when a signal ended it. */
  exited(code: number | null): void;
}

/** One engine process the shell started. */
export interface EngineProcess {
  /** Stops the process. Stopping one that already ended is not an error. */
  stop(): void;
}

/**
 * Starts the engine process; the desktop app gives the shell one. It
 * doesn't throw: a process that can't be started reports `exited(null)`.
 */
export interface EngineLauncher {
  start(events: EngineProcessEvents): EngineProcess;
}

/** Controls a supervised engine. */
export interface EngineSupervisor {
  /**
   * Starts the engine from the first attempt, stopping the one before. The
   * shell calls it when it starts supervising; a Try again button calls it
   * after a failure.
   */
  retry(): void;
  /** Stops the engine and every pending timer. Nothing is reported after it. */
  stop(): void;
}

interface Attempt {
  phase: "starting" | "running" | "ended";
  process?: EngineProcess;
  answerTimer?: unknown;
}

/**
 * Keeps the engine running once `retry` starts it. A start that fails is reported
 * with its reason and not retried. An engine that stops while running is
 * restarted once, after {@link engineRestartDelayMs}; if it stops again
 * within {@link engineRestartWindowMs} of that restart, the shell reports
 * the failure instead of looping.
 *
 * If `report` throws, the supervisor still finishes the step it is in, so a
 * faulty listener can't stop a restart, and then throws the error.
 */
export function superviseEngine(
  launcher: EngineLauncher,
  timers: AnnouncerTimers,
  report: (event: EngineStartEvent) => void,
): EngineSupervisor {
  let current: Attempt | undefined;
  let restartTimer: unknown;
  let restartedAt: number | undefined;
  const errors: unknown[] = [];
  let depth = 0;

  const emit = (event: EngineStartEvent): void => {
    try {
      report(event);
    } catch (error) {
      errors.push(error);
    }
  };

  /** Runs one step and throws what `report` threw once the outermost step is done. */
  const step = <Args extends unknown[]>(work: (...args: Args) => void) => {
    return (...args: Args): void => {
      depth += 1;
      try {
        work(...args);
      } finally {
        depth -= 1;
      }
      if (depth === 0 && errors.length > 0) {
        const thrown = errors.splice(0);
        throw thrown.length === 1
          ? thrown[0]
          : new AggregateError(thrown, "Several engine.connection listeners failed.");
      }
    };
  };

  const end = (attempt: Attempt): void => {
    attempt.phase = "ended";
    timers.clearTimeout(attempt.answerTimer);
    attempt.process?.stop();
  };

  const fail = (attempt: Attempt, failure: EngineStartFailure): void => {
    end(attempt);
    emit({ state: "failed", failure });
  };

  const stoppedWhileRunning = (attempt: Attempt, code: number | null): void => {
    attempt.phase = "ended";
    if (restartedAt !== undefined && timers.now() - restartedAt < engineRestartWindowMs) {
      emit({ state: "failed", failure: { reason: "stopped-while-starting", exitCode: code } });
      return;
    }
    restartTimer = timers.setTimeout(
      step(() => {
        restartTimer = undefined;
        restartedAt = timers.now();
        launch(2, code);
      }),
      engineRestartDelayMs,
    );
    emit({ state: "lost" });
  };

  const launch = (attempt: number, lastExitCode?: number | null): void => {
    const run: Attempt = { phase: "starting" };
    current = run;
    const since = timers.now();
    emit(
      lastExitCode === undefined
        ? { state: "starting", attempt, since }
        : { state: "starting", attempt, since, lastExitCode },
    );
    run.answerTimer = timers.setTimeout(
      step(() => {
        if (run.phase === "starting") {
          fail(run, { reason: "no-answer" });
        }
      }),
      engineAnswerTimeoutMs,
    );
    const process = launcher.start({
      ready: step(() => {
        if (run.phase !== "starting") {
          return;
        }
        run.phase = "running";
        timers.clearTimeout(run.answerTimer);
        emit({ state: "connected" });
      }),
      dataFolderNotWritable: step(() => {
        if (run.phase !== "ended") {
          fail(run, { reason: "data-folder-not-writable" });
        }
      }),
      exited: step((code: number | null) => {
        if (run.phase === "starting") {
          fail(run, { reason: "stopped-while-starting", exitCode: code });
        } else if (run.phase === "running") {
          stoppedWhileRunning(run, code);
        }
      }),
    });
    run.process = process;
    // The launcher may report an ending before `start` returns.
    if (run.phase === "ended") {
      process.stop();
    }
  };

  const stop = (): void => {
    timers.clearTimeout(restartTimer);
    restartTimer = undefined;
    if (current !== undefined) {
      end(current);
    }
  };

  const supervisor: EngineSupervisor = {
    retry: step(() => {
      stop();
      restartedAt = undefined;
      launch(1);
    }),
    stop,
  };
  return supervisor;
}
