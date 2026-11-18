import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type { RunTrigger } from "./run-basics.ts";
import { summarize } from "./summarize.ts";

verifies("events.trigger-inbox", () => {
  typeTest("lets a trigger be the Inbox's request form", () => {
    expectTypeOf<{ type: "inbox"; at: string }>().toExtend<RunTrigger>();
  });

  it("keeps the inbox trigger in the summary", () => {
    const trigger: RunTrigger = { type: "inbox", at: "2026-11-18T10:00:00.000Z" };
    const summary = summarize([
      {
        runId: "r",
        seq: 1,
        at: trigger.at,
        type: "run.started",
        hubId: "support",
        workflowId: "support-reply",
        input: { mail: "Hi, my order arrived damaged." },
        kind: "run",
        definitionsVersion: "v1",
        trigger,
      },
    ]);
    expect(summary?.trigger).toEqual(trigger);
  });
});
