import type { RunEvent, RunEventBody } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { SourcedRun } from "../api.ts";
import { approvalAt, minutesLater, mondayMorning, summaryWith } from "../summary.test-helper.ts";
import {
  agentSays,
  approvalLines,
  itemLines,
  messageLines,
  modelLines,
  readLines,
  summaryLine,
} from "./receipt-model.ts";
import { logOf } from "./run-log.test-helper.ts";

const context = {
  workflow: { name: "Support reply", stepDescription: () => undefined },
  workflowOfRun: () => undefined,
  providerKind: () => undefined,
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
  const run: SourcedRun = { summary: summaryWith(changes) };
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

  it("leaves the sent part out for a run without a tool call, and says how often it asked", () => {
    const waiting: RunEventBody = {
      type: "run.waiting",
      state: "review",
      events: ["approve"],
    } as RunEventBody;
    expect(line(done, [waiting])).toBe("Finished in 2 min · asked you once");
  });

  it("says so far once after the last thing a live run sent, and has no cost for a free run", () => {
    expect(
      line({ approvals: [approvalAt(1)] }, [
        sentCall("gmail_send", ["email", "emails"]),
        sentCall("drive_create_file", ["Drive file", "Drive files"], "saved"),
      ]),
    ).toBe("Waiting for you · started 10:40 · sent 1 email · saved 1 Drive file so far");
  });

  it("doesn't count the times a live run asked, and doesn't repeat the banner's sentence", () => {
    const waiting: RunEventBody = {
      type: "run.waiting",
      state: "review",
      events: ["approve"],
    } as RunEventBody;
    expect(line({ approvals: [approvalAt(1)] }, [waiting])).toBe("Waiting for you · started 10:40");
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

  it("opens a failed run that never entered a step with how long it took alone", () => {
    expect(
      line(
        {
          status: "failed",
          endedAt: minutesLater(1),
          state: null,
          statesVisited: [],
          approvals: [],
        },
        [],
      ),
    ).toBe("Failed after 1 min");
  });

  it("opens a run that couldn't try a step with the step, as its row does, not as running", () => {
    expect(line({ status: "cant-try", endedAt: minutesLater(1), state: "draft" }, [])).toBe(
      "In Draft",
    );
  });

  it("leaves out the cost of a run with no priced call and no unpriced one", () => {
    expect(line({ ...done, cost: 0 }, [])).toBe("Finished in 2 min");
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
      "Send an email with Gmail: approved by you at 10:42",
      "Use drive_save: rejected by a rule at 10:44",
    ]);
  });

  it("leaves out who answered when an older log doesn't say", () => {
    const events = logOf(id, [
      [1, asked("c1", "gmail_send")],
      [2, answered("c1", "gmail_send", true)],
    ]);
    expect(approvalLines(events).map((entry) => entry.text)).toEqual([
      "Send an email with Gmail: approved at 10:42",
    ]);
  });

  it("says an approval still open is waiting, and has no lines for a run that asked none", () => {
    expect(approvalLines(logOf(id, [[1, asked("c1", "gmail_send")]])).map((e) => e.text)).toEqual([
      "Send an email with Gmail: waiting for your answer",
    ]);
    expect(approvalLines(logOf(id, []))).toEqual([]);
  });

  it('names a tool without plain words as the Inbox card does, "use" and its name', () => {
    expect(approvalLines(logOf(id, [[1, asked("c1", "create_note")]])).map((e) => e.text)).toEqual([
      "Use create_note: waiting for your answer",
    ]);
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
    ).toEqual(["Send an email with Gmail: not answered"]);
  });

  const waitStep = (title?: string): RunEventBody => ({
    type: "run.waiting",
    state: "review",
    events: ["approve", "reject", "escalate"],
    ...(title === undefined ? {} : { title }),
  });
  const received = (event: string): RunEventBody => ({ type: "event.received", event });

  it("lists a wait step's answer by its title, among the tool approvals in the order asked (HAL-12727)", () => {
    const events = logOf(id, [
      [1, asked("c1", "gmail_send")],
      [2, { type: "run.waiting", state: "draft", events: ["approve", "reject"] }],
      [3, answered("c1", "gmail_send", true, "person")],
      [4, waitStep("Approve this reply?")],
      [5, received("approve")],
      [6, waitStep()],
      [7, received("escalate")],
    ]);
    expect(approvalLines(events).map((entry) => entry.text)).toEqual([
      "Send an email with Gmail: approved by you at 10:43",
      "Approve this reply?: approved by you at 10:45",
      "Review: answered escalate by you at 10:47",
    ]);
  });

  it("says a wait step is waiting, or not answered once the run ended or a timer moved it on", () => {
    const texts = (bodies: RunEventBody[]) =>
      approvalLines(
        logOf(
          id,
          bodies.map((body, index) => [index + 1, body] as const),
        ),
      ).map((entry) => entry.text);
    const failed: RunEventBody = { type: "run.failed", reason: "cancelled" } as never;
    const timer: RunEventBody = { type: "timer.fired", state: "review", after: "1h" };
    expect(texts([waitStep("Approve this reply?")])).toEqual([
      "Approve this reply?: waiting for your answer",
    ]);
    expect(texts([waitStep("Approve this reply?"), failed])).toEqual([
      "Approve this reply?: not answered",
    ]);
    expect(texts([waitStep("Approve this reply?"), timer])).toEqual([
      "Approve this reply?: not answered",
    ]);
  });

  it("has no line for a run that waits on a child run", () => {
    const child: RunEventBody = { type: "run.waiting", state: "sub", events: [], child: "run_2" };
    expect(approvalLines(logOf(id, [[1, child]]))).toEqual([]);
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
      "Estimated cost €0.008 · from the prices in workspace settings › Models",
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
      "Estimated cost €0.008 + 1 call without a price · from the prices in workspace settings › Models",
    ]);
    expect(lines([modelCall("odd")], { cost: 0, unpricedCalls: 1 }).at(-1)).toBe(
      "1 call without a price · from the prices in workspace settings › Models",
    );
  });

  it("escapes a model name's hidden characters, so the line keeps its order (HAL-13822)", () => {
    expect(
      lines([modelCall("claude-next\u202e-5", { cost: 0.0083 })], {
        cost: 0.0083,
        unpricedCalls: 0,
      })[0],
    ).toBe("claude-next\\u202e-5 · 1 call · 1,000 in · 300 out · €0.008");
  });

  it("says a subscription paid for a call", () => {
    expect(
      lines([modelCall("sonnet", { paidBy: "subscription", cost: 0 })], {
        cost: 0,
        unpricedCalls: 0,
      }),
    ).toEqual(["sonnet · 1 call · 1,000 in · 300 out · on your subscription"]);
  });

  it("names the built-in test model, not its model id, and says it costs nothing (#2429, HAL-12727)", () => {
    const free = { cost: 0, unpricedCalls: 0 };
    const testModel = (model: string) =>
      ({ ...modelCall(model, { cost: 0 }), provider: "mock" }) as RunEventBody;
    expect(lines([testModel("echo"), testModel("scripted")], free)).toEqual([
      "Built-in test model · 2 calls · 2,000 in · 600 out · no cost",
    ]);
    expect(lines([modelCall("scripted", { cost: 0 })], free)).toEqual([
      "scripted · 1 call · 1,000 in · 300 out · no cost",
    ]);
  });

  it('counts cached calls among fresh ones as "2 cached calls"', () => {
    expect(
      lines(
        [
          modelCall("sonnet", { cost: 0.004 }),
          modelCall("sonnet", { cached: true }),
          modelCall("sonnet", { cached: true }),
        ],
        { cost: 0.004, unpricedCalls: 0 },
      )[0],
    ).toBe("sonnet · 3 calls · 1,000 in · 300 out · €0.004 · 2 cached calls");
  });

  it("has no lines for a run that made no model call", () => {
    expect(lines([])).toEqual([]);
  });
});

const saved = (name: string): RunEventBody => ({
  type: "artifact.created",
  state: "write",
  name,
  hash: "a".repeat(64),
  mediaType: "text/markdown",
  size: 12,
});

const answered = (output: unknown, error?: string): RunEventBody => ({
  type: "agent.finished",
  state: "write",
  agent: "reporter",
  output,
  ...(error === undefined ? {} : { error }),
});

const logWith = (...bodies: RunEventBody[]) =>
  logOf(
    id,
    bodies.map((body) => [1, body] as const),
  );

verifies("runs.run-view.receipt-items", () => {
  it("lists the file a Weekly report run saved", () => {
    expect(itemLines(logWith(saved("weekly-report.md")))).toEqual([
      "Created 1 file: weekly-report.md",
    ]);
  });

  it("names each file once, in the order saved", () => {
    expect(itemLines(logWith(saved("notes.md"), saved("summary.md"), saved("notes.md")))).toEqual([
      "Created 2 files: notes.md and summary.md",
    ]);
    expect(itemLines(logWith(saved("a.md"), saved("b.md"), saved("c.md")))).toEqual([
      "Created 3 files: a.md, b.md and c.md",
    ]);
  });

  it("escapes a hidden character in a name", () => {
    expect(itemLines(logWith(saved(`report${String.fromCodePoint(0x202e)}.md`)))).toEqual([
      "Created 1 file: report\\u202e.md",
    ]);
  });

  it("has no lines for a run that saved no file", () => {
    expect(itemLines(logWith())).toEqual([]);
  });
});

verifies("runs.run-view.agent-says", () => {
  it("gives the last answer, as written with its line breaks", () => {
    expect(
      agentSays(logWith(answered("Sorted"), answered("This week: 12 emails.\nAll answered."))),
    ).toBe("This week: 12 emails.\nAll answered.");
  });

  it("gives an answer that isn't text as its JSON", () => {
    expect(agentSays(logWith(answered({ emails: 12 })))).toBe('{\n  "emails": 12\n}');
  });

  it("passes over a failed or empty answer for the one before it", () => {
    expect(agentSays(logWith(answered("Sorted as refund"), answered(null, "Model refused")))).toBe(
      "Sorted as refund",
    );
    expect(agentSays(logWith(answered("Sorted as refund"), answered("  ")))).toBe(
      "Sorted as refund",
    );
  });

  it("escapes hidden characters and keeps Markdown as text", () => {
    const text = `Pay ${String.fromCodePoint(0x202e)}![x](https://example.com/x.png)`;
    expect(agentSays(logWith(answered(text)))).toBe("Pay \\u202e![x](https://example.com/x.png)");
  });

  it("is undefined when no agent answered", () => {
    expect(agentSays(logWith(saved("a.md")))).toBeUndefined();
  });
});
