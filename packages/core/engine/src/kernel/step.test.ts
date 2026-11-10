import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { InputRefused } from "./input-refused.ts";
import { keepDefinitions } from "./kept-definitions.ts";
import {
  answer,
  KernelBlobs,
  KernelRuns,
  replyWorkflow,
  startInput,
} from "./kernel-test-kit.test-helper.ts";
import { foldRun } from "./run-state.ts";
import { maxStepAttempts, readRun, snapshotVersion, step } from "./step.ts";

async function kernel() {
  const runs = new KernelRuns();
  const blobs = new KernelBlobs();
  const version = await keepDefinitions(blobs, { workflow: replyWorkflow });
  return { ports: { runs, blobs }, runs, blobs, version };
}

verifies("engine.step-appends-once", () => {
  describe("step", () => {
    it("appends what the start decided and hands back the effects to carry out", async () => {
      const { ports, runs, version } = await kernel();

      const result = await step(ports, "r-acme", startInput(version));

      expect(result.events.map((event) => [event.seq, event.type, event.at])).toEqual([
        [1, "run.started", "2026-11-09T09:00:00.000Z"],
        [2, "state.entered", "2026-11-09T09:00:00.000Z"],
        [3, "agent.started", "2026-11-09T09:00:00.000Z"],
      ]);
      expect(result.effects).toEqual([
        expect.objectContaining({ type: "call-model", callId: "call-1", agent: "writer" }),
      ]);
      expect(await runs.events("r-acme")).toEqual(result.events);
      expect(result.run.lastSeq).toBe(3);
    });

    it("appends after the log's last event for the next input", async () => {
      const { ports, version } = await kernel();
      await step(ports, "r-acme", startInput(version));

      const result = await step(ports, "r-acme", answer("call-1", "Thanks!"));

      expect(result.events[0]).toMatchObject({ seq: 4, type: "agent.finished" });
      expect(result.run).toMatchObject({ status: "completed", context: { reply: "Thanks!" } });
    });

    it("decides again from a fresh read after losing a race, so an answer is written once", async () => {
      const { ports, runs, version } = await kernel();
      await step(ports, "r-acme", startInput(version));

      const results = await Promise.allSettled([
        step(ports, "r-acme", answer("call-1", "Thanks!")),
        step(ports, "r-acme", answer("call-1", "Thanks!")),
      ]);

      expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
      const refusal = results.find((result) => result.status === "rejected");
      expect(refusal).toMatchObject({ reason: expect.any(InputRefused) });
      expect(refusal).toMatchObject({ reason: { code: "engine.run-ended" } });
      const finished = (await runs.events("r-acme")).filter((e) => e.type === "agent.finished");
      expect(finished).toHaveLength(1);
    });

    it("starts a repeated run id once", async () => {
      const { ports, runs, version } = await kernel();
      await step(ports, "r-acme", startInput(version));

      await expect(step(ports, "r-acme", startInput(version))).rejects.toMatchObject({
        code: "engine.run-exists",
      });
      expect(runs.appends).toBe(1);
    });

    it("gives up when the log keeps moving on, having stored nothing of its own", async () => {
      const { ports, runs, version } = await kernel();
      await step(ports, "r-acme", startInput(version));
      runs.beforeAppend = (runId) => {
        const log = runs.logs.get(runId) ?? [];
        const seq = log.length + 1;
        const at = "2026-11-09T09:00:01.000Z";
        log.push({ runId, seq, at, type: "context.updated", key: "seen", value: seq });
      };

      await expect(step(ports, "r-acme", answer("call-1", "Thanks!"))).rejects.toThrow(
        `gave up after ${maxStepAttempts} tries`,
      );
      expect(runs.appends).toBe(1);
    });
  });
});

verifies("engine.snapshot-is-cache", () => {
  describe("the run snapshot", () => {
    it("is stored with each append and equals the folded log", async () => {
      const { ports, runs, version } = await kernel();

      await step(ports, "r-acme", startInput(version));

      const log = await runs.events("r-acme");
      expect(await runs.snapshot("r-acme")).toEqual({
        seq: 3,
        state: { version: snapshotVersion, state: foldRun(log) },
      });
    });

    it("is where reading a run starts, with only the events after it read", async () => {
      const { ports, runs, version } = await kernel();
      await step(ports, "r-acme", startInput(version));
      const reads: number[] = [];
      const events = runs.events.bind(runs);
      runs.events = (runId, afterSeq) => {
        reads.push(afterSeq ?? 0);
        return events(runId, afterSeq);
      };

      await readRun(runs, "r-acme");

      expect(reads).toEqual([3]);
    });

    it.each([
      ["none", undefined],
      ["one of another version", { version: snapshotVersion + 1, state: {} }],
      [
        "one that doesn't match the log",
        { version: snapshotVersion, state: { runId: "r-acme", lastSeq: 1 } },
      ],
      ["one of another run", { version: snapshotVersion, state: { runId: "r-other", lastSeq: 3 } }],
      ["one that isn't an object", "garbage"],
    ])("can be thrown away: with %s the run is folded from its log", async (_name, stored) => {
      const { ports, runs, version } = await kernel();
      await step(ports, "r-acme", startInput(version));
      runs.snapshots.delete("r-acme");
      if (stored !== undefined) {
        runs.snapshots.set("r-acme", { seq: 3, state: stored });
      }

      expect(await readRun(runs, "r-acme")).toEqual(foldRun(await runs.events("r-acme")));
      const result = await step(ports, "r-acme", answer("call-1", "Thanks!"));
      expect(result.run.status).toBe("completed");
    });

    it("reads an unknown run as null", async () => {
      const { runs } = await kernel();

      expect(await readRun(runs, "r-none")).toBeNull();
    });
  });
});
