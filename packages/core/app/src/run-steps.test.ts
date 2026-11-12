import {
  type RunEvent,
  type RunEventBase,
  type RunEventBody,
  type RunSummary,
  summarize,
} from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { runSteps } from "./run-steps.ts";

/** A run log of Acme's Support reply from event bodies, each with the time it happened at. */
function logOf(timed: readonly (readonly [string, RunEventBody])[]): RunEvent[] {
  const started: RunEventBody = {
    type: "run.started",
    hubId: "acme",
    workflowId: "support-reply",
    input: {},
    kind: "run",
    definitionsVersion: "v1",
  };
  const first = timed[0]?.[0] ?? "14:00:00";
  return [[first, started] as const, ...timed].map(([time, body], index) => ({
    ...body,
    runId: "run_mfx3k2a1_01jd8q",
    seq: index + 1,
    at: `2026-11-10T${time}.000Z`,
  }));
}

function stepsOf(timed: readonly (readonly [string, RunEventBody])[]) {
  const events = logOf(timed);
  const summary: RunSummary | null = summarize(events);
  if (summary === null) {
    throw new Error("The test log has no run.started.");
  }
  return runSteps(events, summary);
}

const entered = (state: string): RunEventBody => ({ type: "state.entered", state });
const agentStarted = (state: string, agent: string): RunEventBody => ({
  type: "agent.started",
  state,
  agent,
  prompt: "",
});
const inBranch = (
  branch: string,
  body: RunEventBody,
): RunEventBody & Pick<RunEventBase, "branch"> => ({ ...body, branch });
const finishedAt = (time: string) =>
  [
    [time, entered("done")],
    [time, { type: "run.completed", state: "done", context: {} }],
  ] as const;

/** Read, then draft, then the wait step from 14:00:10. */
const upToReview = [
  ["14:00:00", entered("read")],
  ["14:00:00", agentStarted("read", "writer")],
  ["14:00:01", entered("draft")],
  ["14:00:01", agentStarted("draft", "writer")],
  ["14:00:10", entered("review")],
] as const;

verifies("app.run-steps", () => {
  it("reads each step a finished run reached, and not the end state", () => {
    const steps = stepsOf([
      ...upToReview,
      ["14:02:10", { type: "run.waiting", state: "review", events: ["approve", "reject"] }],
      ["14:02:30", { type: "event.received", event: "approve" }],
      ...finishedAt("14:02:30"),
    ]);
    expect(steps).toEqual([
      { stateId: "read", agentId: "writer", end: { kind: "done", tookMs: 1000 } },
      { stateId: "draft", agentId: "writer", end: { kind: "done", tookMs: 9000 } },
      {
        stateId: "review",
        agentId: undefined,
        end: { kind: "answered", event: "approve", at: "2026-11-10T14:02:30.000Z" },
      },
    ]);
  });

  it("ends a failed run's steps with the step it failed in", () => {
    const steps = stepsOf([
      ["14:00:00", entered("read")],
      ["14:00:01", entered("classify")],
      ["14:00:01", agentStarted("classify", "sorter")],
      ["14:00:03", { type: "run.failed", state: "classify", error: "no tools" }],
    ]);
    expect(steps.map((step) => [step.stateId, step.end])).toEqual([
      ["read", { kind: "done", tookMs: 1000 }],
      ["classify", { kind: "failed", tookMs: 2000 }],
    ]);
  });

  it("keeps a parallel step's branches in their step", () => {
    const steps = stepsOf([
      ["14:00:00", entered("checks")],
      ["14:00:00", inBranch("left", entered("draft"))],
      ["14:00:00", inBranch("right", entered("classify"))],
      ...finishedAt("14:00:04"),
    ]);
    expect(steps).toEqual([
      { stateId: "checks", agentId: undefined, end: { kind: "done", tookMs: 4000 } },
    ]);
  });

  it("says the last step waits for the user's OK, with the subagent that asked", () => {
    const steps = stepsOf([
      ["14:00:00", entered("draft")],
      ["14:00:00", agentStarted("draft", "writer")],
      [
        "14:00:05",
        {
          type: "approval.requested",
          state: "draft",
          agent: "writer",
          subagent: "checker",
          tool: "gmail_send",
          args: {},
          callId: "call-1",
          resume: { messages: [], step: 0 },
        } as unknown as RunEventBody,
      ],
      ["14:00:05", { type: "run.waiting", state: "draft", events: ["approve", "reject"] }],
    ]);
    expect(steps.at(-1)?.end).toEqual({ kind: "waitingForApproval", subagent: "checker" });
  });

  it("says what the last step waits for: a child run, an answer or a time", () => {
    const waitingAt = (body: RunEventBody) =>
      stepsOf([...upToReview, ["14:02:10", body]]).at(-1)?.end;
    expect(
      waitingAt({
        type: "run.waiting",
        state: "review",
        events: ["approve"],
        child: "run_x_01jd9a",
      }),
    ).toEqual({ kind: "waitingForChildRun", childRunId: "run_x_01jd9a" });
    expect(waitingAt({ type: "run.waiting", state: "review", events: ["approve"] })).toEqual({
      kind: "waitingForYou",
      since: "2026-11-10T14:02:10.000Z",
    });
    expect(
      waitingAt({
        type: "run.waiting",
        state: "review",
        events: [],
        timers: [{ after: "4h", at: "2026-11-10T18:02:10.000Z" }],
      }),
    ).toEqual({ kind: "waitingUntil", due: "2026-11-10T18:02:10.000Z" });
  });

  it("says the last step runs, since it started, while the run goes on", () => {
    const steps = stepsOf(upToReview.slice(0, 4));
    expect(steps.at(-1)).toEqual({
      stateId: "draft",
      agentId: "writer",
      end: { kind: "running", since: "2026-11-10T14:00:01.000Z" },
    });
  });
});
