import { randomUUID } from "node:crypto";
import type { HarnessRun } from "@halonicjs/ports";

/**
 * The harness runs the host has going, by an id it made. A run is here from
 * its start until its event stream ends; the host cancels every run left
 * when it stops, before it closes their sandbox sessions.
 */
export class RunTable {
  private readonly runs = new Map<string, HarnessRun>();
  private stopping = false;

  /** True once {@link RunTable.cancelAll} has started: the host starts no more runs. */
  get isStopping(): boolean {
    return this.stopping;
  }

  add(run: HarnessRun): string {
    const id = randomUUID();
    this.runs.set(id, run);
    return id;
  }

  get(id: string): HarnessRun | undefined {
    return this.runs.get(id);
  }

  /** Forgets a run whose stream has ended. */
  remove(id: string): void {
    this.runs.delete(id);
  }

  /** Cancels every run, when the host stops. One that fails to stop doesn't stop the others. */
  async cancelAll(): Promise<void> {
    this.stopping = true;
    await Promise.allSettled([...this.runs.values()].map((run) => run.cancel()));
  }
}
