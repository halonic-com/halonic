import type { UndoStep } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { keptUndoSteps, ProposalUndoSteps } from "./proposal-undo-steps.ts";

const step = (path: string): UndoStep => ({
  source: { kind: "run-proposal", runId: "run_1" },
  files: [{ path, before: "hello", after: "hello from the run" }],
});

function counting(): ProposalUndoSteps {
  let next = 0;
  return new ProposalUndoSteps(() => `undo_${++next}`);
}

verifies("agent-host.proposal-decision-routes", () => {
  it("finds a step by its id, only for its workspace", () => {
    const steps = counting();
    const id = steps.keep("/acme", "run_1", step("notes.md"));
    expect(steps.find("/acme", id)).toEqual(step("notes.md"));
    expect(steps.find("/globex", id)).toBeUndefined();
    expect(steps.find("/acme", "undo_99")).toBeUndefined();
  });

  it("drops a settled run's steps and keeps the others", () => {
    const steps = counting();
    const first = steps.keep("/acme", "run_1", step("notes.md"));
    const second = steps.keep("/acme", "run_2", step("plan.md"));
    steps.dropRun("/acme", "run_1");
    expect(steps.find("/acme", first)).toBeUndefined();
    expect(steps.find("/acme", second)).toEqual(step("plan.md"));
  });

  it("lets the oldest step go once more than the cap are kept", () => {
    const steps = counting();
    const first = steps.keep("/acme", "run_1", step("notes.md"));
    for (let index = 0; index < keptUndoSteps; index++) {
      steps.keep("/acme", "run_1", step("notes.md"));
    }
    expect(steps.find("/acme", first)).toBeUndefined();
    expect(steps.find("/acme", `undo_${keptUndoSteps + 1}`)).toBeDefined();
  });
});
