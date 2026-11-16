import type { RunEvent, RunSummary } from "@halonicjs/events";
import type { SandboxRefusals } from "@halonicjs/studio-feature-inbox/api";
import { type RoutineRunNames, routineRunName } from "./routine-run-name.ts";

/** What {@link WorkspaceSandboxRefusals} reads of the workspace's runs. */
export interface SandboxRefusalRuns extends RoutineRunNames {
  /** Every run of the workspace, real and test. */
  list(): Promise<readonly { readonly summary: RunSummary }[]>;
  /** A run's events. */
  log(runId: string): Promise<readonly RunEvent[]>;
  /** Calls `listener` whenever a run starts, changes or ends; returns a function that stops it. */
  subscribe(listener: () => void): () => void;
}

/**
 * The runs the Inbox's sandbox row reads (requirement `studio.sandbox-refusals`): the workspace's
 * run history, the reason code `run.failed` gave for a refused run, and the name of the routine
 * that started it. Nothing else of a run's log is read.
 *
 * @example
 * services.provide(SandboxRefusalsService, new WorkspaceSandboxRefusals(runs));
 */
export class WorkspaceSandboxRefusals implements SandboxRefusals {
  readonly #runs: SandboxRefusalRuns;

  constructor(runs: SandboxRefusalRuns) {
    this.#runs = runs;
  }

  async runs(): Promise<readonly RunSummary[]> {
    return (await this.#runs.list()).map((run) => run.summary);
  }

  async reasonOf(runId: string): Promise<string | undefined> {
    const failed = (await this.#runs.log(runId)).findLast((event) => event.type === "run.failed");
    return failed?.sandboxReason;
  }

  nameOf(run: RunSummary): string {
    return routineRunName(this.#runs, run);
  }

  subscribe(listener: () => void): () => void {
    return this.#runs.subscribe(listener);
  }
}
