import { verifies } from "@halonicjs/testing-spec";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import { describe, expect, test } from "vitest";
import { manifest } from "./manifest.ts";
import { verdictReviewerOf } from "./review-verdict-declaration.ts";
import { runHolds, type VerdictToolApi } from "./review-verdict-tool.ts";

const task = { id: "task-1", identifier: "HAL-1", title: "Review", description: null };
const caller = { reviewer: "liam", agentId: "agent-liam", runId: "run-1" };

/** Paperclip's issues as far as the run check reads them: the checkout's answer and the task's live runs. */
function issues(
  owner: { checkoutRunId: string | null } | Error,
  runs: { id: string; status: string }[],
): Pick<VerdictToolApi, "issues"> {
  return {
    issues: {
      assertCheckoutOwner: async () => {
        if (owner instanceof Error) throw owner;
        return {
          issueId: task.id,
          status: "in_progress",
          assigneeAgentId: caller.agentId,
          adoptedFromRunId: null,
          ...owner,
        };
      },
      getSubtree: async () => ({
        rootIssueId: task.id,
        companyId: "acme",
        issueIds: [task.id],
        issues: [],
        activeRuns: { [task.id]: runs.map((run) => ({ ...run, issueId: task.id })) },
      }),
    } as unknown as VerdictToolApi["issues"],
  };
}

verifies("paperclip.review-verdict", () => {
  describe("runHolds", () => {
    test("passes a run that holds the checkout and is running", async () => {
      const ctx = issues({ checkoutRunId: "run-1" }, [{ id: "run-1", status: "running" }]);
      expect(await runHolds(ctx, "acme", task, caller)).toBe(undefined);
    });

    test("refuses when Paperclip refuses the checkout, as for a finished run", async () => {
      const ctx = issues(new Error("Issue run ownership conflict"), [
        { id: "run-1", status: "running" },
      ]);
      expect(await runHolds(ctx, "acme", task, caller)).toBe(
        "your run doesn't hold HAL-1: it must be in progress with you, checked out by this run (Issue run ownership conflict).",
      );
    });

    test("refuses a checkout held by no run, or another", async () => {
      const ctx = issues({ checkoutRunId: null }, [{ id: "run-1", status: "running" }]);
      expect(await runHolds(ctx, "acme", task, caller)).toMatch(/^your run doesn't hold HAL-1/);
    });

    test("refuses a run that isn't among the task's running runs, as a kept checkout of a finished run", async () => {
      const queued = issues({ checkoutRunId: "run-1" }, [{ id: "run-1", status: "queued" }]);
      expect(await runHolds(queued, "acme", task, caller)).toBe(
        "your run isn't one of HAL-1's running runs.",
      );
      const gone = issues({ checkoutRunId: "run-1" }, [{ id: "run-2", status: "running" }]);
      expect(await runHolds(gone, "acme", task, caller)).toBe(
        "your run isn't one of HAL-1's running runs.",
      );
    });
  });

  test("only the agent ids the settings name are reviewers, under a known reviewer's name", () => {
    const config = {
      verdictReviewers: { liam: "agent-liam", julian: "agent-julian", chief: "agent-chief" },
    };
    expect(verdictReviewerOf(config, "agent-liam")).toBe("liam");
    expect(verdictReviewerOf(config, "agent-julian")).toBe("julian");
    expect(verdictReviewerOf(config, "agent-chief")).toBe(undefined);
    expect(verdictReviewerOf({}, "agent-liam")).toBe(undefined);
  });

  test("the tool refuses every call while no reviewer is named", async () => {
    const harness = createTestHarness({ manifest, config: {} });
    const { plugin } = await import("./worker.ts");
    await plugin.definition.setup(harness.ctx);
    const answer = await harness.executeTool("review_verdict", {
      pr: 1,
      task: "HAL-1",
      verdict: "approved",
      head: "a".repeat(40),
    });
    expect(answer).toMatchObject({ error: expect.stringMatching(/^review_verdict: /) });
  });
});
