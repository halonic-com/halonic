import type { HarnessEvent, HarnessTask } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type LedgerEvent, RunLedger } from "./run-ledger.ts";

const task: HarnessTask = {
  runId: "run_1",
  hubId: "hub_1",
  agentId: "writer",
  instructions: "",
  prompt: "Fix the build\nand tell me what broke",
};

function approvalRequested(tool: string, callId: string): HarnessEvent {
  return { type: "approval.requested", agent: "writer", tool, args: { command: "ls" }, callId };
}

function finishedEvent(output: unknown): HarnessEvent {
  return { type: "agent.finished", agent: "writer", output } as HarnessEvent;
}

/** Watches from `afterSeq` and waits for the replay. */
async function eventsFrom(ledger: RunLedger, afterSeq: number): Promise<LedgerEvent[]> {
  const seen: LedgerEvent[] = [];
  const result = ledger.watch("run", afterSeq, (event) => seen.push(event));
  await Promise.resolve();
  if (result.kind === "watching") result.stop();
  return seen;
}

function startedLedger(options = {}): RunLedger {
  const ledger = new RunLedger({ now: () => new Date("2026-11-16T10:00:00.000Z"), ...options });
  ledger.started("run", task);
  return ledger;
}

verifies("agent-host.gateway-run-ledger", () => {
  describe("RunLedger", () => {
    it("lists a started run with its first line as the title", () => {
      expect(startedLedger().list()).toEqual([
        {
          id: "run",
          title: "Fix the build",
          state: "running",
          lastSeq: 1,
          updatedAt: "2026-11-16T10:00:00.000Z",
        },
      ]);
    });

    it("shortens a title and an approval summary to fixed lengths", async () => {
      const ledger = new RunLedger();
      ledger.started("run", { ...task, prompt: "t".repeat(5_000) });
      ledger.event("run", {
        type: "approval.requested",
        agent: "writer",
        tool: "Bash",
        args: { command: "c".repeat(5_000) },
        callId: "call_1",
      });
      expect(ledger.list()[0]?.title).toHaveLength(80);
      const seen = await eventsFrom(ledger, 1);
      const body = seen[0]?.body;
      expect(body?.type === "approval-requested" && body.approval.summary.length).toBe(300);
    });

    it("lists only the newest sessions that fit in one sessions reply", () => {
      const ledger = new RunLedger({ maxFinished: 1_000 });
      // A control character takes six bytes in JSON, the worst case for a title.
      const prompt = "\u0001".repeat(200);
      for (let n = 0; n < 500; n++) ledger.started(`run_${n}`, { ...task, prompt });
      const listed = ledger.list();
      const reply = JSON.stringify({
        type: "sessions",
        replyTo: "r".repeat(128),
        sessions: listed,
      });
      expect(new TextEncoder().encode(reply).byteLength).toBeLessThanOrEqual(64 * 1024);
      expect(listed.length).toBeGreaterThan(0);
      expect(listed.length).toBeLessThan(500);
      expect(listed.at(-1)?.id).toBe("run_499");
    });

    it("numbers events from 1 and replays them in order", async () => {
      const ledger = startedLedger();
      ledger.event("run", finishedEvent("All fixed."));
      const seen = await eventsFrom(ledger, 0);
      expect(seen.map((event) => event.seq)).toEqual([1, 2]);
      expect(seen[0]?.body).toEqual({ type: "message", role: "user", text: task.prompt });
      expect(seen[1]?.body).toEqual({ type: "message", role: "agent", text: "All fixed." });
    });

    it("replays only the events after afterSeq, then the new ones", async () => {
      const ledger = startedLedger();
      const seen: number[] = [];
      ledger.watch("run", 1, (event) => seen.push(event.seq));
      ledger.event("run", finishedEvent("a"));
      await Promise.resolve();
      ledger.event("run", finishedEvent("b"));
      expect(seen).toEqual([2, 3]);
    });

    it("calls onEvent only after watch has returned", () => {
      const ledger = startedLedger();
      const seen: number[] = [];
      ledger.watch("run", 0, (event) => seen.push(event.seq));
      expect(seen).toEqual([]);
    });

    it("stops delivering after stop", async () => {
      const ledger = startedLedger();
      const seen: number[] = [];
      const result = ledger.watch("run", 0, (event) => seen.push(event.seq));
      await Promise.resolve();
      if (result.kind === "watching") result.stop();
      ledger.event("run", finishedEvent("late"));
      expect(seen).toEqual([1]);
    });

    it("answers an unknown session", () => {
      expect(startedLedger().watch("other", 0, () => undefined)).toEqual({
        kind: "unknown-session",
      });
    });

    it("records an approval with the risk the host judged, and waits", async () => {
      const ledger = startedLedger();
      ledger.event("run", approvalRequested("shell", "call-1"));
      expect(ledger.list()[0]?.state).toBe("waiting");
      expect(ledger.approvalRisk("run", "approval-1")).toBe("risky");
      const bodies = (await eventsFrom(ledger, 1)).map((event) => event.body);
      expect(bodies[0]).toMatchObject({
        type: "approval-requested",
        approval: { id: "approval-1", risk: "risky" },
      });
      expect(bodies[1]).toEqual({ type: "state", state: "waiting" });
    });

    it("judges a read risky too", () => {
      const ledger = startedLedger();
      ledger.event("run", approvalRequested("Read", "call-1"));
      expect(ledger.approvalRisk("run", "approval-1")).toBe("risky");
    });

    it("settles an approval when a decision is passed on, and runs again", async () => {
      const ledger = startedLedger();
      ledger.event("run", approvalRequested("shell", "call-1"));
      expect(ledger.callIdOf("run", "approval-1")).toBe("call-1");
      ledger.answered("run", { type: "approval", callId: "call-1", approved: true });
      expect(ledger.approvalRisk("run", "approval-1")).toBeUndefined();
      expect(ledger.list()[0]?.state).toBe("running");
      const bodies = (await eventsFrom(ledger, 3)).map((event) => event.body);
      expect(bodies).toEqual([
        { type: "approval-settled", approvalId: "approval-1", decision: "approve" },
        { type: "state", state: "running" },
      ]);
    });

    it("records a person's answer as a user message", async () => {
      const ledger = startedLedger();
      ledger.answered("run", { type: "answer", text: "Yes, go on." });
      const seen = await eventsFrom(ledger, 1);
      expect(seen[0]?.body).toEqual({ type: "message", role: "user", text: "Yes, go on." });
    });

    it("settles an approval nobody decided as denied when the run ends", async () => {
      const ledger = startedLedger();
      ledger.event("run", approvalRequested("shell", "call-1"));
      ledger.ended("run", "failed");
      expect(ledger.list()[0]?.state).toBe("failed");
      const bodies = (await eventsFrom(ledger, 3)).map((event) => event.body);
      expect(bodies).toEqual([
        { type: "approval-settled", approvalId: "approval-1", decision: "deny" },
        { type: "state", state: "failed" },
      ]);
    });

    it("ends a run as done", () => {
      const ledger = startedLedger();
      ledger.ended("run", "done");
      expect(ledger.list()[0]?.state).toBe("done");
    });

    it("keeps at most maxEvents and says history-gone for a gap", async () => {
      const ledger = startedLedger({ maxEvents: 3 });
      for (const text of ["a", "b", "c", "d"]) ledger.event("run", finishedEvent(text));
      expect(ledger.list()[0]?.lastSeq).toBe(5);
      expect((await eventsFrom(ledger, 0)).map((event) => event.seq)).toEqual([3, 4, 5]);
      expect((await eventsFrom(ledger, 2)).map((event) => event.seq)).toEqual([3, 4, 5]);
      expect(ledger.watch("run", 1, () => undefined)).toEqual({ kind: "history-gone" });
    });

    it("keeps every event from the oldest approval that waits", async () => {
      const ledger = startedLedger({ maxEvents: 2 });
      ledger.event("run", approvalRequested("shell", "call-1"));
      for (const text of ["a", "b", "c"]) ledger.event("run", finishedEvent(text));
      const seen = await eventsFrom(ledger, 0);
      expect(seen[0]?.seq).toBe(2);
      expect(seen[0]?.body.type).toBe("approval-requested");
    });

    it("forgets the oldest finished sessions past maxFinished", () => {
      const ledger = new RunLedger({ maxFinished: 1 });
      for (const id of ["one", "two", "three"]) {
        ledger.started(id, task);
        ledger.ended(id, "done");
      }
      expect(ledger.list().map((session) => session.id)).toEqual(["three"]);
    });

    it("ignores events of a run it doesn't know and of subagents", () => {
      const ledger = startedLedger();
      ledger.event("nobody", finishedEvent("x"));
      ledger.event("run", { ...finishedEvent("sub"), parent: "writer" } as HarnessEvent);
      expect(ledger.list()[0]?.lastSeq).toBe(1);
    });

    it("answers a watch from past the last event with history-gone", () => {
      const ledger = startedLedger();
      expect(ledger.watch("run", 9, () => {}).kind).toBe("history-gone");
    });

    it("ends a watch whose unseen events were trimmed, and says so", async () => {
      const ledger = startedLedger({ maxEvents: 3 });
      const seen: number[] = [];
      let gone = false;
      ledger.watch(
        "run",
        1,
        (event) => seen.push(event.seq),
        () => {
          gone = true;
        },
      );
      for (let i = 0; i < 6; i += 1) ledger.event("run", finishedEvent(`out ${i}`));
      await Promise.resolve();
      expect(gone).toBe(true);
      expect(seen).toEqual([]);
    });

    it("logs and drops an error a watcher throws", async () => {
      const logs: string[] = [];
      const ledger = startedLedger({ log: (text: string) => logs.push(text) });
      ledger.watch("run", 0, () => {
        throw new Error("socket closed");
      });
      await Promise.resolve();
      expect(() => ledger.event("run", finishedEvent("done"))).not.toThrow();
      expect(logs.join("")).toContain("socket closed");
    });
  });
});
