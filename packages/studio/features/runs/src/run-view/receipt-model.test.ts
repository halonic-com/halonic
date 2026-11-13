import type { RunEvent, RunEventBody } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { SourcedRun } from "../api.ts";
import { approvalAt, minutesLater, mondayMorning, summaryWith } from "../summary.test-helper.ts";
import {
  approvalLines,
  messageLines,
  modelLines,
  readLines,
  summaryLine,
} from "./receipt-model.ts";
import { logOf } from "./run-log.test-helper.ts";

const context = {
  workflow: { name: "Support reply", stepDescription: () => undefined },
  workflowOfRun: () => undefined,
  currency: "EUR",
  now: mondayMorning,
};

const id = "run_mfx3k2a1_01jd8q";

function sentCall(tool: string, noun: [string, string], verb?: "saved"): RunEventBody {
  return {
    type: "tool.result",
    agent: "reporter",
    tool,
    result: "ok",
    outcome: "ok",
    risk: "send",
    noun: { one: noun[0], many: noun[1] },
    ...(verb === undefined ? {} : { verb }),
  };
}

function line(changes: Parameters<typeof summaryWith>[0], bodies: RunEventBody[]): string {
  const run: SourcedRun = { summary: summaryWith(changes), madeToolCalls: bodies.length > 0 };
  const events: RunEvent[] = logOf(
    id,
    bodies.map((body) => [1, body] as const),
  );
  return summaryLine(run, events, context);
}

const done = { status: "completed", endedAt: minutesLater(2), state: null } as const;

verifies("runs.run-view.receipt-summary", () => {
  it("says what a finished run sent, in call order, and its cost", () => {
    expect(
      line({ ...done, cost: 0.03 }, [
        sentCall("gmail_send", ["email", "emails"]),
        sentCall("calendar_create_event", ["invite", "invites"]),
        sentCall("gmail_send", ["email", "emails"]),
        sentCall("drive_create_file", ["Drive file", "Drive files"], "saved"),
      ]),
    ).toBe(
      "Finished in 2 min · sent 2 emails and 1 invite · saved 1 Drive file · estimated cost €0.03",
    );
  });

  it("says sent nothing only for a run without a tool call, and how often it asked", () => {
    const waiting: RunEventBody = {
      type: "run.waiting",
      state: "review",
      events: ["approve"],
    } as RunEventBody;
    expect(line(done, [waiting])).toBe("Finished in 2 min · sent nothing · asked you once");
  });

  it("says so far once after the last thing a live run sent, and has no cost for a free run", () => {
    expect(
      line({ approvals: [approvalAt(1)] }, [
        sentCall("gmail_send", ["email", "emails"]),
        sentCall("drive_create_file", ["Drive file", "Drive files"], "saved"),
      ]),
    ).toBe("Waiting for your approval in the step Send · sent 1 email · saved 1 Drive file so far");
  });

  it("opens a failed run with its step and how long it took, and keeps a possible send", () => {
    const broken = {
      ...sentCall("drive_create_file", ["Drive file", "Drive files"], "saved"),
      outcome: "unknown",
    } as RunEventBody;
    expect(
      line({ status: "failed", endedAt: minutesLater(1), state: "draft", cost: 0.01 }, [
        sentCall("gmail_send", ["email", "emails"]),
        broken,
      ]),
    ).toBe(
      "Failed in Draft after 1 min · sent 1 email · may have saved 1 Drive file · estimated cost €0.01",
    );
  });

  it("opens a run that couldn't try a step with the step, as its row does, not as running", () => {
    expect(line({ status: "cant-try", endedAt: minutesLater(1), state: "draft" }, [])).toBe(
      "In Draft · sent nothing",
    );
  });

  it("leaves out the cost of a run with no priced call and no unpriced one", () => {
    expect(line({ ...done, cost: 0 }, [])).toBe("Finished in 2 min · sent nothing");
  });
});

verifies("runs.run-view.receipt-approvals", () => {
  const asked = (callId: string, tool: string): RunEventBody => ({
    type: "approval.requested",
    state: "send",
    agent: "reporter",
    tool,
    args: {},
    callId,
    resume: { kind: "agent" } as never,
  });
  const answered = (
    callId: string,
    tool: string,
    approved: boolean,
    by?: "person" | "rule",
  ): RunEventBody => ({
    type: "approval.resolved",
    state: "send",
    agent: "reporter",
    tool,
    callId,
    approved,
    ...(by === undefined ? {} : { by }),
  });

  it("says what was decided, by whom and when, in the order asked", () => {
    const events = logOf(id, [
      [1, asked("c1", "gmail_send")],
      [2, answered("c1", "gmail_send", true, "person")],
      [3, asked("c2", "drive_save")],
      [4, answered("c2", "drive_save", false, "rule")],
    ]);
    expect(approvalLines(events).map((entry) => entry.text)).toEqual([
      "gmail_send: approved by you at 10:42",
      "drive_save: rejected by a rule at 10:44",
    ]);
  });

  it("leaves out who answered when an older log doesn't say", () => {
    const events = logOf(id, [
      [1, asked("c1", "gmail_send")],
      [2, answered("c1", "gmail_send", true)],
    ]);
    expect(approvalLines(events).map((entry) => entry.text)).toEqual([
      "gmail_send: approved at 10:42",
    ]);
  });

  it("says an approval still open is waiting, and has no lines for a run that asked none", () => {
    expect(approvalLines(logOf(id, [[1, asked("c1", "gmail_send")]])).map((e) => e.text)).toEqual([
      "gmail_send: waiting for your answer",
    ]);
    expect(approvalLines(logOf(id, []))).toEqual([]);
  });

  it("says an approval left open on a run that ended was not answered", () => {
    const failed: RunEventBody = { type: "run.failed", reason: "cancelled" } as never;
    expect(
      approvalLines(
        logOf(id, [
          [1, asked("c1", "gmail_send")],
          [2, failed],
        ]),
      ).map((e) => e.text),
    ).toEqual(["gmail_send: not answered"]);
  });
});

verifies("runs.run-view.receipt-messages-read", () => {
  const call = (
    risk: "read" | "write" | "send",
    noun: [string, string],
    verb?: "drafted" | "saved",
  ): RunEventBody => ({
    type: "tool.result",
    agent: "reporter",
    tool: "a_tool",
    result: "ok",
    outcome: "ok",
    risk,
    noun: { one: noun[0], many: noun[1] },
    ...(verb === undefined ? {} : { verb }),
  });
  const email: [string, string] = ["email", "emails"];
  const invite: [string, string] = ["invite", "invites"];
  const file: [string, string] = ["Drive file", "Drive files"];
  const log = (...bodies: RunEventBody[]) =>
    logOf(
      id,
      bodies.map((body) => [1, body] as const),
    );

  it("says what was drafted, then what was sent, as two lines", () => {
    const events = log(
      call("send", email),
      call("write", email, "drafted"),
      call("send", invite),
      call("send", email),
    );
    expect(messageLines(events)).toEqual(["Drafted 1 email", "Sent 2 emails and 1 invite"]);
  });

  it("doesn't count a file saved as a message", () => {
    expect(messageLines(log(call("send", file, "saved")))).toEqual([]);
  });

  it("puts all reads in one line", () => {
    const events = log(
      call("read", email),
      call("read", file),
      call("read", email),
      call("read", email),
    );
    expect(readLines(events)).toEqual(["Read 3 emails and 1 Drive file"]);
  });

  it("has no lines for a run that read and messaged nothing", () => {
    expect(readLines(log())).toEqual([]);
    expect(messageLines(log())).toEqual([]);
  });
});

function modelCall(
  model: string,
  extra: { cost?: number; cached?: true; paidBy?: "subscription" } = {},
  usage = { inputTokens: 1000, outputTokens: 300 },
): RunEventBody {
  return {
    type: "llm.response",
    agent: "reporter",
    provider: "anthropic",
    model,
    usage,
    latencyMs: 10,
    text: "ok",
    ...extra,
  };
}

verifies("runs.run-view.receipt-models-cost", () => {
  const total = { cost: 0.0083, unpricedCalls: 0 };
  const lines = (bodies: RunEventBody[], summary = total) =>
    modelLines(
      logOf(
        id,
        bodies.map((body) => [1, body] as const),
      ),
      summary,
      "EUR",
    );

  it("has one line per model with its calls, tokens and cost, then the total", () => {
    expect(
      lines([modelCall("sonnet", { cost: 0.004 }), modelCall("sonnet", { cost: 0.0043 })]),
    ).toEqual([
      "sonnet · 2 calls · 2,000 in · 600 out · €0.008",
      "Estimated cost €0.008 · from the prices in Settings › Models",
    ]);
  });

  it("says a cached answer was not a model call, never €0", () => {
    expect(lines([modelCall("sonnet", { cached: true })], { cost: 0, unpricedCalls: 0 })).toEqual([
      "sonnet · 1 call · cached, no model call",
    ]);
  });

  it("says a call without a price has none and counts it beside the total", () => {
    expect(
      lines([modelCall("sonnet", { cost: 0.0083 }), modelCall("odd")], {
        cost: 0.0083,
        unpricedCalls: 1,
      }),
    ).toEqual([
      "sonnet · 1 call · 1,000 in · 300 out · €0.008",
      "odd · 1 call · 1,000 in · 300 out · No price",
      "Estimated cost €0.008 + 1 call without a price · from the prices in Settings › Models",
    ]);
    expect(lines([modelCall("odd")], { cost: 0, unpricedCalls: 1 }).at(-1)).toBe(
      "1 call without a price · from the prices in Settings › Models",
    );
  });

  it("says a subscription paid for a call", () => {
    expect(
      lines([modelCall("sonnet", { paidBy: "subscription", cost: 0 })], {
        cost: 0,
        unpricedCalls: 0,
      }),
    ).toEqual(["sonnet · 1 call · 1,000 in · 300 out · on your subscription"]);
  });

  it("has no lines for a run that made no model call", () => {
    expect(lines([])).toEqual([]);
  });
});
