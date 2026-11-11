// Until the CLI switches to the app's run facts (HAL-1301, plan PR 8), the
// CLI keeps its own `listedStatus` and `money`. This file pins them to the
// app's `runStanding` and `moneyAmount` over the same cases, so the two can't
// drift apart unnoticed. Each difference known today is pinned on its own:
// PR 8 has to flip it on purpose, and then deletes this file.

import { moneyAmount, type RunStanding, runStanding } from "@halonicjs/app";
import type { PendingApproval, RunSummary } from "@halonicjs/events";
import { describe, expect, it } from "vitest";
import { listedStatus } from "./commands/runs/listed-run.ts";
import { money } from "./messages/money.ts";
import type { ListedStatus } from "./messages/runs-list.ts";

/** The CLI's status word for each of the app's standings: both kinds of Stopped read Stopped. */
const cliWordFor: Record<RunStanding, ListedStatus> = {
  running: "running",
  "needs-you": "needsYou",
  waiting: "waiting",
  done: "done",
  failed: "failed",
  budget: "stopped",
  cancelled: "stopped",
  "cant-try": "couldntTry",
};

/** A summary of an Acme Support reply run, changed by `changes`. */
function summaryWith(changes: Partial<RunSummary>): RunSummary {
  return {
    id: "run_mfx3k2a1_01jd8q",
    hubId: "acme",
    workflowId: "support-reply",
    kind: "run",
    status: "running",
    state: "draft",
    startedAt: "2026-11-09T10:40:00.000Z",
    endedAt: null,
    usage: { inputTokens: 0, outputTokens: 0 },
    cost: 0,
    unpricedCalls: 0,
    subscriptionCalls: 0,
    statesVisited: ["read", "draft"],
    context: {},
    error: null,
    reason: null,
    definitionsVersion: "v1",
    trigger: null,
    parentRunId: null,
    waitingOn: null,
    accepts: [],
    answerLabels: {},
    nextTimer: null,
    waitingFor: null,
    lastWaitingAt: null,
    approvals: [],
    signals: [],
    cantTry: [],
    lastSeq: 7,
    updatedAt: "2026-11-09T10:42:00.000Z",
    ...changes,
  };
}

const sendApproval: PendingApproval = {
  agent: "reporter",
  tool: "gmail_send",
  args: {},
  callId: "call-1",
  at: "2026-11-09T10:41:00.000Z",
  state: "draft",
  branch: null,
  item: null,
};

const twoPm = "2026-11-09T14:00:00.000Z";

/** Runs both sides read the same way, by the CLI's word for them. */
const sameStanding: ReadonlyArray<readonly [string, Partial<RunSummary>, ListedStatus]> = [
  ["a running run", { status: "running" }, "running"],
  [
    "a waiting run with an open approval",
    { status: "waiting", approvals: [sendApproval] },
    "needsYou",
  ],
  [
    "a run waiting at a step that takes events",
    { status: "waiting", state: "review", accepts: ["approve"] },
    "needsYou",
  ],
  [
    "a run waiting at a step that takes events, with its own timer",
    { status: "waiting", state: "review", accepts: ["approve"], nextTimer: twoPm },
    "needsYou",
  ],
  [
    "a run waiting for a child run that passes events on",
    { status: "waiting", waitingOn: "run_x_7k2m9p", accepts: ["approve"] },
    "waiting",
  ],
  ["a run waiting for a child run", { status: "waiting", waitingOn: "run_x_7k2m9p" }, "waiting"],
  ["a run waiting for a timer", { status: "waiting", nextTimer: twoPm }, "waiting"],
  ["a run waiting for nothing", { status: "waiting" }, "waiting"],
  ["a completed run", { status: "completed" }, "done"],
  ["a run stopped at its budget", { status: "failed", reason: "budget" }, "stopped"],
  ["a cancelled run", { status: "failed", reason: "cancelled" }, "stopped"],
  ["a run that failed for a reason", { status: "failed", reason: "model-missing" }, "failed"],
  ["a run that failed with no reason", { status: "failed", reason: null }, "failed"],
  ["a run that couldn't try a step", { status: "cant-try" }, "couldntTry"],
];

describe("the CLI's and the app's run facts, until PR 8", () => {
  describe("where a run stands", () => {
    it.each(sameStanding)("read %s the same way", (_name, changes, word) => {
      const summary = summaryWith(changes);

      expect(listedStatus(summary)).toBe(word);
      expect(cliWordFor[runStanding(summary)]).toBe(word);
    });

    it("differ on a running run with an open approval: the CLI says Running, the app Needs you", () => {
      // A parallel branch can wait for an OK while another works
      // (run-object-mapping section 2). PR 8 makes the CLI say Needs you.
      const summary = summaryWith({ status: "running", approvals: [sendApproval] });

      expect(listedStatus(summary)).toBe("running");
      expect(runStanding(summary)).toBe("needs-you");
    });
  });

  describe("money", () => {
    it.each([
      [0, "€0.00"],
      [0.0004, "under €0.001"],
      [0.00049, "under €0.001"],
      [0.0005, "€0.001"],
      [0.004, "€0.004"],
      [0.009, "€0.009"],
      [0.01, "€0.01"],
      [5.08, "€5.08"],
      [50, "€50.00"],
      [999.99, "€999.99"],
    ])("write %s as %s on both sides", (amount, written) => {
      expect(money(amount)).toBe(written);
      expect(moneyAmount(amount)).toBe(written);
    });

    it("both write an amount from 0.0095 to just under a cent as €0.010", () => {
      // Kept until PR 8, which writes it "€0.01": three decimals are only
      // for an amount that would read below one cent (HAL-6254).
      expect(money(0.00999)).toBe("€0.010");
      expect(moneyAmount(0.00999)).toBe("€0.010");
    });

    it.each([
      [0.0045, "€0.004", "€0.005"],
      [0.0095, "€0.009", "€0.010"],
      [1.005, "€1.00", "€1.01"],
    ])(
      "differ on a half at the last decimal: %s is %s in the CLI, %s in the app",
      (amount, cli, app) => {
        // The CLI rounds the binary number, just below the half; the app
        // rounds the decimal a person typed, up. PR 8 takes the app's.
        expect(money(amount)).toBe(cli);
        expect(moneyAmount(amount)).toBe(app);
      },
    );

    it("differ from a thousand up: the app separates thousands, the CLI doesn't", () => {
      // PR 8 takes the app's "€1,234.50".
      expect(money(1234.5)).toBe("€1234.50");
      expect(moneyAmount(1234.5)).toBe("€1,234.50");
    });
  });
});
