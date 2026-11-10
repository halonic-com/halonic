import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type { CantTryStep } from "./run-basics.ts";
import type { RunEvent, RunEventBody, RunEventType } from "./run-event.ts";
import { runLog, started, startedAt, summaryOf } from "./summarize.test-helper.ts";
import { summarize } from "./summarize.ts";

// A Try it or Test run that couldn't try some of its steps, because they
// need a change left out of the run.

type EventOf<T extends RunEventType> = Extract<RunEventBody, { type: T }>;

const newAlias: CantTryStep = {
  status: "cant-try",
  item: "workflows/support-triage.yaml",
  step: "draft",
  reason: { kind: "needs-left-out-change", path: "models.yaml", leftOut: "models" },
};

const brokenConnection: CantTryStep = {
  status: "cant-try",
  item: "workflows/support-triage.yaml",
  step: "send",
  reason: {
    kind: "invalid-without-change",
    path: "connections/mail.yaml",
    message: "Connection mail has no server.",
  },
};

/** A run log whose `run.started` found these steps at load. */
function loggedWith(cantTry: CantTryStep[], ...bodies: RunEventBody[]): RunEvent[] {
  const [, ...rest] = runLog(...bodies);
  return [{ runId: "r", seq: 1, at: startedAt, ...started, cantTry }, ...rest];
}

verifies("events.run-cant-try", () => {
  typeTest("takes the steps on run.started, agent.finished and run.cant-try", () => {
    expectTypeOf<EventOf<"run.started">["cantTry"]>().toEqualTypeOf<CantTryStep[] | undefined>();
    expectTypeOf<EventOf<"agent.finished">["cantTry"]>().toEqualTypeOf<CantTryStep | undefined>();
    expectTypeOf<EventOf<"run.cant-try">>().toEqualTypeOf<{
      type: "run.cant-try";
      state: string | null;
      cantTry: CantTryStep[];
    }>();
  });

  it("ends a run with run.cant-try as cant-try, with every step it couldn't try", () => {
    const log = loggedWith([newAlias], {
      type: "run.cant-try",
      state: "draft",
      cantTry: [newAlias, brokenConnection],
    });
    expect(summarize(log)).toMatchObject({
      status: "cant-try",
      state: null,
      endedAt: "T2",
      error: null,
      reason: null,
      cantTry: [newAlias, brokenConnection],
    });
  });

  it("keeps the steps found at load while the run goes on", () => {
    const log = loggedWith([newAlias], { type: "state.entered", state: "read" });
    expect(summarize(log)).toMatchObject({ status: "running", cantTry: [newAlias] });
  });

  it("adds a branch's step that couldn't be tried", () => {
    const summary = summaryOf({
      type: "agent.finished",
      state: "both",
      agent: "mailer",
      output: null,
      error: "Can't try this step.",
      cantTry: brokenConnection,
    });
    expect(summary.cantTry).toEqual([brokenConnection]);
  });

  it("stays failed when the run really failed, and keeps the steps", () => {
    const log = loggedWith([newAlias], {
      type: "run.failed",
      state: "read",
      error: "No model answered.",
      reason: "model-unreachable",
    });
    expect(summarize(log)).toMatchObject({
      status: "failed",
      reason: "model-unreachable",
      cantTry: [newAlias],
    });
  });

  it("reads an older log without the fields as before", () => {
    const summary = summaryOf(
      { type: "agent.finished", state: "s", agent: "a", output: "hi" },
      { type: "run.completed", state: "s", context: {} },
    );
    expect(summary).toMatchObject({ status: "completed", cantTry: [] });
  });
});
