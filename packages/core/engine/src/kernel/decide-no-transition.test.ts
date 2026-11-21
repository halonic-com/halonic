import type { Transition, Workflow } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { answer, play, replyWorkflow, startInput } from "./kernel-test-kit.test-helper.ts";

// What a run's `workflow.no-transition` cause says about the step, so a host
// can word the fix (HAL-14301): the other events it takes, and whether its
// transitions for the event all had a `when` that didn't pass.

/** The reply workflow, with these transitions on its `draft` step. */
function draftOn(on: Transition[]): Workflow {
  const draft = replyWorkflow.states.draft;
  if (draft === undefined) throw new Error("The reply workflow has a draft step.");
  return { ...replyWorkflow, states: { ...replyWorkflow.states, draft: { ...draft, on } } };
}

verifies("engine.task-state", () => {
  it("names the events a step does take when none takes its event", () => {
    const workflow = draftOn([
      { to: "sent", event: "approve" },
      { to: "sent", event: "reject" },
    ]);
    const { log } = play(workflow, [startInput("sha-1"), answer("call-1", "ok")]);
    const detail = { state: "draft", event: "done", takes: "approve,reject" };
    expect(log.at(-1)).toMatchObject({ type: "run.failed", cause: { detail } });
  });

  it("says the step's transitions for its event all have a when that didn't pass", () => {
    const workflow = draftOn([
      { to: "sent", event: "done", when: { equals: ["{{context.reply}}", "refund"] } },
      { to: "sent", event: "done", when: { equals: ["{{context.reply}}", "billing"] } },
      { to: "sent", event: "escalate" },
    ]);
    const { log } = play(workflow, [startInput("sha-1"), answer("call-1", "ok")]);
    const detail = { state: "draft", event: "done", guarded: "true", takes: "escalate" };
    expect(log.at(-1)).toMatchObject({ type: "run.failed", cause: { detail } });
  });
});
