// @vitest-environment jsdom
import type { RunEventBody, RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { runRow } from "../list/run-row.ts";
import { entered, logOf } from "../run-view/run-log.test-helper.ts";
import { RunsList } from "../runs-list.ts";
import { fakeSource } from "../source.test-helper.ts";
import { approvalAt, mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { sampleCandidates } from "./day-list.tsx";
import { RunsView } from "./runs-page.tsx";

afterEach(unmountAll);

const onSample = summaryWith({ id: "run_a_5a5a5a", approvals: [approvalAt(1)] });
const onClaude = summaryWith({ id: "run_b_c1c1c1", status: "completed" });
const sampleTest = summaryWith({ id: "run_c_t0t0t0", kind: "test", status: "completed" });
const runningOnSample = summaryWith({ id: "run_d_r0r0r0", state: "draft" });

function calling(summary: RunSummary, provider: string) {
  const call: RunEventBody = {
    type: "llm.request",
    agent: "drafter",
    provider,
    model: "a-model",
    messages: 1,
  };
  return logOf(summary.id, [
    [0, entered("draft")],
    [0, call],
  ]);
}

async function openPage(summaries: readonly RunSummary[], provider: Record<string, string>) {
  const logs = Object.fromEntries(
    summaries.map((summary) => [summary.id, calling(summary, provider[summary.id] ?? "mock")]),
  );
  const root = render(
    <RunsView list={new RunsList(fakeSource(summaries, logs).source)} now={() => mondayMorning} />,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return root;
}

/** The row whose sentence names `shortId`. */
function rowOf(root: HTMLElement, shortId: string): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>('[role="grid"] tr')].find((row) =>
    row.querySelector(".sr-only")?.textContent?.includes(shortId),
  );
}

verifies("runs.sample-chip", () => {
  it("puts the chip on the row of a run on Sample answers, and says it at the end of its sentence", async () => {
    const root = await openPage([onSample, onClaude], { [onClaude.id]: "claude" });

    const sample = rowOf(root, "5a5a5a");
    expect(sample?.textContent).toContain("Sample answers");
    expect(sample?.querySelector(".sr-only")?.textContent).toMatch(/, on Sample answers\.$/);
    expect(rowOf(root, "c1c1c1")?.textContent).not.toContain("Sample answers");
  });

  it("gives a running run no chip yet", async () => {
    const root = await openPage([runningOnSample], {});

    expect(rowOf(root, "r0r0r0")?.textContent).not.toContain("Sample answers");
  });

  it("never reads a test case's run, which keeps its Test tag alone", () => {
    const context = {
      workflow: undefined,
      routine: undefined,
      currency: "EUR",
      now: mondayMorning,
    };
    const rows = [onSample, sampleTest, runningOnSample].map((summary) =>
      runRow({ summary }, context),
    );

    expect(sampleCandidates(rows)).toEqual([onSample.id]);
  });
});
