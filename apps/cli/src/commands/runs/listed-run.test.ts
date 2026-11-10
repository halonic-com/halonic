import type { WorkflowDefinition } from "@halonicjs/app";
import { type RunEventBody, type RunSummary, summarize } from "@halonicjs/events";
import { describe, expect, it } from "vitest";
import { plainText } from "../../messages/phrase.ts";
import type { RunClock } from "../../run-times.ts";
import { type FindWorkflow, listedRun } from "./listed-run.ts";

const supportReply = {
  version: 1,
  id: "support-reply",
  name: "Support reply",
  initial: "read",
  context: {},
  layout: {},
  states: {
    read: { type: "task", description: "Read the mail" },
    draft: { type: "task", description: "Draft a reply\nIn the customer's language." },
    review: { type: "wait", description: "Approve this reply?" },
    hold: { type: "wait" },
  },
} as unknown as WorkflowDefinition;

const findWorkflow: FindWorkflow = (hubId, workflowId) =>
  hubId === "acme" && workflowId === "support-reply" ? supportReply : undefined;

/** 9 Nov 2026, 12:00 UTC, the list's "now", written in UTC. */
const clock: RunClock = { now: new Date(Date.UTC(2026, 10, 9, 12, 0)), timeZone: "UTC" };

const started: RunEventBody = {
  type: "run.started",
  hubId: "acme",
  workflowId: "support-reply",
  input: {},
  kind: "run",
  definitionsVersion: "v1",
};

/** A run's summary from its event bodies, the first at `startedAt` and each next one `stepMs` later. */
function runOf(bodies: readonly RunEventBody[], startedAt: string, stepMs = 1000): RunSummary {
  const start = Date.parse(startedAt);
  const summary = summarize(
    bodies.map((body, index) => ({
      ...body,
      runId: "run_mfx3k2a1_a101jd8q",
      seq: index + 1,
      at: new Date(start + index * stepMs).toISOString(),
    })),
  );
  if (summary === null) {
    throw new Error("The test log has no run.started.");
  }
  return summary;
}

/** The row as plain text; `madeToolCalls` only matters for a completed run. */
function row(summary: RunSummary, madeToolCalls = true) {
  const listed = listedRun({ summary, madeToolCalls }, findWorkflow, clock);
  return {
    runId: listed.runId,
    status: listed.status,
    workflow: listed.workflow,
    what: plainText(listed.what),
    when: plainText(listed.when),
  };
}

const today = "2026-11-09T10:31:00.000Z";

describe("listedRun", () => {
  it("shows a running run in its step, with no took", () => {
    const summary = runOf([started, { type: "state.entered", state: "draft" }], today);

    expect(row(summary)).toEqual({
      runId: "01jd8q",
      status: "running",
      workflow: "Support reply",
      what: "In Draft a reply",
      when: "10:31",
    });
  });

  it("shows a run at a wait step with the waiting line's words", () => {
    const summary = runOf(
      [
        started,
        { type: "state.entered", state: "review" },
        { type: "run.waiting", state: "review", events: ["approve", "reject"] },
      ],
      today,
    );

    expect(row(summary)).toMatchObject({
      status: "needsYou",
      what: "Waiting for you: Approve this reply?",
    });
  });

  it("names the step when the wait step has no description", () => {
    const summary = runOf(
      [
        started,
        { type: "state.entered", state: "hold" },
        { type: "run.waiting", state: "hold", events: ["approve"] },
      ],
      today,
    );

    expect(row(summary)).toMatchObject({
      status: "needsYou",
      what: "Waiting for you in the step Hold",
    });
  });

  it("shows a tool approval as Needs you, in the step whose agent asked", () => {
    const summary = runOf(
      [
        started,
        { type: "state.entered", state: "draft" },
        {
          type: "approval.requested",
          state: "draft",
          agent: "writer",
          tool: "gmail__send",
          args: {},
          callId: "c1",
          resume: { messages: [], calls: [], step: 0 },
        },
        { type: "run.waiting", state: "draft", events: ["approve", "reject"] },
      ],
      today,
    );

    expect(row(summary)).toMatchObject({
      status: "needsYou",
      what: "Waiting for your approval in the step Draft a reply",
    });
  });

  it("shows a run waiting for its child run as Waiting, by the child's short id", () => {
    const summary = runOf(
      [
        started,
        { type: "state.entered", state: "review" },
        {
          type: "run.waiting",
          state: "review",
          events: ["approve"],
          child: "run_mfx3k2a1_9c7k2m9p",
        },
      ],
      today,
    );

    expect(row(summary)).toMatchObject({
      status: "waiting",
      what: "Waiting for child run 7k2m9p",
    });
  });

  it.each([
    ["2026-11-09T14:00:00.000Z", "Waiting until 14:00"],
    ["2026-11-10T08:00:00.000Z", "Waiting until tomorrow 08:00"],
    ["2026-12-03T08:00:00.000Z", "Waiting until 3 Dec 08:00"],
  ])("shows a run waiting for a timer due at %s as %j", (at, what) => {
    const summary = runOf(
      [
        started,
        { type: "state.entered", state: "hold" },
        { type: "run.waiting", state: "hold", events: [], timers: [{ after: "2h", at }] },
      ],
      today,
    );

    expect(row(summary)).toMatchObject({ status: "waiting", what });
  });

  it("shows a run that waits for nothing it names as Waiting in its step", () => {
    const summary = runOf(
      [
        started,
        { type: "state.entered", state: "hold" },
        { type: "run.waiting", state: "hold", events: [] },
      ],
      today,
    );

    expect(row(summary)).toMatchObject({ status: "waiting", what: "Waiting in Hold" });
  });

  it("shows a completed run's estimated cost and how long it took", () => {
    const summary = runOf(
      [
        started,
        {
          type: "llm.response",
          agent: "writer",
          provider: "anthropic",
          model: "smart",
          usage: { inputTokens: 10, outputTokens: 10 },
          latencyMs: 900,
          text: "Hello",
          cost: 0.004,
        },
        { type: "run.completed", state: "draft", context: {} },
      ],
      today,
      9000,
    );

    expect(row(summary)).toMatchObject({
      status: "done",
      workflow: "Support reply",
      what: "Estimated cost €0.004",
      when: "10:31 · took 18 s",
    });
  });

  it("says a completed run without a tool call sent nothing, with its cost", () => {
    const summary = runOf(
      [
        started,
        {
          type: "llm.response",
          agent: "writer",
          provider: "anthropic",
          model: "smart",
          usage: { inputTokens: 10, outputTokens: 10 },
          latencyMs: 900,
          text: "Hello",
          cost: 0.02,
        },
        { type: "run.completed", state: "draft", context: {} },
      ],
      today,
    );

    expect(row(summary, false).what).toBe("Sent nothing · estimated cost €0.02");
  });

  it("says just Sent nothing for a run on the test model without a tool call", () => {
    const summary = runOf([started, { type: "run.completed", state: "draft", context: {} }], today);

    expect(row(summary, false).what).toBe("Sent nothing");
  });

  it("names the step a completed run finished in when it had tool calls but no priced call", () => {
    const summary = runOf(
      [
        started,
        { type: "state.entered", state: "draft" },
        { type: "run.completed", state: "draft", context: {} },
      ],
      today,
    );

    expect(row(summary, true).what).toBe("Finished in Draft a reply");
  });

  it("shows a run stopped at its budget as Stopped, in the step it reached", () => {
    const summary = runOf(
      [
        started,
        { type: "state.entered", state: "draft" },
        { type: "run.failed", state: "draft", error: "budget", reason: "budget" },
      ],
      today,
    );

    expect(row(summary)).toMatchObject({
      status: "stopped",
      what: "Budget reached in Draft a reply",
    });
  });

  it("shows any other failure as Failed, where and not why", () => {
    const summary = runOf(
      [started, { type: "run.failed", state: "read", error: "boom" }],
      "2026-11-08T16:40:00.000Z",
      60_000,
    );

    expect(row(summary)).toMatchObject({
      status: "failed",
      workflow: "Support reply",
      what: "In Read the mail",
      when: "yesterday 16:40 · took 1 min",
    });
  });

  it("names a workflow that's gone by its id", () => {
    const summary = runOf([{ ...started, workflowId: "old-flow" }], today);

    expect(row(summary).workflow).toBe("old-flow");
  });

  it("writes an earlier day this year, and a day in an earlier year", () => {
    expect(row(runOf([started], "2026-11-03T14:05:00.000Z")).when).toBe("3 Nov 14:05");
    expect(row(runOf([started], "2025-11-03T14:05:00.000Z")).when).toBe("3 Nov 2025");
  });
});
