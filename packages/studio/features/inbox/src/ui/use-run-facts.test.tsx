// @vitest-environment jsdom
import type { RunSummary } from "@halonicjs/events";
import { type RunRoutine, RunsList, type RunsSource } from "@halonicjs/studio-feature-runs/api";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { waitingRun } from "../test-runs.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { useRunFacts } from "./use-run-facts.ts";

afterEach(unmountAll);

const weeklyReport: RunRoutine = { name: "Weekly report", schedule: "Mondays at 09:00" };

/** A Runs list over these runs, whose one routine is `reports/weekly-report`, Weekly report. */
function listOf(runs: readonly RunSummary[]): RunsList {
  const source: RunsSource = {
    list: async () => runs.map((summary) => ({ summary })),
    log: async () => [],
    workflow: () => ({ name: "Support reply", stepDescription: () => undefined }),
    routine: (key) => (key === "reports/weekly-report" ? weeklyReport : undefined),
    runnableWorkflows: async () => [],
    providerKind: () => undefined,
    currency: () => "EUR",
    monthlyBudget: () => undefined,
    subscribe: () => () => {},
  };
  return new RunsList(source);
}

function StartedBy({ list, runId }: { list: RunsList; runId: string }) {
  return <p>{useRunFacts(list)?.(runId)?.startedBy}</p>;
}

/** What the Inbox says started the run `r1`, once the list has read it. */
async function startedByOf(trigger: RunSummary["trigger"]): Promise<string | undefined> {
  const list = listOf([waitingRun("r1", { trigger })]);
  const root = render(<StartedBy list={list} runId="r1" />);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return root.textContent ?? undefined;
}

const at = "2026-11-18T10:40:00.000Z";

verifies("inbox.wait-card", () => {
  describe("what started the run", () => {
    it("names the routine whose Run now started it, as the Runs list does (HAL-12406)", async () => {
      expect(await startedByOf({ type: "manual", at, routineId: "reports/weekly-report" })).toBe(
        "the Weekly report routine, with Run now",
      );
    });

    it("says a routine once the routine is gone", async () => {
      expect(await startedByOf({ type: "manual", at, routineId: "reports/gone" })).toBe(
        "a routine, with Run now",
      );
    });

    it("says you for Run on a workflow's page", async () => {
      expect(await startedByOf({ type: "manual", at })).toBe("you, with Run");
    });
  });
});
