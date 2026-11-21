import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { InputRefused } from "../kernel/input-refused.ts";
import { textAnswer } from "../testing/scripted-model.ts";
import { replyStart, runsOn } from "./local-runs-test-kit.test-helper.ts";

verifies("engine.start-input-fields", () => {
  // C480 P5 (HAL-14777): a routine's run started with nothing where its first step's field goes.
  it("refuses a run whose input lacks a field the first step reads, and records nothing", async () => {
    const { executor, runs } = runsOn([textAnswer("Dear support")]);

    const start = executor.start({ ...replyStart, input: {}, runId: "run_routine" });

    await expect(start).rejects.toThrow(
      new InputRefused(
        "engine.input-missing-field",
        "The input has no field from, which the step draft reads.",
      ),
    );
    expect(runs.logs.get("run_routine")).toBeUndefined();
  });

  it("starts a test run as its test gives it", async () => {
    const { executor } = runsOn([textAnswer("Dear support")]);

    const run = await executor.start({ ...replyStart, input: {}, kind: "test" });

    expect(run.status).toBe("running");
  });
});
