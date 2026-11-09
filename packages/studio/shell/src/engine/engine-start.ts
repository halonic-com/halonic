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
  const supervision = new Supervision(launcher, timers, new Steps(report));
  return { retry: () => supervision.retry(), stop: () => supervision.stop() };
}

/**
 * Collects what `report` throws during a step and throws it once the
 * outermost step is done, since a launcher may call back inside `start`.
 */
class Steps {
  private readonly errors: unknown[] = [];
  private depth = 0;
  private readonly report: (event: EngineStartEvent) => void;

  constructor(report: (event: EngineStartEvent) => void) {
    this.report = report;
  }

  emit(event: EngineStartEvent): void {
    try {
      this.report(event);
    } catch (error) {
      this.errors.push(error);
    }
  }

  wrap<Args extends unknown[]>(work: (...args: Args) => void): (...args: Args) => void {
    return (...args) => {
      this.depth += 1;
      try {
        work(...args);
      } finally {
        this.depth -= 1;
      }
      if (this.depth === 0 && this.errors.length > 0) {
        const thrown = this.errors.splice(0);
        throw thrown.length === 1
          ? thrown[0]
          : new AggregateError(thrown, "Several engine.connection listeners failed.");
      }
    };
  }
}

class Supervision {
  private current: Attempt | undefined;
  private restartTimer: unknown;
  private restartedAt: number | undefined;
  private readonly launcher: EngineLauncher;
  private readonly timers: AnnouncerTimers;
  private readonly steps: Steps;
  readonly retry: () => void;

  constructor(launcher: EngineLauncher, timers: AnnouncerTimers, steps: Steps) {
    this.launcher = launcher;
    this.timers = timers;
    this.steps = steps;
    this.retry = steps.wrap(() => {
      this.stop();
      this.restartedAt = undefined;
      this.launch(1);
    });
  }

  stop(): void {
    this.timers.clearTimeout(this.restartTimer);
    this.restartTimer = undefined;
    if (this.current !== undefined) {
      this.end(this.current);
    }
  }

  private launch(attempt: number, lastExitCode?: number | null): void {
    const run: Attempt = { phase: "starting" };
    this.current = run;
    const since = this.timers.now();
    this.steps.emit(
      lastExitCode === undefined
        ? { state: "starting", attempt, since }
        : { state: "starting", attempt, since, lastExitCode },
    );
    run.answerTimer = this.timers.setTimeout(
      this.steps.wrap(() => {
        if (run.phase === "starting") {
          this.fail(run, { reason: "no-answer" });
        }
      }),
      engineAnswerTimeoutMs,
    );
    const process = this.launcher.start(this.eventsFor(run));
    run.process = process;
    // The launcher may report an ending before `start` returns.
    if (run.phase === "ended") {
      process.stop();
    }
  }

  private eventsFor(run: Attempt): EngineProcessEvents {
    return {
      ready: this.steps.wrap(() => {
        if (run.phase !== "starting") {
          return;
        }
        run.phase = "running";
        this.timers.clearTimeout(run.answerTimer);
        this.steps.emit({ state: "connected" });
      }),
      dataFolderNotWritable: this.steps.wrap(() => {
        if (run.phase !== "ended") {
          this.fail(run, { reason: "data-folder-not-writable" });
        }
      }),
      exited: this.steps.wrap((code: number | null) => {
        if (run.phase === "starting") {
          this.fail(run, { reason: "stopped-while-starting", exitCode: code });
        } else if (run.phase === "running") {
          this.stoppedWhileRunning(run, code);
        }
      }),
    };
  }

  private stoppedWhileRunning(run: Attempt, code: number | null): void {
    run.phase = "ended";
    const restartedAt = this.restartedAt;
    if (restartedAt !== undefined && this.timers.now() - restartedAt < engineRestartWindowMs) {
      this.steps.emit({
        state: "failed",
        failure: { reason: "stopped-while-starting", exitCode: code },
      });
      return;
    }
    this.restartTimer = this.timers.setTimeout(
      this.steps.wrap(() => {
        this.restartTimer = undefined;
        this.restartedAt = this.timers.now();
        this.launch(2, code);
      }),
      engineRestartDelayMs,
    );
    this.steps.emit({ state: "lost" });
  }

  private fail(run: Attempt, failure: EngineStartFailure): void {
    this.end(run);
    this.steps.emit({ state: "failed", failure });
  }

  private end(run: Attempt): void {
    run.phase = "ended";
    this.timers.clearTimeout(run.answerTimer);
    run.process?.stop();
  }
}
