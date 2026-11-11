import type { RunSummary } from "@halonicjs/events";
import type { ServiceKey, ServiceTarget } from "@halonicjs/studio-shell";
import type { InboxRuns } from "./inbox.ts";
import { waitingRun } from "./test-runs.test-helper.ts";

/** Runs whose waiting list and failures a test sets. */
export function fakeRuns(initial: readonly RunSummary[]) {
  let waiting = initial;
  let failure: unknown;
  const listeners = new Set<() => void>();
  const runs: InboxRuns = {
    waiting: async () => {
      if (failure !== undefined) throw failure;
      return waiting;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send: async (runId: string) => waitingRun(runId),
  };
  return {
    runs,
    fail: (error: unknown) => {
      failure = error;
    },
    answer: () => {
      failure = undefined;
    },
    change: (next: readonly RunSummary[]) => {
      waiting = next;
      for (const listener of listeners) listener();
    },
  };
}

/** A minimal workspace registry; the Studio uses `ServiceRegistry` from `@halonicjs/app`. */
export class WorkspaceServices implements ServiceTarget {
  readonly #services = new Map<string, unknown>();
  provide<Service>(key: ServiceKey<Service>, service: Service): void {
    this.#services.set(key.name, service);
  }
  get<Service>(key: ServiceKey<Service>): Service {
    return this.#services.get(key.name) as Service;
  }
  has(key: ServiceKey<unknown>): boolean {
    return this.#services.has(key.name);
  }
}
