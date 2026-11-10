import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type { RunCatchUp, RunTrigger } from "./run-basics.ts";
import type { RunEvent } from "./run-event.ts";
import { summarize } from "./summarize.ts";

const at = "2026-11-09T07:12:00.000Z";

function startedWith(trigger: RunTrigger): RunEvent[] {
  return [
    {
      runId: "r",
      seq: 1,
      at,
      type: "run.started",
      hubId: "acme",
      workflowId: "briefing",
      input: {},
      kind: "run",
      definitionsVersion: "v1",
      trigger,
    },
  ];
}

verifies("events.trigger-catch-up", () => {
  typeTest("lets a trigger carry how a routine run caught up", () => {
    expectTypeOf<RunTrigger["catchUp"]>().toEqualTypeOf<RunCatchUp | undefined>();
    expectTypeOf<RunCatchUp>().toEqualTypeOf<{ skipped: number; countIsMinimum?: true }>();
  });

  it("keeps catchUp in the summary's trigger", () => {
    const trigger: RunTrigger = {
      type: "schedule",
      routineId: "acme/support-replies",
      at: "2026-11-09T07:00:00.000Z",
      catchUp: { skipped: 61 },
    };
    expect(summarize(startedWith(trigger))?.trigger).toEqual(trigger);
    const counted = { ...trigger, catchUp: { skipped: 10_000, countIsMinimum: true as const } };
    expect(summarize(startedWith(counted))?.trigger?.catchUp).toEqual({
      skipped: 10_000,
      countIsMinimum: true,
    });
  });

  it("has no catchUp for a run that started on time", () => {
    const trigger: RunTrigger = { type: "schedule", routineId: "acme/daily", at };
    expect(summarize(startedWith(trigger))?.trigger).not.toHaveProperty("catchUp");
  });
});
