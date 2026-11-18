import { defaultLocalAddress } from "@halonicjs/adapter-workspace-models";
import {
  defaultCurrency,
  type HubWorkflow,
  halonicCommand,
  hubWorkflows,
  isWindowsFolder,
  lookUpWorkflow,
  shortRunId,
  workflowIn,
} from "@halonicjs/app";
import { type RoutineClock, routineClocks } from "@halonicjs/app/routines";
import { type WorkspaceModels, workspaceModelsOf } from "@halonicjs/app/run-failure";
import type { RunEvent, RunSummary } from "@halonicjs/events";
import type { Provider } from "@halonicjs/format";
import type {
  DefinitionStore,
  DefinitionWatch,
  RunExecutor,
  RunStore,
  SendOptions,
} from "@halonicjs/ports";
import { AnswerElsewhere, type InboxRuns } from "@halonicjs/studio-feature-inbox/api";
import type {
  ProviderKind,
  RunnableWorkflow,
  RunRoutine,
  RunsSource,
  RunWorkflow,
  SourcedRun,
} from "@halonicjs/studio-feature-runs/api";
import {
  filesOf,
  type LoadedWorkspace,
  loadWorkspace,
  providerIsLocal,
} from "@halonicjs/workspace";

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
  /** The workspace's files, for the workflows', routines' and hubs' names and the currency. */
  readonly definitions: DefinitionStore;
  /**
   * Sends an event to a waiting run through the window's engine (`EngineService.send`). Left out,
   * {@link WorkspaceRuns.send} fails as `AnswerElsewhere` with the CLI line to copy.
   */
  readonly send?: RunExecutor["send"];
  /** The workspace folder's absolute path, which the commands to copy name (D1, HAL-12725). */
  readonly folder?: string;
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
  /** The files as read, for the models of a hub's runs. */
  readonly workspace: LoadedWorkspace;
  readonly workflows: readonly HubWorkflow[];
  /** By key, the `trigger.routineId` of the runs each starts. */
  readonly routines: ReadonlyMap<string, RoutineClock>;
  /** By id, where each provider the workspace has runs. */
  readonly providers: ReadonlyMap<string, ProviderKind>;
  /** By id, the `name` of each provider whose file gives one. */
  readonly providerNames: ReadonlyMap<string, string>;
  /** By id, each agent's name as its file says. */
  readonly agentNames: ReadonlyMap<string, string>;
  /** By id, each hub's name as its file says. */
  readonly hubNames: ReadonlyMap<string, string>;
  readonly currency: string;
  readonly monthly: number | undefined;
}

/** The real clock: `setInterval`. */
export const systemTimer: PollTimer = {
  every: (ms, tick) => {
    const id = setInterval(tick, ms);
    return () => clearInterval(id);
  },
};

/**
 * The runs of one open workspace as the Runs feature and the Inbox read them,
 * from its run logs (requirement `studio.workspace-runs`).
 *
 * A run changes when the window's engine or something else, such as
 * `halonic run`, writes its log. While anyone listens, the runs are read
 * again every 10 s, when the window comes to the front and after an answer
 * the window sent, and listeners hear only when a run started, moved on or
 * ended. An answer goes through the window's engine (`send`); without one,
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

  get folder(): string | undefined {
    return this.#options.folder;
  }

  async list(): Promise<SourcedRun[]> {
    await this.#readFacts();
    const summaries = await this.#options.runs.list();
    return summaries.map((summary) => ({ summary }));
  }

  log(runId: string): Promise<RunEvent[]> {
    return this.#options.runs.events(runId);
  }

  workflow(hubId: string, workflowId: string): RunWorkflow | undefined {
    const workflow = workflowIn(this.#facts?.workflows ?? [], hubId, workflowId);
    if (workflow === undefined) return undefined;
    return {
      name: workflow.name,
      stepDescription: (stateId) => workflow.states[stateId]?.description,
    };
  }

  agentName(agentId: string): string | undefined {
    return this.#facts?.agentNames.get(agentId);
  }

  hubName(hubId: string): string | undefined {
    return this.#facts?.hubNames.get(hubId);
  }

  routine(key: string): RunRoutine | undefined {
    return this.#facts?.routines.get(key);
  }

  async runnableWorkflows(): Promise<readonly RunnableWorkflow[]> {
    await this.#readFacts();
    const workflows = this.#facts?.workflows ?? [];
    // The Workflows list's order: the hubs as the workspace has them, each hub's workflows by name.
    const hubs = [...new Set(workflows.map((each) => each.hubId))];
    return hubs
      .flatMap((hubId) =>
        workflows
          .filter((each) => each.hubId === hubId)
          .toSorted((a, b) => a.workflow.name.localeCompare(b.workflow.name)),
      )
      .map(({ hubId, workflow }) => {
        // The name `halonic run` takes: the id, or `hub/id` when another hub has the same id.
        const lookup = lookUpWorkflow(workflows, workflow.id);
        const command = lookup.found === "several" ? `${hubId}/${workflow.id}` : workflow.id;
        return { hubId, id: workflow.id, name: workflow.name, command };
      });
  }

  providerKind(providerId: string): ProviderKind | undefined {
    return this.#facts?.providers.get(providerId);
  }

  providerName(providerId: string): string | undefined {
    return this.#facts?.providerNames.get(providerId);
  }

  models(hubId: string): WorkspaceModels | undefined {
    const workspace = this.#facts?.workspace;
    return workspace === undefined ? undefined : workspaceModelsOf(workspace, hubId, providerHost);
  }

  currency(): string {
    return this.#facts?.currency ?? defaultCurrency;
  }

  monthlyBudget(): number | undefined {
    return this.#facts?.monthly;
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

  /**
   * Sends the answer through the window's engine, then reads the runs again so the Inbox and the
   * Runs list show the run moved on. Without an engine, it fails as {@link AnswerElsewhere}.
   */
  async send(
    runId: string,
    event: string,
    payload?: unknown,
    options?: SendOptions,
  ): Promise<RunSummary> {
    const { send } = this.#options;
    if (send === undefined) throw this.#answerElsewhere(runId, event);
    const run = await send(runId, event, payload, options);
    // Only while someone listens: the first poll of a watch reads what the runs are then.
    if (this.#stopPolling !== undefined) void this.#poll();
    return run;
  }

  // No engine in this window, so the error gives the CLI line to copy. The CLI takes the short id,
  // as Studio shows it, and the folder, as a new terminal needs it. A Windows folder gets no line:
  // Studio keeps its runs in the Windows profile, which the CLI in WSL can't see (D-A, HAL-12822).
  #answerElsewhere(runId: string, event: string): AnswerElsewhere {
    const { folder } = this.#options;
    const command = isWindowsFolder(folder)
      ? undefined
      : halonicCommand(folder, "runs send", [shortRunId(runId), event]);
    if (command === undefined)
      return new AnswerElsewhere("Studio can't answer runs yet.", undefined);
    return new AnswerElsewhere(
      "Studio can't answer runs yet. To answer this one, run this in a terminal:",
      command,
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
      workspace,
      workflows: hubWorkflows(workspace),
      routines: routineClocks(workspace),
      providers: new Map(
        filesOf(workspace, "provider").map(({ value }) => [
          value.id,
          providerIsLocal(value) ? "local" : "cloud",
        ]),
      ),
      providerNames: new Map(
        filesOf(workspace, "provider").flatMap(({ value }) =>
          value.name === undefined ? [] : [[value.id, value.name] as const],
        ),
      ),
      agentNames: new Map(
        filesOf(workspace, "agent")
          .toReversed()
          .map(({ value }) => [value.id, value.name]),
      ),
      hubNames: new Map(filesOf(workspace, "hub").map(({ value }) => [value.id, value.name])),
      currency: settings?.budget?.currency ?? defaultCurrency,
      monthly: settings?.budget?.monthly,
    };
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

/**
 * A provider's host and port, as the CLI's failure lines name it: the host of `baseUrl`, never its
 * path, or else the default address of a model server on this computer.
 */
function providerHost(provider: Provider): string | undefined {
  if (provider.baseUrl !== undefined) {
    return URL.canParse(provider.baseUrl) ? new URL(provider.baseUrl).host : undefined;
  }
  return defaultLocalAddress(provider.type);
}
