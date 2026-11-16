import type { HarnessEvent, HarnessInput, HarnessRun, HarnessTask } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { RunTable } from "../harness/run-table.ts";
import { hostGatewaySource } from "./host-gateway-source.ts";
import { RunLedger } from "./run-ledger.ts";

const task: HarnessTask = {
  runId: "run_1",
  hubId: "hub_1",
  agentId: "writer",
  instructions: "",
  prompt: "Tidy the folder",
};

class FakeRun implements HarnessRun {
  readonly sent: HarnessInput[] = [];
  async *[Symbol.asyncIterator](): AsyncIterator<HarnessEvent> {}
  async send(input: HarnessInput): Promise<void> {
    this.sent.push(input);
  }
  async cancel(): Promise<void> {}
}

/** A run in the table, as the harness route would add it, that waits for an approval. */
function waitingRun() {
  const ledger = new RunLedger();
  const runs = new RunTable(ledger);
  const run = new FakeRun();
  const id = runs.add(run, task);
  runs.record(id, {
    type: "approval.requested",
    agent: "writer",
    tool: "shell",
    args: { command: "rm -r build" },
    callId: "call-9",
  });
  return { source: hostGatewaySource(ledger, runs), run, id };
}

verifies("agent-host.remote-gateway", () => {
  describe("the host's gateway source", () => {
    it("lists the runs the host has going as sessions", () => {
      const { source, id } = waitingRun();
      expect(source.list()).toMatchObject([{ id, title: "Tidy the folder", state: "waiting" }]);
    });

    it("gives the approval the risk the host judged", () => {
      const { source, id } = waitingRun();
      expect(source.approvalRisk(id, "approval-1")).toBe("risky");
      expect(source.approvalRisk(id, "approval-2")).toBeUndefined();
    });

    it("passes an answer on to the run with its call id, and settles the approval", async () => {
      const { source, run, id } = waitingRun();
      await source.answerApproval(id, "approval-1", "approve");
      expect(run.sent).toEqual([{ type: "approval", callId: "call-9", approved: true }]);
      expect(source.approvalRisk(id, "approval-1")).toBeUndefined();
      await expect(source.answerApproval(id, "approval-1", "deny")).rejects.toThrow("waiting");
    });

    it("passes a prompt on to the run as an answer", async () => {
      const { source, run, id } = waitingRun();
      await source.sendPrompt(id, "Go on.");
      expect(run.sent).toEqual([{ type: "answer", text: "Go on." }]);
    });

    it("rejects an answer or a prompt for a session it doesn't have", async () => {
      const { source } = waitingRun();
      await expect(source.sendPrompt("nobody", "hi")).rejects.toThrow("no harness run");
      await expect(source.answerApproval("nobody", "approval-1", "deny")).rejects.toThrow();
    });

    it("watches a session's events in order", async () => {
      const { source, id } = waitingRun();
      const seen: number[] = [];
      source.watch(id, 0, (event) => seen.push(event.seq));
      await Promise.resolve();
      expect(seen).toEqual([1, 2, 3]);
    });
  });
});
