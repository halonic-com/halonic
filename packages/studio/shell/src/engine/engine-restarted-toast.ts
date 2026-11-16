import type { ToastStore } from "@halonicjs/studio-kit";
import type { ShellEngine } from "./engine-connection.ts";

/** What {@link watchEngineRestart} needs from the window. */
export interface EngineRestartOptions {
  /** The window's engine connection, `shell.engine`. */
  readonly engine: ShellEngine;
  /** The window's toasts, `shell.toasts`. */
  readonly toasts: ToastStore;
  /** Opens the Runs list, for **Open Runs**. */
  readonly openRuns: () => void;
}

/** The second line of the toast (microcopy 22 F15b): "2 runs stopped; you can run them again." */
export function stoppedRunsText(count: number): string {
  return count === 1
    ? "1 run stopped; you can run it again."
    : `${count} runs stopped; you can run them again.`;
}

/**
 * Shows an info toast when the engine answers again after the shell restarted it (microcopy 22
 * F15b). With runs that the restart ended, the toast counts them and **Open Runs** opens the
 * list; without, it is the one phrase. A first start and a start after Try again are not restarts
 * and show nothing. Returns a function that stops watching.
 *
 * @example
 * const stop = watchEngineRestart({ engine: shell.engine, toasts: shell.toasts, openRuns });
 */
export function watchEngineRestart(options: EngineRestartOptions): () => void {
  let restarting = false;
  return options.engine.on("engine.connection", (event) => {
    if (event.state === "starting") {
      restarting = event.attempt > 1;
      return;
    }
    if (event.state !== "connected") {
      restarting &&= event.state === "lost";
      return;
    }
    const wasRestart = restarting;
    restarting = false;
    if (!wasRestart) {
      return;
    }
    const stopped = event.interruptedRuns ?? 0;
    options.toasts.show({
      tone: "info",
      title: "The engine stopped and has started again.",
      ...(stopped > 0
        ? {
            text: stoppedRunsText(stopped),
            action: { label: "Open Runs", onClick: options.openRuns },
          }
        : {}),
    });
  });
}
