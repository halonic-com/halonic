import type { RunExecutor } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

/** A run the harness brought to wait for a person's OK on one tool call. */
export interface WaitingApproval {
  runId: string;
  /** An event the run accepts now, such as "approve". */
  event: string;
  /** The call the run waits on, as its summary names it. */
  callId: string;
}

/**
 * An executor under test, with a way to bring a run to an approval. How a
 * run gets there depends on the executor (a workflow with a gated tool, or
 * a fake's own setter), so the adapter's test harness does it.
 */
export interface RunExecutorHarness {
  executor: RunExecutor;
  /** Starts a run and returns once it waits for approval of one call. */
  waitForApproval(): Promise<WaitingApproval>;
}

/** Creates the executor under test, with nothing in it yet. */
export type MakeRunExecutor = () => Promise<RunExecutorHarness>;

/** The contract every {@link RunExecutor} adapter passes. */
export function runExecutorContract(name: string, make: MakeRunExecutor): void {
  verifies("contracts.run-executor-send", () => {
    describe(`RunExecutor send contract: ${name}`, () => {
      it("delivers an event for the call the run waits on", async () => {
        const { executor, waitForApproval } = await make();
        const waiting = await waitForApproval();

        const summary = await executor.send(waiting.runId, waiting.event, undefined, {
          callId: waiting.callId,
        });

        expect(summary.id).toBe(waiting.runId);
      });

      it("delivers an event that names no call", async () => {
        const { executor, waitForApproval } = await make();
        const waiting = await waitForApproval();

        const summary = await executor.send(waiting.runId, waiting.event);

        expect(summary.id).toBe(waiting.runId);
      });

      it("refuses an event for another call and keeps the run waiting", async () => {
        const { executor, waitForApproval } = await make();
        const waiting = await waitForApproval();

        await expect(
          executor.send(waiting.runId, waiting.event, undefined, {
            callId: `${waiting.callId}-other`,
          }),
        ).rejects.toThrow();

        // Nothing was recorded, so the call the run waits on can still be answered.
        const summary = await executor.send(waiting.runId, waiting.event, undefined, {
          callId: waiting.callId,
        });
        expect(summary.id).toBe(waiting.runId);
      });
    });
  });
}
