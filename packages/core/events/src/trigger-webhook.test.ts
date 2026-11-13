import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type { RunTrigger } from "./run-basics.ts";
import { summarize } from "./summarize.ts";

verifies("events.trigger-webhook", () => {
  typeTest("lets a trigger be a webhook with a delivery id", () => {
    expectTypeOf<RunTrigger["type"]>().toEqualTypeOf<
      "manual" | "schedule" | "every" | "mail" | "signal" | "webhook"
    >();
    expectTypeOf<RunTrigger["deliveryId"]>().toEqualTypeOf<string | undefined>();
  });

  it("keeps the webhook trigger in the summary", () => {
    const trigger: RunTrigger = {
      type: "webhook",
      routineId: "acme/orders",
      at: "2026-11-13T08:00:00.000Z",
      deliveryId: "d-1",
    };
    const summary = summarize([
      {
        runId: "r",
        seq: 1,
        at: trigger.at,
        type: "run.started",
        hubId: "acme",
        workflowId: "orders",
        input: {},
        kind: "run",
        definitionsVersion: "v1",
        trigger,
      },
    ]);
    expect(summary?.trigger).toEqual(trigger);
  });
});
