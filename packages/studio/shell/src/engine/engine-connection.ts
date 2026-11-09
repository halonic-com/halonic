import type { EngineConnectionState, RunExecutor } from "@halonicjs/ports";
import type { Announcer } from "../announcer/announcer.ts";
import { ShellError } from "../shell-error.ts";

/** The payload of the shell's `engine.connection` event. */
export interface EngineConnectionEvent {
  readonly state: EngineConnectionState;
}

/** Receives `engine.connection` events. */
export type EngineConnectionListener = (event: EngineConnectionEvent) => void;

/**
 * The window's view of the engine connection. The app hands it the
 * executor it chose at start-up; features listen here instead of to the
 * executor, so the change is announced once, not once per feature.
 */
export interface ShellEngine {
  /** The state now: `connected` until the executor says otherwise. */
  readonly connection: EngineConnectionState;
  /**
   * Follows an executor's connection. An executor without `connection`
   * counts as always connected. Returns a function that stops following it.
   *
   * If a listener throws on the first state, the watch is undone before the
   * error is thrown, so no `stop` is lost and the shell can watch again.
   *
   * @throws ShellError when the shell already follows an executor
   */
  watch(executor: Pick<RunExecutor, "connection">): () => void;
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
 * Creates the window's engine connection. Each change is announced, the
 * loss assertively and the return politely, and sent as `engine.connection`.
 * If listeners throw, every listener still runs and the first error is
 * thrown afterwards (all of them, as an `AggregateError`, when several do).
 */
export function createShellEngine(announcer: Announcer): ShellEngine {
  let state: EngineConnectionState = "connected";
  let stopWatching: (() => void) | undefined;
  const listeners = new Set<EngineConnectionListener>();

  const change = (next: EngineConnectionState): void => {
    if (next === state) {
      return;
    }
    state = next;
    announcer.announce(
      engineConnectionAnnouncements[next],
      next === "lost" ? "assertive" : "polite",
    );
    notify(listeners, { state: next });
  };

  return {
    get connection() {
      return state;
    },
    watch(executor) {
      if (stopWatching !== undefined) {
        throw new ShellError(
          "The shell already follows an executor's connection. Stop the first watch before following another.",
        );
      }
      const connection = executor.connection;
      const unsubscribe = connection?.onChange(change) ?? (() => {});
      const stop = (): void => {
        unsubscribe();
        if (stopWatching === stop) {
          stopWatching = undefined;
        }
      };
      stopWatching = stop;
      try {
        change(connection?.state ?? "connected");
      } catch (error) {
        stop();
        throw error;
      }
      return stop;
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
