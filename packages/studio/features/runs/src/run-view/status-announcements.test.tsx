// @vitest-environment jsdom
import type { RunEventBody, RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SourcedRun } from "../api.ts";
import { RunsList } from "../runs-list.ts";
import { fakeSource } from "../source.test-helper.ts";
import { approvalAt, mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { runChangeText } from "./run-change.ts";
import { logOf } from "./run-log.test-helper.ts";
import { RunView } from "./run-page.tsx";

afterEach(unmountAll);

const runId = "run_mfx3k2a1_650704";
const context = {
  workflow: { name: "Support reply", stepDescription: () => undefined },
  workflowOfRun: () => "Verify",
  providerKind: () => undefined,
  currency: "EUR",
  now: mondayMorning,
};

const waitStep = summaryWith({
  id: runId,
  status: "waiting",
  state: "review",
  waitingFor: { title: "Approve this reply?", body: "" },
  accepts: ["approve", "reject"],
});
const completed: RunEventBody = { type: "run.completed", state: "send", context: {} };
const sentEmail: RunEventBody = {
  type: "tool.result",
  agent: "reporter",
  tool: "gmail_send",
  result: "ok",
  outcome: "ok",
  risk: "send",
  noun: { one: "email", many: "emails" },
};

function textOf(changes: Partial<RunSummary>, bodies: readonly RunEventBody[] = []) {
  const run: SourcedRun = { summary: summaryWith({ id: runId, ...changes }) };
  const log = logOf(
    runId,
    bodies.map((body) => [1, body] as const),
  );
  return runChangeText(run, log, context);
}

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function openRun(summary: RunSummary, bodies: readonly RunEventBody[] = []) {
  const fake = fakeSource([summary], {
    [runId]: logOf(
      runId,
      bodies.map((body) => [1, body] as const),
    ),
  });
  const announceState = vi.fn<(key: string, text: string) => void>();
  const root = render(
    <RunView
      list={new RunsList(fake.source)}
      runId={runId}
      now={() => mondayMorning}
      announceState={announceState}
      reviewInInbox={() => undefined}
    />,
  );
  await settled();
  const change = async (next: RunSummary, nextBodies: readonly RunEventBody[] = bodies) => {
    fake.change([next], {
      [runId]: logOf(
        runId,
        nextBodies.map((body) => [1, body] as const),
      ),
    });
    await settled();
    await settled();
  };
  return { root, announceState, change };
}

verifies("runs.run-view.status-announcements", () => {
  describe("the sentence", () => {
    it("says what a run that needs you waits for, in the banner's words", () => {
      expect(textOf(waitStep)).toBe("Run 650704 needs you. Waiting for you: Approve this reply?");
      expect(
        textOf({
          approvals: [
            { ...approvalAt(1), agent: "sorter", tool: "create_note", connector: "notes-mcp" },
          ],
        }),
      ).toBe(
        "Run 650704 needs you. Waiting for your approval: Sorter wants to use create_note (notes-mcp).",
      );
      expect(textOf({ ...waitStep, waitingFor: null })).toBe(
        "Run 650704 needs you. Waiting for you in the step Review.",
      );
    });

    it("says a run is running again, or what it waits for when that isn't you", () => {
      expect(textOf({})).toBe("Run 650704 is running again.");
      expect(textOf({ status: "waiting", waitingOn: "run_mfx3k2a1_7k2m9p" })).toBe(
        "Run 650704 is waiting for child run 7k2m9p.",
      );
      expect(
        textOf({ status: "waiting", nextTimer: new Date(2026, 10, 9, 14, 0).toISOString() }),
      ).toBe("Run 650704 is waiting until 14:00.");
    });

    it("says what a finished run sent and cost, with commas, and only once its log has the end", () => {
      const done = { status: "completed", endedAt: mondayMorning.toISOString() } as const;
      expect(textOf(done, [completed])).toBe("Run 650704 finished.");
      expect(textOf({ ...done, cost: 0.01 }, [sentEmail, completed])).toBe(
        "Run 650704 finished. Sent 1 email, estimated cost €0.01.",
      );
      expect(textOf(done, [sentEmail])).toBeUndefined();
    });

    it("says where a run failed, stopped at its budget or was cancelled", () => {
      expect(textOf({ status: "failed", state: null, statesVisited: ["read", "write"] })).toBe(
        "Run 650704 failed in the step Write. The banner at the top says what to do.",
      );
      expect(textOf({ status: "failed", state: null, statesVisited: [] })).toBe(
        "Run 650704 failed. The banner at the top says what to do.",
      );
      expect(
        textOf({
          status: "failed",
          reason: "budget",
          cause: {
            kind: "limit_reached",
            code: "budget.run",
            detail: { limit: "5", spent: "5.08", currency: "EUR" },
          },
        }),
      ).toBe("Run 650704 stopped at its budget: estimated €5.08 of €5.00.");
      expect(textOf({ status: "failed", reason: "budget" })).toBe(
        "Run 650704 stopped at its budget.",
      );
      expect(textOf({ status: "failed", reason: "cancelled", state: "draft" })).toBe(
        "Run 650704 was cancelled in the step Draft.",
      );
    });
  });

  describe("on the run page", () => {
    it("reads nothing as it opens, then the run's new state under its own key", async () => {
      const { announceState, change } = await openRun(waitStep);
      expect(announceState).not.toHaveBeenCalled();

      const finished = {
        ...waitStep,
        status: "completed",
        endedAt: mondayMorning.toISOString(),
        waitingFor: null,
        // The log grows, so the page reads it again.
        lastSeq: 8,
      } as const;
      await change(finished, [completed]);

      expect(announceState).toHaveBeenCalledTimes(1);
      expect(announceState).toHaveBeenCalledWith(`run:${runId}`, "Run 650704 finished.");
    });

    it("moves focus to the h1 when the banner's button it was on goes", async () => {
      const waiting = summaryWith({ id: runId, approvals: [approvalAt(1)] });
      const { root, change } = await openRun(waiting);
      const review = [...root.querySelectorAll("button")].find(
        (button) => button.textContent === "Review in Inbox",
      );
      act(() => review?.focus());
      expect(document.activeElement).toBe(review);

      await change({ ...waiting, approvals: [] });

      expect(root.querySelector('section[aria-label="Waiting for you"]')).toBeNull();
      expect(document.activeElement).toBe(root.querySelector("h1"));
    });

    it("leaves focus where it is when the change didn't take it", async () => {
      const waiting = summaryWith({ id: runId, approvals: [approvalAt(1)] });
      const { root, change } = await openRun(waiting);
      const outside = document.createElement("button");
      document.body.append(outside);
      act(() => outside.focus());

      await change({ ...waiting, approvals: [] });

      expect(document.activeElement).toBe(outside);
      expect(root.querySelector("h1")).not.toBe(document.activeElement);
      outside.remove();
    });
  });
});
