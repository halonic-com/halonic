import { runStanding } from "@halonicjs/app";
import { type PlaceSignal, type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { RunsSource, SourcedRun } from "./api.ts";
import type { WorkflowRef } from "./list/runs-filter.ts";
import { pageWords } from "./run-words.ts";

/** What the Runs list holds now. */
export interface RunsListState {
  /** Every run, newest start first: the last list that loaded, or none before the first. */
  readonly runs: readonly SourcedRun[];
  /** Whether a list has loaded once, so "no runs yet" can be told from "not loaded yet". */
  readonly loaded: boolean;
  /** Why the last load failed, until one succeeds; the runs stay as they were. */
  readonly error: unknown;
  /**
   * The names `halonic run` takes for the workspace's workflows, in the Workflows list's order;
   * `undefined` until they are read and when reading them failed, so the empty lines then name none.
   */
  readonly workflows: readonly string[] | undefined;
}

/**
 * The runs of one open workspace, kept current from its `RunsSource`. The
 * sidebar's running dot and the Runs page read this one service, so they
 * change together. A refresh only swaps the runs: the page never shows a
 * skeleton again once a list has loaded (states D1).
 *
 * @example
 * const list = new RunsList(source);
 * list.subscribe(() => render(list.state.runs));
 */
export class RunsList {
  readonly source: RunsSource;
  #state: RunsListState = { runs: [], loaded: false, error: undefined, workflows: undefined };
  readonly #listeners = new Set<() => void>();
  readonly #stopWatching: () => void;
  #loads = 0;
  #requested: WorkflowRef | undefined;
  #disposed = false;

  constructor(source: RunsSource) {
    this.source = source;
    this.#stopWatching = source.subscribe(() => void this.refresh());
    void this.refresh();
  }

  get state(): RunsListState {
    return this.#state;
  }

  /**
   * The workflow the Runs page should open filtered to, asked for by {@link showWorkflow} and
   * kept until the page has taken it ({@link clearRequest}); `undefined` for a plain open.
   */
  get requestedWorkflow(): WorkflowRef | undefined {
    return this.#requested;
  }

  /**
   * Asks for the next opening of the Runs page to show only this workflow's runs, as a workflow's
   * **See all** does. Call it, then open the Runs place.
   */
  showWorkflow(workflow: WorkflowRef): void {
    this.#requested = workflow;
  }

  /** Forgets the request once the page has read it, so a later plain open shows every workflow. */
  clearRequest(): void {
    this.#requested = undefined;
  }

  /**
   * The sidebar's still running dot while a run is running, read "1 running";
   * nothing otherwise. No count of runs that need you: the Inbox has that.
   */
  signal(): PlaceSignal | undefined {
    const running = this.#state.runs.filter((run) => runStanding(run.summary) === "running");
    if (running.length === 0) {
      return undefined;
    }
    return { mark: "running", value: running.length, spoken: pageWords.running(running.length) };
  }

  /**
   * Loads the runs again. When loads overlap, only the last one started
   * counts, so an older answer never overwrites a newer one. Once the
   * workspace has closed it does nothing.
   */
  async refresh(): Promise<void> {
    if (this.#disposed) return;
    const load = ++this.#loads;
    try {
      const [runs, workflows] = await Promise.all([
        this.source.list(),
        // A failed read only leaves the lines without a name; it isn't the list's error.
        this.source.runnableWorkflows().catch(() => undefined),
      ]);
      if (load !== this.#loads || this.#disposed) return;
      this.#set({ runs, loaded: true, error: undefined, workflows });
    } catch (error) {
      if (load !== this.#loads || this.#disposed) return;
      this.#set({ ...this.#state, error });
    }
  }

  /** Calls `listener` after every change of {@link state}. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Stops watching the runs, when the workspace closes and its services are disposed. */
  dispose(): void {
    this.#disposed = true;
    this.#stopWatching();
    this.#listeners.clear();
  }

  #set(state: RunsListState): void {
    this.#state = state;
    for (const listener of [...this.#listeners]) listener();
  }
}

/** The open workspace's {@link RunsList}; the Runs feature provides it from `RunsSourceService`. */
export const RunsListService: ServiceKey<RunsList> = serviceKey<RunsList>("runs.list");
