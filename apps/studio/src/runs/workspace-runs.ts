import {
  defaultCurrency,
  type HubWorkflow,
  hubWorkflows,
  type RoutineClock,
  routineClocks,
  workflowIn,
} from "@halonicjs/app";
import { type RunSummary, sendsOf } from "@halonicjs/events";
import type { DefinitionStore, DefinitionWatch, RunStore } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import type { InboxRuns } from "@halonicjs/studio-feature-inbox/api";
import type {
  RunRoutine,
  RunsSource,
  RunWorkflow,
  SourcedRun,
} from "@halonicjs/studio-feature-runs/api";
import { filesOf, loadWorkspace } from "@halonicjs/workspace";

/** How often the runs are read again to see whether one changed: every 10 s (states K5). */
export const runsPollInterval = 10_000;

/** How the runs are read again on a schedule; tests pass a fake one. */
export interface PollTimer {
  /** Calls `tick` every `ms` until the returned function is called. */
  every(ms: number, tick: () => void): () => void;
}

/** What {@link WorkspaceRuns} reads. */
export interface WorkspaceRunsOptions {
  /** The workspace's runs, the same files the CLI reads. */
  readonly runs: Pick<RunStore, "list" | "events">;
  /** The workspace's files, for the workflows' and routines' names and the currency. */
  readonly definitions: DefinitionStore;
  /** Defaults to `setInterval`. */
  readonly timer?: PollTimer;
  /**
   * Calls its listener when the window comes to the front, so the runs are
   * read again then too (K5); returns a function that stops it.
   */
  readonly onFocus?: (listener: () => void) => () => void;
}

/** What the workspace's files say about its runs. */
interface WorkspaceFacts {
  readonly workflows: readonly HubWorkflow[];
  /** By key, the `trigger.routineId` of the runs each starts. */
  readonly routines: ReadonlyMap<string, RoutineClock>;
  readonly currency: string;
}

const systemTimer: PollTimer = {
  every: (ms, tick) => {
    const id = setInterval(tick, ms);
    return () => clearInterval(id);
  },
};

/**
 * The runs of one open workspace as the Runs feature and the Inbox read them,
 * from its run logs (requirement `studio.workspace-runs`).
 *
 * Nothing in the window runs a workflow yet, so a run changes only when
 * something else writes its log, such as `halonic run`. While anyone listens,
 * the runs are read again every 10 s and when the window comes to the front,
 * and listeners hear only when a run started, moved on or ended. Answering a
 * run needs the engine, which the window doesn't have yet (HAL-6602), so
 * {@link WorkspaceRuns.send} fails as `unavailable`.
 *
 * @example
 * const runs = new WorkspaceRuns({ runs: new TauriRunStore(ipc, folder), definitions });
 * services.provide(RunsSourceService, runs);
 * services.provide(InboxRunsService, runs);
 */
export class WorkspaceRuns implements RunsSource, InboxRuns {
  readonly #options: WorkspaceRunsOptions;
  readonly #listeners = new Set<() => void>();
  /** Whether each run's log had a tool call, by run id, at the summary's `lastSeq`. */
  readonly #toolCalls = new Map<string, { readonly lastSeq: number; readonly made: boolean }>();
  #facts: WorkspaceFacts | undefined;
  /** Whether the files changed since {@link WorkspaceRuns.#facts} was read, or can't be watched. */
  #factsStale = true;
  #watch: Promise<DefinitionWatch | undefined> | undefined;
  #watchBroken = false;
  #stopPolling: (() => void) | undefined;
  /** Each run's id and last event as the last poll saw them; `undefined` before the first. */
  #seen: string | undefined;
  #polling = false;
  #disposed = false;

  constructor(options: WorkspaceRunsOptions) {
    this.#options = options;
  }

  async list(): Promise<SourcedRun[]> {
    await this.#readFacts();
    const summaries = await this.#options.runs.list();
    return Promise.all(
      summaries.map(async (summary) => ({
        summary,
        madeToolCalls: await this.#madeToolCalls(summary),
      })),
    );
  }

  workflow(hubId: string, workflowId: string): RunWorkflow | undefined {
    const workflow = workflowIn(this.#facts?.workflows ?? [], hubId, workflowId);
    if (workflow === undefined) return undefined;
    return {
      name: workflow.name,
      stepDescription: (stateId) => workflow.states[stateId]?.description,
    };
  }

  routine(key: string): RunRoutine | undefined {
    return this.#facts?.routines.get(key);
  }

  currency(): string {
    return this.#facts?.currency ?? defaultCurrency;
  }

  waiting(): Promise<RunSummary[]> {
    return this.#options.runs.list({ status: ["waiting"] });
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    this.#startWatching();
    return () => {
      this.#listeners.delete(listener);
      if (this.#listeners.size === 0) this.#stopWatching();
    };
  }

  async send(): Promise<RunSummary> {
    throw new KindedError(
      "unavailable",
      "The Studio can't answer a run yet: it has no engine of its own (HAL-6602).",
    );
  }

  /** Stops reading the runs and closes the watch on the files. Disposing twice is fine. */
  async dispose(): Promise<void> {
    this.#disposed = true;
    this.#listeners.clear();
    this.#stopWatching();
  }

  /** Reads the workspace's files again when they changed since the last read. */
  async #readFacts(): Promise<void> {
    if (!this.#factsStale && !this.#watchBroken && this.#facts !== undefined) return;
    // Cleared before the read, so a change during it marks the facts stale again.
    this.#factsStale = false;
    const workspace = await loadWorkspace(this.#options.definitions);
    const settings = filesOf(workspace, "workspace")[0]?.value;
    this.#facts = {
      workflows: hubWorkflows(workspace),
      routines: routineClocks(workspace),
      currency: settings?.budget?.currency ?? defaultCurrency,
    };
  }

  /** Whether the run's log has a tool call, read once for each event the run adds. */
  async #madeToolCalls(summary: RunSummary): Promise<boolean> {
    const known = this.#toolCalls.get(summary.id);
    // A log only grows, so a run that made a tool call always has made one.
    if (known !== undefined && (known.made || known.lastSeq === summary.lastSeq)) {
      return known.made;
    }
    const made = sendsOf(await this.#options.runs.events(summary.id)).madeToolCalls;
    this.#toolCalls.set(summary.id, { lastSeq: summary.lastSeq, made });
    return made;
  }

  #startWatching(): void {
    if (this.#stopPolling !== undefined || this.#disposed) return;
    const timer = this.#options.timer ?? systemTimer;
    const stopTimer = timer.every(runsPollInterval, () => void this.#poll());
    const stopFocus = this.#options.onFocus?.(() => void this.#poll()) ?? (() => {});
    this.#stopPolling = () => {
      stopTimer();
      stopFocus();
    };
    this.#watch = this.#options.definitions
      .watch({
        changed: () => {
          this.#factsStale = true;
          this.#tell();
        },
        failed: () => {
          this.#watchBroken = true;
        },
      })
      .catch(() => {
        // Without a watch the files are read again on every list.
        this.#watchBroken = true;
        return undefined;
      });
    // What the runs are now, so the first tick can tell a change.
    void this.#poll();
  }

  #stopWatching(): void {
    this.#stopPolling?.();
    this.#stopPolling = undefined;
    this.#seen = undefined;
    const watch = this.#watch;
    this.#watch = undefined;
    // A closed watch can't be told apart from a broken one, so the next list reads the files.
    this.#factsStale = true;
    void watch?.then((open) => open?.close());
  }

  /** Reads the runs and tells the listeners when one started, moved on or ended. */
  async #poll(): Promise<void> {
    if (this.#polling) return;
    this.#polling = true;
    try {
      const summaries = await this.#options.runs.list();
      const seen = summaries.map((run) => `${run.id}@${run.lastSeq}`).join(" ");
      const changed = this.#seen !== undefined && seen !== this.#seen;
      this.#seen = seen;
      if (changed) this.#tell();
    } catch {
      // The next poll tries again; a list that fails shows on the page that lists.
    } finally {
      this.#polling = false;
    }
  }

  #tell(): void {
    for (const listener of [...this.#listeners]) listener();
  }
}
