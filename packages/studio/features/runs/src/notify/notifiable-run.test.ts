import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { teamAppRun, workflowAppRun } from "../app/source-rows.ts";
import { minutesLater, mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { notifiableRun } from "./notifiable-run.ts";

const context = {
  workflow: { name: "Nightly report", stepDescription: () => undefined },
  routine: undefined,
  currency: "EUR",
  now: mondayMorning,
};

function workflowRow(changes: Parameters<typeof summaryWith>[0]) {
  const row = workflowAppRun({ summary: summaryWith(changes) }, context, "Acme Ops");
  if (row === undefined) throw new Error("A workflow run gives a row");
  return row;
}

verifies("runs.run-notifications", () => {
  describe("notifiableRun", () => {
    it("gives a workflow run the person started with Run, with how long it took", () => {
      const run = notifiableRun(
        workflowRow({
          status: "completed",
          endedAt: minutesLater(4),
          trigger: { type: "manual", at: minutesLater(0) },
        }),
      );
      expect(run).toEqual({
        id: "run_mfx3k2a1_01jd8q",
        phase: "succeeded",
        kind: "workflow",
        name: "Nightly report",
        where: "Acme Ops",
        startedAt: minutesLater(0),
        startedByMe: true,
        tookMs: 4 * 60_000,
        cost: { kind: "none" },
      });
    });

    it("counts a run from the Inbox as the person's, and one from a schedule as not", () => {
      const inbox = workflowRow({ trigger: { type: "inbox", at: minutesLater(0) } });
      const schedule = workflowRow({
        trigger: { type: "schedule", at: minutesLater(0), routineId: "acme/nightly" },
      });
      expect(notifiableRun(inbox).startedByMe).toBe(true);
      expect(notifiableRun(schedule).startedByMe).toBe(false);
    });

    it("names the step a workflow run failed in", () => {
      const failed = workflowRow({
        status: "failed",
        state: "fetch",
        endedAt: minutesLater(1),
      });
      expect(notifiableRun(failed)).toMatchObject({ phase: "failed", failedStep: "Fetch" });
    });

    it("gives a team's run the agent's name and task, and never counts it as the person's", () => {
      const run = notifiableRun(
        teamAppRun(
          {
            id: "paperclip:acme:run:1",
            agent: "paperclip:acme:agent:ada",
            task: { id: "t7", identifier: "HAL-18533", title: "Fix the login" },
            state: "failed",
            startedAt: minutesLater(0),
            lastActivityAt: minutesLater(3),
          },
          {
            where: "Paperclip · Acme",
            agent: { name: "Ada", title: "CTO" },
            asOf: minutesLater(5),
          },
        ),
      );
      expect(run).toMatchObject({
        kind: "agent",
        name: "Ada",
        where: "Paperclip · Acme",
        phase: "failed",
        startedByMe: false,
        tookMs: 3 * 60_000,
        task: "HAL-18533",
      });
    });
  });
});
