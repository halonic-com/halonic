import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { RoutineStart } from "./routine-scheduler.ts";
import { setUp, type TestRun } from "./testing/routine-scheduler-harness.ts";

const noField = "The input has no field mail, which the step Read the email reads.";

/** A routine whose start throws `refusal` while it is set, as the window's checks refuse a run. */
function refusing() {
  const state: { refusal: Error | null } = { refusal: null };
  const startOf = (run: TestRun): RoutineStart => {
    if (state.refusal !== null) throw state.refusal;
    return { workflow: { hubId: "p", workflowId: "f", input: { at: run.at.toISOString() } } };
  };
  const setup = setUp([{ key: "p/hourly", minute: 0 }], { startOf });
  return { ...setup, state };
}

verifies("app.scheduler-keeps-refused-starts", () => {
  describe("a refused start", () => {
    it("is a start-refused row with the refusal's sentence, one range until a run starts", async () => {
      const { scheduler, executor, at, state } = refusing();
      await scheduler.tick();
      state.refusal = new KindedError("invalid_input", noField);
      at("2026-11-03T08:00:20Z");
      const first = await scheduler.tick();
      expect(first.failed.map((failure) => failure.error.message)).toEqual([noField]);
      at("2026-11-03T09:00:20Z");
      await scheduler.tick();
      expect(await scheduler.skippedTimes("p/hourly")).toEqual([
        {
          reason: "start-refused",
          sentence: noField,
          from: "2026-11-03T08:00:00.000Z",
          to: "2026-11-03T09:00:00.000Z",
          count: 2,
          decidedAt: "2026-11-03T09:00:20.000Z",
        },
      ]);
      state.refusal = null;
      at("2026-11-03T10:00:20Z");
      expect((await scheduler.tick()).started).toHaveLength(1);
      state.refusal = new KindedError("invalid_input", noField);
      at("2026-11-03T11:00:20Z");
      await scheduler.tick();
      expect(executor.requests).toHaveLength(1);
      expect(await scheduler.skippedTimes("p/hourly")).toMatchObject([
        { reason: "start-refused", from: "2026-11-03T11:00:00.000Z", count: 1 },
        { reason: "start-refused", from: "2026-11-03T08:00:00.000Z", count: 2 },
      ]);
    });

    it("keeps the refusal's next step with its sentence, a row per step", async () => {
      const { scheduler, at, state } = refusing();
      await scheduler.tick();
      const running = "Acme is already running in another Halonic on this computer.";
      state.refusal = new KindedError("conflict", running, {
        fix: "Stop that one, then try again.",
      });
      at("2026-11-03T08:00:20Z");
      await scheduler.tick();
      state.refusal = new KindedError("conflict", running);
      at("2026-11-03T09:00:20Z");
      await scheduler.tick();
      const rows = await scheduler.skippedTimes("p/hourly");
      expect(rows.map(({ sentence, fix, count }) => ({ sentence, fix, count }))).toEqual([
        { sentence: running, fix: undefined, count: 1 },
        { sentence: running, fix: "Stop that one, then try again.", count: 1 },
      ]);
      expect(rows[0]).not.toHaveProperty("fix");
    });

    it("marks a next step that leads to a command, as a row of its own", async () => {
      const { scheduler, at, state } = refusing();
      await scheduler.tick();
      const window = "This window can't run Briefing.";
      const fix = "Run it in a terminal:";
      state.refusal = new KindedError("invalid_input", window, { fix });
      at("2026-11-03T08:00:20Z");
      await scheduler.tick();
      state.refusal = Object.assign(new KindedError("invalid_input", window, { fix }), {
        command: "halonic run briefing",
      });
      at("2026-11-03T09:00:20Z");
      await scheduler.tick();
      const rows = await scheduler.skippedTimes("p/hourly");
      expect(rows.map(({ fix, toCommand, count }) => ({ fix, toCommand, count }))).toEqual([
        { fix, toCommand: true, count: 1 },
        { fix, toCommand: undefined, count: 1 },
      ]);
      expect(rows[1]).not.toHaveProperty("toCommand");
    });

    it("keeps no sentence for an error without a kind or an internal one, and makes a row per sentence", async () => {
      const { scheduler, at, state } = refusing();
      await scheduler.tick();
      state.refusal = new Error("EIO: i/o error, read");
      at("2026-11-03T08:00:20Z");
      await scheduler.tick();
      state.refusal = new KindedError("internal", "A bug in the step graph.");
      at("2026-11-03T09:00:20Z");
      await scheduler.tick();
      state.refusal = new KindedError("unavailable", "This window can't run Briefing.");
      at("2026-11-03T10:00:20Z");
      await scheduler.tick();
      const rows = await scheduler.skippedTimes("p/hourly");
      expect(rows.map(({ reason, sentence, count }) => ({ reason, sentence, count }))).toEqual([
        { reason: "start-refused", sentence: "This window can't run Briefing.", count: 1 },
        { reason: "start-refused", sentence: undefined, count: 2 },
      ]);
      expect(rows[1]).not.toHaveProperty("sentence");
    });
  });
});
