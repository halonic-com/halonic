import type { HarnessEvent, HarnessInput, HarnessRun, HarnessTask } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { RunTable } from "./run-table.ts";

const task: HarnessTask = {
  runId: "run_1",
  hubId: "hub_1",
  agentId: "writer",
  instructions: "",
  prompt: "Write a haiku.",
};

class FakeRun implements HarnessRun {
  readonly sent: HarnessInput[] = [];
  rejects = false;
  async *[Symbol.asyncIterator](): AsyncIterator<HarnessEvent> {}
  async send(input: HarnessInput): Promise<void> {
    if (this.rejects) throw new Error("settled");
    this.sent.push(input);
  }
  async cancel(): Promise<void> {}
}

function observedTable() {
  const calls: string[] = [];
  const table = new RunTable({
    started: (id) => calls.push(`started ${id}`),
    event: (id, event) => calls.push(`event ${id} ${event.type}`),
    answered: (id, input) => calls.push(`answered ${id} ${input.type}`),
    ended: (id, outcome) => calls.push(`ended ${id} ${outcome}`),
  });
  return { table, calls };
}

verifies("agent-host.gateway-run-ledger", () => {
  describe("RunTable with an observer", () => {
    it("tells the observer about a run's start, events, answer and end", async () => {
      const { table, calls } = observedTable();
      const run = new FakeRun();
      const id = table.add(run, task);
      table.record(id, { type: "tool.called", agent: "writer", tool: "x", args: {} });
      await table.send(id, { type: "answer", text: "yes" });
      table.remove(id, "done");
      expect(run.sent).toEqual([{ type: "answer", text: "yes" }]);
      expect(calls).toEqual([
        `started ${id}`,
        `event ${id} tool.called`,
        `answered ${id} answer`,
        `ended ${id} done`,
      ]);
    });

    it("doesn't tell the observer about an answer the run refused", async () => {
      const { table, calls } = observedTable();
      const run = new FakeRun();
      run.rejects = true;
      const id = table.add(run, task);
      await expect(table.send(id, { type: "answer", text: "yes" })).rejects.toThrow("settled");
      expect(calls).toEqual([`started ${id}`]);
    });

    it("refuses to send to a run it doesn't have", async () => {
      await expect(new RunTable().send("nobody", { type: "answer", text: "x" })).rejects.toThrow(
        "no harness run",
      );
    });

    it("logs and drops an error the observer throws, so the run is unharmed", async () => {
      const logs: string[] = [];
      const broken = () => {
        throw new Error("socket closed");
      };
      const table = new RunTable(
        { started: broken, event: broken, answered: broken, ended: broken },
        (text) => logs.push(text),
      );
      const run = new FakeRun();
      const id = table.add(run, task);
      table.record(id, { type: "agent.started", agent: "writer" } as HarnessEvent);
      await expect(table.send(id, { type: "answer", text: "yes" })).resolves.toBeUndefined();
      expect(() => table.remove(id, "done")).not.toThrow();
      expect(table.get(id)).toBeUndefined();
      expect(logs).toHaveLength(4);
    });
  });
});
