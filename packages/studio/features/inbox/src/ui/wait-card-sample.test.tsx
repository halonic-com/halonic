// @vitest-environment jsdom

import type { RunEvent, RunSummary } from "@halonicjs/events";
import { RunsList, type RunsSource } from "@halonicjs/studio-feature-runs/api";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import { waitingRun } from "../test-runs.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";
import { openCard } from "./wait-card.test-helper.tsx";

afterEach(unmountAll);

const review = waitingRun("r2", { waitingFor: { title: "Approve this reply?", body: "" } });

/** The log of `r2`: one call to `provider`, the run waiting. */
function calling(provider: string): RunEvent[] {
  return [
    {
      type: "llm.request",
      agent: "drafter",
      provider,
      model: "m",
      messages: 1,
      runId: "r2",
      seq: 1,
      at: review.startedAt,
    },
  ];
}

/** A Runs source with `r2`, whose provider `mock` is the test model and `claude` isn't. */
function runsSource(log: { current: RunEvent[] }): RunsSource {
  const summaries: readonly RunSummary[] = [review];
  return {
    list: async () => summaries.map((summary) => ({ summary })),
    log: async () => log.current,
    workflow: () => ({ name: "Support reply", stepDescription: () => undefined }),
    routine: () => undefined,
    runnableWorkflows: async () => [],
    providerKind: (id) => (id === "claude" ? "cloud" : "local"),
    isTestModel: (id) => id === "mock",
    currency: () => "EUR",
    monthlyBudget: () => undefined,
    subscribe: () => () => {},
  };
}

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function openReview(source: RunsSource) {
  const root = render(
    <InboxView inbox={new Inbox(fakeRuns([review]).runs)} runs={new RunsList(source)} />,
  );
  await settled();
  const row = root.querySelector<HTMLElement>('[role="grid"] tr [role="gridcell"]');
  await act(async () => row?.click());
  await settled();
  return root;
}

verifies("runs.sample-chip", () => {
  it("shows Sample answers above the title of a wait card whose run used the test model", async () => {
    const root = await openReview(runsSource({ current: calling("mock") }));

    const card = root.querySelector("section");
    const chip = [...(card?.querySelectorAll("span") ?? [])].find(
      (span) => span.textContent === "Sample answers",
    );
    expect(chip).toBeDefined();
    const title = card?.querySelector("h2");
    expect(title?.textContent).toBe("Approve this reply?");
    if (chip === undefined || title == null) return;
    // Before the title in the card's order: above it.
    expect(chip.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("reads the run again each time its card opens, and shows no chip for a real model", async () => {
    const log = { current: calling("claude") };
    const source = runsSource(log);
    const read = vi.spyOn(source, "log");

    const root = await openReview(source);
    expect(root.querySelector("section")?.textContent).not.toContain("Sample answers");
    unmountAll();
    log.current = calling("mock");
    const again = await openReview(source);

    expect(again.querySelector("section")?.textContent).toContain("Sample answers");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("carries no chip when left out", () => {
    const { root } = openCard();
    expect(root.textContent).not.toContain("Sample answers");
    const sample = openCard({ sample: true });
    expect(sample.root.textContent).toContain("Sample answers");
  });
});
