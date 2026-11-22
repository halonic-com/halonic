import type { RunSends } from "@halonicjs/events";
import { describe, expect, it } from "vitest";
import {
  noToolCalls,
  row,
  runOf,
  started,
  today,
  toolCallsOnly,
} from "../../test/listed-run-fixtures.ts";

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

    expect(row(summary, noToolCalls).what).toBe("Sent nothing · estimated cost €0.02");
  });

  it("says what a completed run sent and may have sent, as the receipt does, then its cost", () => {
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
    );
    const driveFile = { one: "Drive file", many: "Drive files" };
    const sends: RunSends = {
      sent: [
        {
          verb: "sent",
          counts: [
            { noun: { one: "email", many: "emails" }, calls: 2 },
            { noun: { one: "invite", many: "invites" }, calls: 2 },
          ],
        },
        { verb: "saved", counts: [{ noun: driveFile, calls: 1 }] },
      ],
      maySend: [{ verb: "moved", counts: [{ noun: driveFile, calls: 1 }] }],
      madeToolCalls: true,
    };

    expect(row(summary, sends).what).toBe(
      "Sent 2 emails and 2 invites · saved 1 Drive file · may have moved 1 Drive file · estimated cost €0.004",
    );
  });

  it("says just Sent nothing for a run on the test model without a tool call", () => {
    const summary = runOf([started, { type: "run.completed", state: "draft", context: {} }], today);

    expect(row(summary, noToolCalls).what).toBe("Sent nothing");
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

    expect(row(summary, toolCallsOnly).what).toBe("Finished");
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

  it("shows a run that couldn't try every step as Couldn't try, in its step (HAL-4285)", () => {
    const cantTry = {
      status: "cant-try",
      item: "workflows/support-reply.yaml",
      step: "draft",
      reason: { kind: "needs-left-out-change", path: "models.yaml", leftOut: "models" },
    } as const;
    const summary = runOf(
      [
        started,
        { type: "state.entered", state: "draft" },
        { type: "run.cant-try", state: "draft", cantTry: [cantTry] },
      ],
      today,
    );

    expect(row(summary)).toMatchObject({ status: "couldntTry", what: "In Draft a reply" });
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
