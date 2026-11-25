import { type RunEvent, type RunSummary, summarize } from "@halonicjs/events";
import {
  type AppendOptions,
  type AppendResult,
  checkRunAppend,
  compareRunSummaries,
  matchesRunFilter,
  type RunFilter,
  type RunSnapshot,
  type RunStore,
} from "@halonicjs/ports";
import type { PluginStateClient, ScopeKey } from "@paperclipai/plugin-sdk";

/**
 * Run logs in plugin state (HAL-17774), for the engine inside the Agent
 * tools plugin. The worker has no lasting folder, so `FolderRunStore` can't
 * serve it (Liam, HAL-17772). One entry per run holds its events and latest
 * snapshot, and one index entry lists the run ids.
 *
 * Plugin state has no compare-and-set, so the store only keeps two writers
 * apart inside one worker: every write waits its turn on one chain. Two
 * workers never write the same store, because only the holder of the engine
 * lock (`engine-lock.ts`) opens one.
 */

/** The state calls the store uses. */
export type RunStateClient = Pick<PluginStateClient, "get" | "set" | "delete">;

interface StoredRun {
  readonly events: RunEvent[];
  readonly snapshot: RunSnapshot | null;
}

/** Where a company's workflow runs live in plugin state. */
export const workflowRunsNamespace = "workflow-runs";

const indexKey = "index";

function copyJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class PluginStateRunStore implements RunStore {
  readonly #state: RunStateClient;
  readonly #companyId: string;
  /** The end of the last write, so writes run one after the other. */
  #turn: Promise<unknown> = Promise.resolve();

  constructor(state: RunStateClient, companyId: string) {
    this.#state = state;
    this.#companyId = companyId;
  }

  #key(stateKey: string): ScopeKey {
    return {
      scopeKind: "company",
      scopeId: this.#companyId,
      namespace: workflowRunsNamespace,
      stateKey,
    };
  }

  /** Runs `write` after every write before it; a failed write doesn't stop the next one. */
  #inTurn<T>(write: () => Promise<T>): Promise<T> {
    const result = this.#turn.then(write, write);
    this.#turn = result.catch(() => {});
    return result;
  }

  async #run(runId: string): Promise<StoredRun | null> {
    return (await this.#state.get(this.#key(`run:${runId}`))) as StoredRun | null;
  }

  async #ids(): Promise<string[]> {
    const ids = await this.#state.get(this.#key(indexKey));
    return Array.isArray(ids) ? (ids as string[]) : [];
  }

  async append(
    runId: string,
    expectedSeq: number,
    events: readonly RunEvent[],
    options: AppendOptions = {},
  ): Promise<AppendResult> {
    checkRunAppend(runId, expectedSeq, events);
    return await this.#inTurn(async () => {
      const run = await this.#run(runId);
      const lastSeq = run?.events.length ?? 0;
      if (lastSeq !== expectedSeq) {
        return { ok: false, reason: "conflict", lastSeq };
      }
      const all = [...(run?.events ?? []), ...copyJson(events)];
      const snapshot =
        options.snapshot === undefined
          ? (run?.snapshot ?? null)
          : { seq: all.length, state: copyJson(options.snapshot) };
      if (run === null) {
        // Listed before its log exists, so a crash between the two leaves an empty entry, never a lost run.
        const ids = await this.#ids();
        await this.#state.set(this.#key(indexKey), [...ids, runId]);
      }
      await this.#state.set(this.#key(`run:${runId}`), { events: all, snapshot });
      return { ok: true, lastSeq: all.length };
    });
  }

  async events(runId: string, afterSeq = 0): Promise<RunEvent[]> {
    const events = (await this.#run(runId))?.events ?? [];
    return events.filter((event) => event.seq > afterSeq);
  }

  async snapshot(runId: string): Promise<RunSnapshot | null> {
    return (await this.#run(runId))?.snapshot ?? null;
  }

  async get(runId: string): Promise<RunSummary | null> {
    return summarize((await this.#run(runId))?.events ?? []);
  }

  async list(filter: RunFilter = {}): Promise<RunSummary[]> {
    const summaries: RunSummary[] = [];
    for (const runId of await this.#ids()) {
      const summary = summarize((await this.#run(runId))?.events ?? []);
      if (summary !== null && matchesRunFilter(summary, filter)) {
        summaries.push(summary);
      }
    }
    return summaries.sort(compareRunSummaries);
  }

  /** Forgets a run: its log and its index line. Not part of the port; the pass drops finished lifecycles with it. */
  remove(runId: string): Promise<void> {
    return this.#inTurn(async () => {
      const ids = await this.#ids();
      await this.#state.set(
        this.#key(indexKey),
        ids.filter((id) => id !== runId),
      );
      await this.#state.delete(this.#key(`run:${runId}`));
    });
  }
}
