import type { CantTryStep } from "@halonicjs/events";
import { CantTryError } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { textAnswer } from "../testing/scripted-model.ts";
import { replyStart, runsOn, typesOf } from "./local-runs-test-kit.test-helper.ts";

const reason = { kind: "needs-left-out-change", path: "models.yaml", leftOut: "models" } as const;

const draftCantTry: CantTryStep = {
  status: "cant-try",
  item: "workflows/reply.yaml",
  step: "draft",
  reason,
};

verifies("engine.run-cant-try", () => {
  it("never runs a step the start says can't be tried", async () => {
    const { executor, model, runs, scheduler } = runsOn([textAnswer("Dear support")]);

    const started = await executor.start({ ...replyStart, cantTry: [draftCantTry] });
    await scheduler.runDue();

    expect(started).toMatchObject({ status: "cant-try", cantTry: [draftCantTry] });
    expect(model.requests).toEqual([]);
    expect(typesOf(runs.logs.get("run_1"))).toEqual([
      "run.started",
      "state.entered",
      "run.cant-try",
    ]);
  });

  it("ends the run when the model call's adapter says the step can't be tried", async () => {
    const left = new CantTryError("workflows/reply.yaml", reason, "Alias smart is new.");
    const { executor, runs, scheduler } = runsOn([left]);
    await executor.start(replyStart);

    await scheduler.runDue();

    expect(await runs.get("run_1")).toMatchObject({
      status: "cant-try",
      state: "draft",
      cantTry: [draftCantTry],
    });
  });
});
