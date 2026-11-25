import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type { RunEventBody } from "./run-event.ts";
import { summarize } from "./summarize.ts";
import { parseEventLine } from "./upgrade.ts";

type ApprovalRequested = Extract<RunEventBody, { type: "approval.requested" }>;
type EffectRequested = Extract<RunEventBody, { type: "effect.requested" }>;

const at = "2026-11-25T00:00:00.000Z";

/** A run that waits at the tool step `merge`, with `asked` as its `approval.requested` line. */
function waitingRun(asked: Record<string, unknown>) {
  const lines = [
    { type: "run.started", hubId: "acme", workflowId: "watch", definitionsVersion: "v", input: {} },
    { type: "state.entered", state: "merge" },
    asked,
    { type: "run.waiting", state: "merge", events: ["approve", "reject"] },
  ];
  return lines.map((line, index) =>
    parseEventLine(JSON.stringify({ runId: "run-1", seq: index + 1, at, ...line })),
  );
}

const asked = {
  type: "approval.requested",
  state: "merge",
  agent: "merge",
  tool: "merge_pull_request",
  connector: "github",
  args: { pr: 7 },
  callId: "call-1",
  resume: { messages: [], calls: [], step: 0 },
};

verifies("events.tool-step-marker", () => {
  typeTest("marks a tool step's call with an optional step", () => {
    expectTypeOf<ApprovalRequested["step"]>().toEqualTypeOf<"tool" | undefined>();
    expectTypeOf<EffectRequested["step"]>().toEqualTypeOf<"tool" | undefined>();
  });

  it("copies the marker to the waiting approval", () => {
    const summary = summarize(waitingRun({ ...asked, step: "tool" }));

    expect(summary?.approvals).toMatchObject([{ agent: "merge", step: "tool", args: { pr: 7 } }]);
  });

  it("reads a line written before the field existed, without a marker", () => {
    const [approval] = summarize(waitingRun(asked))?.approvals ?? [];

    expect(approval).toMatchObject({ agent: "merge", tool: "merge_pull_request" });
    expect(approval).not.toHaveProperty("step");
  });
});
