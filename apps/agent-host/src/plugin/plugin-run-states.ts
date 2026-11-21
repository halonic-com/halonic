import type { PluginBackendStartRun } from "@halonicjs/adapter-integration-runner";
import type { Clock } from "@halonicjs/ports";

/**
 * What the host says of one plugin's runner in this session: whether its
 * last start stopped because the sandbox failed (A23), and since when.
 */
export type PluginRunState =
  | { readonly stopped: true; readonly stoppedAt: string }
  | { readonly stopped: false };

/** The most plugins whose stop the host keeps at once, as many as may run at once and more. */
export const maxStoppedPlugins = 64;

/**
 * The plugins whose runner stopped because the fence failed though the
 * computer passed the sandbox check (A23, the plugin page's R15 on HAL-1873),
 * by plugin id, in memory only. A later start that runs clears it, and so does
 * **Check again**; it ends with the host.
 *
 * It only says what happened: the start gate decides every start as before,
 * and never falls back to running without the sandbox.
 */
export class PluginRunStates {
  readonly #clock: Clock;
  readonly #stopped = new Map<string, string>();

  constructor(clock: Clock) {
    this.#clock = clock;
  }

  /** The machine's `onStart`: what came of a gated start of `plugin`'s runner. */
  readonly started = (plugin: string, run: PluginBackendStartRun): void => {
    switch (run) {
      case "stopped":
        this.#record(plugin);
        return;
      case "fenced":
      case "unfenced":
        this.#stopped.delete(plugin);
        return;
      case "needs-yes":
        // Nothing ran: the page says that with R13, from the host's status.
        return;
    }
  };

  /** What the host says of `plugin` now. */
  stateOf(plugin: string): PluginRunState {
    const stoppedAt = this.#stopped.get(plugin);
    return stoppedAt === undefined ? { stopped: false } : { stopped: true, stoppedAt };
  }

  /** **Check again**: forgets the stop, so the page shows the status and the next call tries the sandbox again. */
  forget(plugin: string): void {
    this.#stopped.delete(plugin);
  }

  #record(plugin: string): void {
    this.#stopped.delete(plugin);
    // Kept short: the oldest stop goes first, so a flood of ids can't grow it.
    if (this.#stopped.size >= maxStoppedPlugins) {
      const oldest = this.#stopped.keys().next().value;
      if (oldest !== undefined) this.#stopped.delete(oldest);
    }
    this.#stopped.set(plugin, this.#clock.now().toISOString());
  }
}
