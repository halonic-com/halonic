// How the local executor carries out a `start-child` effect: it records the
// child's start, or tells the parent why the child couldn't start.

import type { BlobStore, RunStore } from "@halonicjs/ports";
import type { DecideInput, StartChildEffect } from "../kernel/decide-types.ts";
import { InputRefused } from "../kernel/input-refused.ts";
import { hasEnded, type RunState } from "../kernel/run-state.ts";
import { childStart } from "./child-runs.ts";

/** What {@link startChild} works with. */
export interface ChildStartPorts {
  readonly blobs: Pick<BlobStore, "get" | "put">;
  readonly store: RunStore;
  /** Records the input for the run, and carries out what it causes. */
  readonly record: (runId: string, input: DecideInput) => Promise<unknown>;
  /** As `record`, but an input the run no longer takes changes nothing. */
  readonly recordIfTaken: (runId: string, input: DecideInput) => Promise<void>;
  readonly now: () => string;
}

/**
 * Starts a child run; one that can't start fails its parent with the
 * reason. An error after the child's start is recorded goes to the caller.
 * A parent that ended while its earlier children started, as when one of
 * them waits in a `foreach` state, starts none: no one would end it.
 */
export async function startChild(
  ports: ChildStartPorts,
  parent: RunState,
  effect: StartChildEffect,
): Promise<void> {
  const parentNow = await ports.store.get(parent.runId);
  if (parentNow !== null && hasEnded(parentNow.status)) return;
  try {
    const start = await childStart(ports.blobs, parent, effect, ports.now());
    await ports.record(effect.childRunId, start);
  } catch (error) {
    // The child was already started, by a start asked for twice.
    if (error instanceof InputRefused && error.code === "engine.run-exists") return;
    // A child whose start is recorded runs: the error came after its start.
    if ((await ports.store.get(effect.childRunId)) !== null) throw error;
    const message = error instanceof Error ? error.message : String(error);
    await ports.recordIfTaken(parent.runId, {
      type: "child",
      at: ports.now(),
      childRunId: effect.childRunId,
      status: "failed",
      error: `The child run couldn't start: ${message}`,
    });
  }
}
