import type { RunEvent } from "@halonicjs/events";
import type { RunsList } from "@halonicjs/studio-feature-runs/api";
import type { ItemRef } from "@halonicjs/studio-shell";
import type { SampleStepId, SampleWorkspace } from "./api.ts";

/** The Acme sample's one request workflow, as its id is in the workspace. */
export const SUPPORT_WORKFLOW = "support-reply";

/** What the progress reads of the runs list: its runs, their logs, and which pages were opened. */
export type SampleRuns = Pick<RunsList, "state" | "subscribe" | "hasOpened"> & {
  readonly source: Pick<RunsList["source"], "log">;
};

/** What Try the sample knows about the open sample: the steps done, and the run it can open. */
export interface SampleProgressState {
  readonly done: ReadonlySet<SampleStepId>;
  /** The latest finished run of the support workflow, which step 3 opens; `undefined` before one. */
  readonly finishedRun: ItemRef | undefined;
}

/**
 * Follows the open sample's runs and tells which steps of the Try the sample card are done
 * (flow-first-run 3.3): a run of the support workflow has started; one of its wait steps has been
 * answered (an `event.received` in the log of a run that has finished); the page of a finished one has been opened. A step stays done: it is saved through the
 * workspace as soon as it is seen.
 *
 * @example
 * const progress = new SampleProgress(runsList, workspace);
 * progress.subscribe(() => render(progress.state.done));
 */
export class SampleProgress {
  readonly #runs: SampleRuns;
  readonly #workspace: SampleWorkspace;
  readonly #listeners = new Set<() => void>();
  readonly #stopWatching: () => void;
  /** The finished runs whose log was read for an answer, so a refresh doesn't read it again. */
  readonly #logsRead = new Set<string>();
  #state: SampleProgressState;
  #disposed = false;
  /** Whether an earlier visit already showed the finished card; fixed when this visit began. */
  readonly #finishedBefore: boolean;

  constructor(runs: SampleRuns, workspace: SampleWorkspace) {
    this.#runs = runs;
    this.#workspace = workspace;
    this.#state = { done: new Set(workspace.doneSteps()), finishedRun: undefined };
    this.#finishedBefore = workspace.finishedShown();
    this.#stopWatching = runs.subscribe(() => void this.#read());
    void this.#read();
  }

  get state(): SampleProgressState {
    return this.#state;
  }

  /**
   * Whether the card is gone: an earlier visit showed it finished (flow-first-run 3.3). The visit
   * in which it finished still shows it, so this stays the same until the workspace opens again.
   */
  get hidden(): boolean {
    return this.#finishedBefore;
  }

  /** Saves that the finished card was shown, so the next visit has no card. */
  recordFinishedShown(): void {
    if (!this.#disposed) this.#workspace.recordFinishedShown();
  }

  /** Opens the New workspace dialog, or `undefined` when the app has none. */
  get startOwnWorkspace(): (() => void) | undefined {
    return this.#workspace.startOwnWorkspace?.bind(this.#workspace);
  }

  /** Calls `listener` after every change of {@link state}. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Stops watching the runs, when the workspace closes. */
  dispose(): void {
    this.#disposed = true;
    this.#stopWatching();
    this.#listeners.clear();
  }

  #supportRuns() {
    return this.#runs.state.runs
      .map((each) => each.summary)
      .filter((run) => run.kind === "run" && run.workflowId === SUPPORT_WORKFLOW);
  }

  async #read(): Promise<void> {
    const runs = this.#supportRuns();
    if (runs.length > 0) this.#markDone("start");
    const finished = runs.find((run) => run.status === "completed");
    this.#setFinished(
      finished === undefined ? undefined : { kind: "run", hub: finished.hubId, id: finished.id },
    );
    if (runs.some((run) => run.status === "completed" && this.#runs.hasOpened(run.id))) {
      this.#markDone("see");
    }
    for (const run of runs) {
      // A run still going has no answer to count yet; only a finished run's log is read, once.
      if (run.status === "running" || run.status === "waiting" || this.#logsRead.has(run.id)) {
        continue;
      }
      this.#logsRead.add(run.id);
      let log: RunEvent[];
      try {
        log = await this.#runs.source.log(run.id);
      } catch {
        // A log that can't be read now is read again on the next change: the step isn't lost.
        this.#logsRead.delete(run.id);
        continue;
      }
      if (log.some((event) => event.type === "event.received")) this.#markDone("decide");
    }
  }

  #setFinished(finishedRun: ItemRef | undefined): void {
    if (this.#disposed || finishedRun?.id === this.#state.finishedRun?.id) return;
    this.#set({ ...this.#state, finishedRun });
  }

  #markDone(step: SampleStepId): void {
    if (this.#disposed || this.#state.done.has(step)) return;
    this.#workspace.recordDone(step);
    this.#set({ ...this.#state, done: new Set([...this.#state.done, step]) });
  }

  #set(state: SampleProgressState): void {
    this.#state = state;
    for (const listener of [...this.#listeners]) listener();
  }
}
