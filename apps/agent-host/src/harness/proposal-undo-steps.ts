// The undo steps of the Inbox's decisions on run proposals, kept in the host
// (HAL-10916). A step holds the texts it wrote, before and after, and
// restoring it writes them: if Studio sent a step back, the host would write
// whatever text a caller put in it. So Studio gets only an id, and a step is
// restored only for the workspace that made it.

import type { UndoStep } from "@halonicjs/app";

/**
 * How many steps the host keeps. An Undo lives as long as its toast, so a
 * person never reaches back this far; the cap keeps a long session's memory
 * bounded.
 */
export const keptUndoSteps = 200;

interface KeptStep {
  readonly workspace: string;
  readonly runId: string;
  readonly step: UndoStep;
}

/**
 * The undo steps of proposal decisions, by an id the host made. Oldest go
 * first once more than {@link keptUndoSteps} are kept. Nothing is kept
 * across a restart: an Undo after one isn't offered.
 *
 * @example
 * const steps = new ProposalUndoSteps(() => crypto.randomUUID());
 * const id = steps.keep(workspace, "01JD8Q", result.undo);
 * steps.find(workspace, id); // the step, for `restore`
 * steps.dropRun(workspace, "01JD8Q"); // once the proposal is settled
 */
export class ProposalUndoSteps {
  readonly #newId: () => string;
  readonly #steps = new Map<string, KeptStep>();

  /** @param newId - makes an id no caller can guess */
  constructor(newId: () => string) {
    this.#newId = newId;
  }

  /** @returns the step's id, for Studio's Undo and Redo */
  keep(workspace: string, runId: string, step: UndoStep): string {
    const id = this.#newId();
    this.#steps.set(id, { workspace, runId, step });
    for (const oldest of this.#steps.keys()) {
      if (this.#steps.size <= keptUndoSteps) break;
      this.#steps.delete(oldest);
    }
    return id;
  }

  /** @returns the step, or `undefined` when the id is unknown, dropped, or another workspace's */
  find(workspace: string, id: string): UndoStep | undefined {
    const kept = this.#steps.get(id);
    return kept?.workspace === workspace ? kept.step : undefined;
  }

  /** Drops a settled proposal's steps: nothing of it can be decided any more, so their Undo would fail. */
  dropRun(workspace: string, runId: string): void {
    for (const [id, kept] of this.#steps) {
      if (kept.workspace === workspace && kept.runId === runId) this.#steps.delete(id);
    }
  }
}
