import type { EngineConnectionState, RunExecutor } from "@halonicjs/ports";
import type { Announcer } from "../announcer/announcer.ts";
import type { AnnouncerTimers } from "../announcer/timers.ts";
import { ShellError } from "../shell-error.ts";
import {
  type EngineLauncher,
  type EngineStartEvent,
  type EngineSupervisor,
  superviseEngine,
} from "./engine-start.ts";

/**
 * The payload of the shell's `engine.connection` event. A followed executor
 * only moves between `connected` and `lost`; a supervised engine also
 * reports `starting` and `failed`.
 */
export type EngineConnectionEvent = EngineStartEvent;

/** The engine's state as the shell sees it. */
export type ShellEngineState = EngineConnectionEvent["state"];

/** Receives `engine.connection` events. */
export type EngineConnectionListener = (event: EngineConnectionEvent) => void;

/**
 * The window's view of the engine connection. The app hands it the
 * executor it chose at start-up, or, on the desktop, the launcher of the
 * engine process; features listen here instead of to the executor, so the
 * change is announced once, not once per feature.
 */
export interface ShellEngine {
  /** The state now: `connected` until the executor or the engine says otherwise. */
  readonly connection: ShellEngineState;
  /** The last event sent, with its details, such as the reason of a failed start. */
  readonly status: EngineConnectionEvent;
  /**
   * Follows an executor's connection. An executor without `connection`
   * counts as always connected. Returns a function that stops following it.
   *
   * If a listener throws on the first state, the watch is undone before the
   * error is thrown, so no `stop` is lost and the shell can watch again.
   *
   * @throws ShellError when the shell already follows an executor or an engine
   */
  watch(executor: Pick<RunExecutor, "connection">): () => void;
  /**
   * Starts the engine process with `launcher` and keeps it running: one
   * restart 2 s after it stops, and a failure with its reason when it
   * doesn't start or stops again within 60 s. Returns `retry` (Try again
   * after a failure) and `stop` (also stops following it).
   *
   * If a listener throws on the first state, the engine is stopped and the
   * supervision undone before the error is thrown.
   *
   * @throws ShellError when the shell already follows an executor or an engine
   */
  supervise(launcher: EngineLauncher): EngineSupervisor;
  /**
   * Listens to `engine.connection`, sent once for each change of state.
   * Returns a function that stops listening.
   */
  on(event: "engine.connection", listener: EngineConnectionListener): () => void;
}

/** What is read to screen readers when the connection changes. */
export const engineConnectionAnnouncements: Readonly<Record<EngineConnectionState, string>> = {
  lost: "Lost the connection to the engine.",
  connected: "Connected to the engine again.",
};

/**
 * Creates the window's engine connection. Each change is sent as
 * `engine.connection`. A loss is announced assertively, and the return
 * after a loss politely; `starting` and `failed` aren't announced until
 * their wording is approved (HAL-1720).
 * If listeners throw, every listener still runs and the first error is
 * thrown afterwards (all of them, as an `AggregateError`, when several do).
 */
export function createShellEngine(announcer: Announcer, timers: AnnouncerTimers): ShellEngine {
  let status: EngineConnectionEvent = { state: "connected" };
  let lostSinceConnected = false;
  let stopFollowing: (() => void) | undefined;
  const listeners = new Set<EngineConnectionListener>();

  const change = (next: EngineConnectionEvent): void => {
    if (next.state === status.state && (next.state === "connected" || next.state === "lost")) {
      return;
    }
    status = next;
    announceChange(next.state);
    notify(listeners, next);
  };

  const announceChange = (state: ShellEngineState): void => {
    if (state === "lost") {
      lostSinceConnected = true;
      announcer.announce(engineConnectionAnnouncements.lost, "assertive");
    } else if (state === "connected" && lostSinceConnected) {
      lostSinceConnected = false;
      announcer.announce(engineConnectionAnnouncements.connected, "polite");
    }
  };

  /** Takes the one follow slot, so the shell never follows two sources. */
  const claim = (undo: () => void): (() => void) => {
    if (stopFollowing !== undefined) {
      throw new ShellError(
        "The shell already follows an executor or an engine. Stop the first one before following another.",
      );
    }
    const stop = (): void => {
      undo();
      if (stopFollowing === stop) {
        stopFollowing = undefined;
      }
    };
    stopFollowing = stop;
    return stop;
  };

  return {
    get connection() {
      return status.state;
    },
    get status() {
      return status;
    },
    watch(executor) {
      let unsubscribe = (): void => {};
      const stop = claim(() => unsubscribe());
      const connection = executor.connection;
      unsubscribe = connection?.onChange((state) => change({ state })) ?? unsubscribe;
      try {
        change({ state: connection?.state ?? "connected" });
      } catch (error) {
        stop();
        throw error;
      }
      return stop;
    },
    supervise(launcher) {
      const supervisor = superviseEngine(launcher, timers, change);
      const stop = claim(() => supervisor.stop());
      try {
        supervisor.retry();
      } catch (error) {
        stop();
        throw error;
      }
      return {
        retry() {
          if (stopFollowing !== stop) {
            throw new ShellError("This engine is no longer supervised. Call supervise again.");
          }
          supervisor.retry();
        },
        stop,
      };
    },
    on(_event, listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function notify(
  listeners: ReadonlySet<EngineConnectionListener>,
  event: EngineConnectionEvent,
): void {
  const errors: unknown[] = [];
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 1) {
    throw errors[0];
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, "Several engine.connection listeners failed.");
  }
}
