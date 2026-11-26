// Pauses a local integration's connector when its runner reports a block
// that pauses (HAL-19188 PR 2): a request to a host the sheet doesn't list,
// or a kit refusal on the leak list. The runner reports the block before it
// answers the integration's code, so the pause is made and the runner is
// stopped first: the code never gets the refusal, and a retry, even in the
// same tick, finds no runner and a start that the pause refuses.
//
// A fence or protocol block stops the runner as before but doesn't pause the
// connector; that is HAL-19193.

import type { RunnerBlock, RunnerConnection } from "@halonicjs/adapter-integration-runner";
import {
  ConnectorPausedError,
  type ConnectorPauseKey,
  type ConnectorPauses,
  type ConnectorPauseWhy,
} from "@halonicjs/app";

/**
 * The pause of one runner start. Give `onBlocked` to the runner, then the
 * started runner to {@link RunnerBlockPause.started}.
 *
 * @example
 * const pausing = new RunnerBlockPause(pauses, key, (error) => report(error));
 * const runner = pausing.started(await startRunner({ ...options, onBlocked: pausing.onBlocked }));
 */
export class RunnerBlockPause {
  readonly #pauses: ConnectorPauses;
  readonly #key: ConnectorPauseKey;
  readonly #saveFailed: (error: unknown) => void;
  #runner: RunnerConnection | undefined;
  /** Set once the connector is paused: every call of this runner fails with it. */
  #paused: ConnectorPausedError | undefined;

  /**
   * @param key - the connector and the trusted code this start runs
   * @param saveFailed - hears a pause that couldn't be saved; it holds in this process all the same
   */
  constructor(
    pauses: ConnectorPauses,
    key: ConnectorPauseKey,
    saveFailed: (error: unknown) => void,
  ) {
    this.#pauses = pauses;
    this.#key = key;
    this.#saveFailed = saveFailed;
  }

  /** For the runner's `onBlocked`. It pauses and stops the runner before it returns. */
  readonly onBlocked = (block: RunnerBlock): void => {
    const why = pauseWhy(block);
    if (why === undefined || this.#paused !== undefined) return;
    const { pause, saved } = this.#pauses.pause(this.#key, why);
    saved.catch(this.#saveFailed);
    this.#paused = new ConnectorPausedError(this.#key.connector, "connector-paused", pause);
    this.#stop();
  };

  /** The runner as the loader gets it: a call that fails because of the pause fails with it. */
  started(runner: RunnerConnection): RunnerConnection {
    this.#runner = runner;
    if (this.#paused !== undefined) this.#stop();
    return {
      declaration: runner.declaration,
      stopped: runner.stopped,
      callTool: async (name, args, signal) => {
        try {
          return await runner.callTool(name, args, signal);
        } catch (error) {
          throw this.#paused ?? error;
        }
      },
      close: () => runner.close(),
    };
  }

  /** Stops the runner now: `close` stops it before its first wait, so every call in flight fails at once. */
  #stop(): void {
    this.#runner?.close().catch(() => undefined);
  }
}

/** Why a block pauses the connector, or `undefined` for one that doesn't. */
function pauseWhy(block: RunnerBlock): ConnectorPauseWhy | undefined {
  switch (block.kind) {
    case "host-not-declared":
      return { kind: "host-not-declared", host: block.host };
    case "leak-attempt":
      return { kind: "leak-attempt", code: block.code };
    case "fence":
    case "protocol":
      return undefined;
  }
}
