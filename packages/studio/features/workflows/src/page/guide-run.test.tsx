// @vitest-environment jsdom

import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WorkflowGuide, WorkflowGuideRun } from "../api.ts";
import {
  buttonNamed,
  memoryHost,
  memoryRuns,
  runSummary,
  show,
  unmount,
} from "../test-support.tsx";
import { reply, settings } from "./page-fixtures.ts";
import { WorkflowScreen } from "./workflow-page.tsx";

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

const changedLine = "Changed 1 line in models.yaml: Agents now use Anthropic.";
const caption = "Each box is an agent or a rule. You can change all of it later: it's plain files.";

/** A guide that adds `additions` to the run 01jd8q only. */
function guideAdding(additions: WorkflowGuideRun): WorkflowGuide {
  return {
    card: () => undefined,
    run: (_workflow, runId) => (runId === "run_mfx3k2a1_01jd8q" ? additions : undefined),
    subscribe: () => () => {},
  };
}

const startRun = async () => ({ runId: "run_mfx3k2a1_01jd8q" });

/**
 * Support reply's page, with run 01jd8q started from its Run form and listed as `status`, drawn
 * for a phone when `phone` is set.
 */
async function pageWithRun(
  guide: WorkflowGuide | undefined,
  status: "running" | "failed",
  phone = false,
) {
  const runs = memoryRuns();
  const { host } = memoryHost([], [], [reply], [settings], { startRun });
  const screen = (
    <WorkflowScreen host={host} runs={runs.source} hubId="acme" id="reply" guide={guide} />
  );
  const page = await show(
    phone ? <PresentationProvider presentation="phone">{screen}</PresentationProvider> : screen,
  );
  await act(async () => exactButton(page, "Run")?.click());
  await act(async () => buttonNamed(page, "Start run")?.click());
  await act(async () =>
    runs.change([
      runSummary(
        status === "failed"
          ? { status, state: "start", reason: "error", endedAt: "2026-11-21T09:01:00.000Z" }
          : { status, state: "start" },
      ),
    ]),
  );
  return page;
}

/** The button whose words are exactly `text`: the page's own Run, not the Runs tab. */
const exactButton = (root: HTMLElement, text: string) =>
  [...root.querySelectorAll("button")].find((button) => button.textContent?.trim() === text);

const cardOf = (page: HTMLElement) =>
  page.querySelector<HTMLElement>("aside[aria-label='Run 01jd8q']");

verifies("workflows.page.guide-run", () => {
  it("shows the guide's notes under the run card's status, and its caption under the drawing", async () => {
    const page = await pageWithRun(guideAdding({ notes: [changedLine], caption }), "running");
    expect(cardOf(page)?.textContent).toContain(changedLine);
    expect(page.textContent).toContain(caption);
    expect(cardOf(page)?.textContent).not.toContain(caption);
  });

  it("shows the caption in the run card after the notes on a phone, where the card covers the drawing", async () => {
    const page = await pageWithRun(guideAdding({ notes: [changedLine], caption }), "running", true);
    const lines = [...(cardOf(page)?.querySelectorAll("p") ?? [])].map((line) => line.textContent);
    expect(lines.indexOf(caption)).toBeGreaterThan(lines.indexOf(changedLine));
    expect(lines.indexOf(changedLine)).toBeGreaterThanOrEqual(0);
    expect(page.textContent?.split(caption)).toHaveLength(2);
  });

  // The run's log is empty here, so there is no input to try again with: the runs feature's
  // tests cover Try again beside it (`runs.run-view.guided-run`).
  it("offers Pick another model on the card of a failed run", async () => {
    const pickAnotherModel = vi.fn();
    const page = await pageWithRun(guideAdding({ notes: [], pickAnotherModel }), "failed");
    const card = cardOf(page);
    await act(async () =>
      (card === null ? undefined : buttonNamed(card, "Pick another model"))?.click(),
    );
    expect(pickAnotherModel).toHaveBeenCalledOnce();
  });

  it("closes the run's card when the guide takes the run off the page, so its card shows", async () => {
    let additions: WorkflowGuideRun = { notes: [] };
    const listeners = new Set<() => void>();
    const guide: WorkflowGuide = {
      card: () => ({
        title: "Your first run",
        lines: [],
        action: { label: "Run again", run: () => {} },
      }),
      run: () => additions,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const page = await pageWithRun(guide, "running");
    expect(cardOf(page)).not.toBeNull();
    await act(async () => {
      additions = { notes: [], dismissed: true };
      for (const listener of listeners) listener();
    });
    expect(cardOf(page)).toBeNull();
    expect(page.querySelector("[data-guide-card]")?.textContent).toContain("Run again");
  });

  it("shows the run as it always does without a guide", async () => {
    const page = await pageWithRun(undefined, "failed");
    expect(page.textContent).not.toContain(caption);
    const card = cardOf(page);
    expect(card === null ? undefined : buttonNamed(card, "Pick another model")).toBeUndefined();
  });
});
