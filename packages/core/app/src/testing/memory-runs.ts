import { type RunEvent, type RunEventBody, type RunSummary, summarize } from "@halonicjs/events";
import {
  compareRunSummaries,
  matchesRunFilter,
  type RunFilter,
  type RunStore,
} from "@halonicjs/ports";

/**
 * Run logs in a map, with the port's own filter and order, so a list reads as
 * the memory adapter's does. For the kernel's own tests. A deliberate fake:
 * core may not use adapters, not even in tests.
 */
export class MemoryRuns implements Pick<RunStore, "list" | "events"> {
  readonly #logs = new Map<string, RunEvent[]>();

  /**
   * Adds a run whose log is these event bodies, numbered in order and
   * stamped a second apart from `startedAt`.
   */
  add(runId: string, startedAt: string, bodies: readonly RunEventBody[]): void {
    const start = Date.parse(startedAt);
    this.#logs.set(
      runId,
      bodies.map((body, index) => ({
        ...body,
        runId,
        seq: index + 1,
        at: new Date(start + index * 1000).toISOString(),
      })),
    );
  }

  async events(runId: string): Promise<RunEvent[]> {
    return [...(this.#logs.get(runId) ?? [])];
  }

  async list(filter: RunFilter = {}): Promise<RunSummary[]> {
    return [...this.#logs.values()]
      .map((events) => summarize(events))
      .filter((summary): summary is RunSummary => summary !== null)
      .filter((summary) => matchesRunFilter(summary, filter))
      .sort(compareRunSummaries);
  }
}
