import type { RunEvent, RunEventBody } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { SourcedRun } from "../api.ts";
import { approvalAt, minutesLater, mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { summaryLine } from "./receipt-model.ts";
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
