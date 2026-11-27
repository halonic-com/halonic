import type { SkipRecord } from "@halonicjs/app/routines";
import type { RunSummary } from "@halonicjs/events";
import type { SendOptions } from "@halonicjs/ports";
import type { RunFeedListener } from "../runs/workspace-runs.ts";
import type { EngineService, RoutineRunStart } from "./engine-service.ts";
import type { PageRuns } from "./page-refusal.ts";
import type { RemoteEngine } from "./remote-engine.ts";

/** What the page's own engine gives a {@link LateEngine}. */
export type OwnEngine = Pick<
  EngineService,
  | "startRun"
  | "startRoutine"
  | "routineSkips"
  | "onRoutineSkips"
  | "send"
  | "cancel"
  | "openForStart"
  | "pageRuns"
>;

/** A background engine that hasn't answered yet can start all this; it checks again at the start. */
const backgroundPageRuns: PageRuns = { runsHarnesses: true, startsConnectors: true };

/**
 * The engine a folder's pages use from the moment the folder opens, before the shell has said
 * whether its background engine runs (HAL-19965): the workspace shows from its files at once, and
 * only what needs an engine waits. Each call waits for the shell's answer, then goes to the
 * background engine when it answered, else to the page's own engine (`studio.remote-engine`), so
 * nothing starts before the engine that runs it is chosen.
 */
export class LateEngine {
  readonly #chosen: Promise<RemoteEngine | OwnEngine>;
  readonly #background: Promise<RemoteEngine | undefined>;
  #settled: RemoteEngine | OwnEngine | undefined;

  /**
   * @param background the shell's answer, `openShellEngine`: the background engine, or none
   * @param own the page's own engine, read once the shell answered that there is no background
   *   engine; it opens only then
   */
  constructor(background: Promise<RemoteEngine | undefined>, own: () => OwnEngine) {
    this.#background = background;
    this.#chosen = background.then((remote) => {
      this.#settled = remote ?? own();
      return this.#settled;
    });
  }

  /** The engine that runs the folder, once the shell answered; a chat answers on it (`chatExecutorOf`). */
  chosen(): Promise<RemoteEngine | OwnEngine> {
    return this.#chosen;
  }

  /** The background engine once the shell answered, or `undefined` when the page runs its own. */
  background(): Promise<RemoteEngine | undefined> {
    return this.#background;
  }

  /** What the chosen engine can start; until it is chosen, what a background engine can. */
  get pageRuns(): PageRuns {
    return this.#settled?.pageRuns ?? backgroundPageRuns;
  }

  /** Starts a run of the workflow on the chosen engine; `from` counts only on the page's own. */
  async startRun(
    run: { readonly hubId: string; readonly workflowId: string },
    input: Record<string, unknown>,
    from: "manual" | "inbox" = "manual",
  ): Promise<{ readonly id: string }> {
    const engine = await this.#chosen;
    return isOwn(engine) ? engine.startRun(run, input, from) : engine.startRun(run, input);
  }

  /** Starts what a routine runs, for its Run now, on the chosen engine. */
  async startRoutine(
    start: RoutineRunStart,
    trigger: { readonly routineKey: string; readonly at: string },
  ): Promise<{ readonly id: string }> {
    return (await this.#chosen).startRoutine(start, trigger);
  }

  /** A routine's skip records from the chosen engine. */
  async routineSkips(routineKey: string): Promise<readonly SkipRecord[]> {
    return (await this.#chosen).routineSkips(routineKey);
  }

  /** Hears the chosen engine's new skip records; returns the way to stop, before or after it is chosen. */
  onRoutineSkips(listener: () => void): () => void {
    let stopped = false;
    let stop = (): void => {
      stopped = true;
    };
    void this.#chosen.then((engine) => {
      if (!stopped) stop = engine.onRoutineSkips(listener);
    });
    return () => stop();
  }

  /** Sends `event` to a waiting run on the chosen engine. */
  async send(
    runId: string,
    event: string,
    payload?: unknown,
    options?: SendOptions,
  ): Promise<RunSummary> {
    return (await this.#chosen).send(runId, event, payload, options);
  }

  /** Cancels a run on the chosen engine. */
  async cancel(runId: string): Promise<RunSummary> {
    return (await this.#chosen).cancel(runId);
  }

  /**
   * Follows the background engine's run changes, once it answered. With the page's own engine
   * there is no feed: it ends at once, so the runs are read again every 10 s as before.
   */
  followRuns(listener: RunFeedListener): () => void {
    let stopped = false;
    let stop = (): void => {
      stopped = true;
    };
    this.#background.then(
      (remote) => {
        if (stopped) return;
        if (remote === undefined) listener.ended();
        else stop = remote.followRuns(listener);
      },
      (error: unknown) => {
        if (!stopped) listener.ended(error);
      },
    );
    return () => stop();
  }
}

function isOwn(engine: RemoteEngine | OwnEngine): engine is OwnEngine {
  return "openForStart" in engine;
}
