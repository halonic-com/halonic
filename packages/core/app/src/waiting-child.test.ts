import type { RunEventBody } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { RunHistory } from "./run-history.ts";
import { MemoryRuns } from "./testing/memory-runs.ts";

const started: RunEventBody = {
  type: "run.started",
  hubId: "acme",
  workflowId: "triage",
  input: {},
  kind: "run",
  definitionsVersion: "v1",
};

/** A run that waits in the step Reply because its child run `child` waits. */
function waitsOn(child: string): RunEventBody {
  return { type: "run.waiting", state: "reply", events: ["approve", "reject"], child };
}

const waitsForYou: RunEventBody = {
  type: "run.waiting",
  state: "review",
  events: ["approve", "reject"],
  title: "Approve this reply?",
};

/** The waiting child of `run_triage`, read from a store holding these logs. */
async function waitingChildOf(logs: Readonly<Record<string, readonly RunEventBody[]>>) {
  const store = new MemoryRuns();
  for (const [runId, bodies] of Object.entries(logs)) {
    store.add(runId, "2026-11-22T07:21:00.000Z", bodies);
  }
  const history = new RunHistory(store);
  const lookup = await history.showRun("run_triage");
  if (lookup.found !== "one") throw new Error("Expected the parent run");
  return history.waitingChild(lookup.run);
}

verifies("app.waiting-child-run", () => {
  describe("RunHistory.waitingChild", () => {
    it("gives the child run the run waits on, with its log", async () => {
      const child = await waitingChildOf({
        run_triage: [started, waitsOn("run_triage.2")],
        "run_triage.2": [{ ...started, workflowId: "support-reply" }, waitsForYou],
      });

      expect(child?.summary).toMatchObject({
        id: "run_triage.2",
        status: "waiting",
        accepts: ["approve", "reject"],
        waitingFor: { title: "Approve this reply?" },
      });
      expect(child?.events.at(-1)).toMatchObject({ type: "run.waiting", state: "review" });
    });

    it("follows a child that waits on a child of its own", async () => {
      const child = await waitingChildOf({
        run_triage: [started, waitsOn("run_triage.2")],
        "run_triage.2": [started, waitsOn("run_triage.2.3")],
        "run_triage.2.3": [started, waitsForYou],
      });

      expect(child?.summary.id).toBe("run_triage.2.3");
    });

    it("gives none for a run that waits at its own wait step", async () => {
      expect(await waitingChildOf({ run_triage: [started, waitsForYou] })).toBeUndefined();
    });

    it("gives none when the child's log is gone", async () => {
      expect(
        await waitingChildOf({ run_triage: [started, waitsOn("run_triage.2")] }),
      ).toBeUndefined();
    });
  });
});
