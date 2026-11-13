import {
  isRunTargetNotFound,
  type RunExecutor,
  type RunTargetKind,
  type RunTargetNotFound,
} from "@halonicjs/ports";
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

/** Ids the executor under test has nothing for, and a hub it does have, so each kind of miss can be asked for. */
export interface MissingRunTargets {
  /** A hub that exists. */
  hubId: string;
  /** An id no hub has. */
  unknownHubId: string;
  /** A workflow id the existing hub doesn't have. */
  unknownWorkflowId: string;
  /** An agent id the existing hub doesn't have. */
  unknownAgentId: string;
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
  /** What the executor has no run target for. */
  missing: MissingRunTargets;
}

/** What a start of a missing target rejects with. */
async function notFoundOf(start: Promise<unknown>): Promise<{ kind: RunTargetKind; id: string }> {
  const error = await start.catch((thrown: unknown) => thrown);
  expect(isRunTargetNotFound(error)).toBe(true);
  const { kind, id } = error as RunTargetNotFound;
  return { kind, id };
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

  verifies("contracts.run-executor-not-found", () => {
    describe(`RunExecutor not-found contract: ${name}`, () => {
      it("rejects a start in an unknown hub with RunTargetNotFound for the hub", async () => {
        const { executor, missing } = await make();
        const found = await notFoundOf(
          executor.start({ hubId: missing.unknownHubId, workflowId: "any", input: {} }),
        );
        expect(found).toEqual({ kind: "hub", id: missing.unknownHubId });
      });

      it("rejects a start of an unknown workflow with RunTargetNotFound for the workflow", async () => {
        const { executor, missing } = await make();
        const found = await notFoundOf(
          executor.start({
            hubId: missing.hubId,
            workflowId: missing.unknownWorkflowId,
            input: {},
          }),
        );
        expect(found).toEqual({ kind: "workflow", id: missing.unknownWorkflowId });
      });

      it("rejects an agent start in an unknown hub with RunTargetNotFound for the hub", async () => {
        const { executor, missing } = await make();
        const found = await notFoundOf(
          executor.startAgent({ hubId: missing.unknownHubId, agentId: "any", prompt: "hi" }),
        );
        expect(found).toEqual({ kind: "hub", id: missing.unknownHubId });
      });

      it("rejects a start of an unknown agent with RunTargetNotFound for the agent", async () => {
        const { executor, missing } = await make();
        const found = await notFoundOf(
          executor.startAgent({
            hubId: missing.hubId,
            agentId: missing.unknownAgentId,
            prompt: "hi",
          }),
        );
        expect(found).toEqual({ kind: "agent", id: missing.unknownAgentId });
      });
    });
  });
}
