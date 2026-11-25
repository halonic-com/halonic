import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { minutesLater, mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { type TeamRunFields, teamAppRun, workflowAppRun } from "./source-rows.ts";

const workflowContext = {
  workflow: { name: "Support reply", stepDescription: () => undefined },
  routine: undefined,
  currency: "EUR",
  now: mondayMorning,
};

function agentRun(changes: Partial<TeamRunFields> = {}): TeamRunFields {
  return {
    id: "paperclip:acme:run:1",
    agent: "paperclip:acme:agent:ada",
    task: { id: "paperclip:acme:task:7", identifier: "ACME-7", title: "Fix the login" },
    state: "running",
    startedAt: minutesLater(0),
    ...changes,
  };
}

const ada = { name: "Ada", title: "CTO" };
const teamContext = { where: "Paperclip · Acme", agent: ada, asOf: minutesLater(5) };

verifies("runs.app-sources", () => {
  describe("workflowAppRun", () => {
    it("gives a workspace run's row in the Runs page's words, with its estimated cost", () => {
      const row = workflowAppRun(
        { summary: summaryWith({ status: "completed", cost: 0.04, endedAt: minutesLater(2) }) },
        workflowContext,
        "Acme Ops",
      );
      expect(row).toMatchObject({
        id: "run_mfx3k2a1_01jd8q",
        phase: "succeeded",
        lineage: "acme/support-reply",
        cost: { kind: "money", currency: "EUR", minorUnits: 4 },
        title: "Support reply",
        where: "Acme Ops",
        by: { kind: "workflow" },
        chip: { word: "Done", tone: "success" },
        item: { kind: "run", hub: "acme", id: "run_mfx3k2a1_01jd8q" },
      });
      expect(row?.label).toMatch(/^Run 01jd8q, Support reply, .*\.$/);
    });

    it("leaves test runs out, and gives no cost for a run that cost nothing", () => {
      const test = summaryWith({ kind: "test" });
      expect(workflowAppRun({ summary: test }, workflowContext, "Acme Ops")).toBeUndefined();
      const free = workflowAppRun({ summary: summaryWith({}) }, workflowContext, "Acme Ops");
      expect(free?.cost).toEqual({ kind: "none" });
    });
  });

  describe("teamAppRun", () => {
    it("names the agent with its role, the task and the team", () => {
      expect(teamAppRun(agentRun(), teamContext)).toEqual({
        id: "paperclip:acme:run:1",
        phase: "running",
        startedAt: minutesLater(0),
        lineage: "paperclip:acme:task:7",
        cost: { kind: "none" },
        title: "Ada · CTO",
        line: "ACME-7 Fix the login",
        where: "Paperclip · Acme",
        by: { kind: "agent", name: "Ada" },
        chip: { word: "Running", tone: "running" },
        label: "Running, Ada · CTO, ACME-7 Fix the login, Paperclip · Acme.",
      });
    });

    it("gives each state its chip and its group", () => {
      const looks = (
        ["queued", "succeeded", "failed", "timed-out", "cancelled", "interrupted"] as const
      ).map((state) => {
        const row = teamAppRun(agentRun({ state }), teamContext);
        return [state, row.chip.word, row.chip.tone, row.phase];
      });
      expect(looks).toEqual([
        ["queued", "Queued", "neutral", "running"],
        ["succeeded", "Done", "success", "succeeded"],
        ["failed", "Failed", "danger", "failed"],
        ["timed-out", "Failed", "danger", "failed"],
        ["cancelled", "Stopped", "neutral", "stopped"],
        ["interrupted", "Stopped", "neutral", "stopped"],
      ]);
    });

    it("says what it can of an agent, a task or a start the team didn't give", () => {
      const queued = teamAppRun(
        { id: "q", agent: "paperclip:acme:agent:x", task: { id: "t" }, state: "queued" },
        { ...teamContext, agent: undefined },
      );
      expect(queued).toMatchObject({
        title: "An agent",
        line: "Not on a task",
        startedAt: minutesLater(5),
        lineage: "t",
      });
      const noRole = teamAppRun(
        {
          id: "paperclip:acme:run:1",
          agent: "paperclip:acme:agent:ada",
          state: "running",
          lastActivityAt: minutesLater(1),
        },
        { ...teamContext, agent: { name: "Ada" } },
      );
      expect(noRole).toMatchObject({
        title: "Ada",
        line: "Not on a task",
        startedAt: minutesLater(1),
        lineage: "paperclip:acme:run:1",
      });
      const untitled = teamAppRun(
        agentRun({ task: { id: "t", identifier: "ACME-8" } }),
        teamContext,
      );
      expect(untitled.line).toBe("ACME-8");
    });

    it("costs what the team paid, else its tokens, else nothing", () => {
      const tokens = { input: 900, cached: 200, output: 100 };
      const paid = teamAppRun(
        agentRun({ paid: { cents: 12, currency: "USD" }, tokens }),
        teamContext,
      );
      expect(paid.cost).toEqual({ kind: "money", currency: "USD", minorUnits: 12 });
      const subscription = teamAppRun(
        agentRun({ paid: { cents: 0, currency: "USD" }, tokens }),
        teamContext,
      );
      expect(subscription.cost).toEqual({ kind: "tokens", tokens: 1200 });
      const none = { input: 0, cached: 0, output: 0 };
      expect(teamAppRun(agentRun({ tokens: none }), teamContext).cost).toEqual({ kind: "none" });
    });
  });
});
