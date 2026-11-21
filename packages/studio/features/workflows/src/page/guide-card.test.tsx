// @vitest-environment jsdom

import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WorkflowGuide, WorkflowGuideCard, WorkflowRef } from "../api.ts";
import { buttonNamed, memoryHost, memoryRuns, show, unmount } from "../test-support.tsx";
import { reply, settings } from "./page-fixtures.ts";
import { WorkflowScreen } from "./workflow-page.tsx";

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

const firstRunCard: WorkflowGuideCard = {
  title: "Your first run",
  lines: [
    { text: "This is Acme, an example company." },
    { label: "The email:", text: "Sam writes that an order arrived damaged." },
  ],
  action: { label: "Run your first workflow", run: (page) => page.openRunForm() },
};

/** A guide that gives `card` for Support reply only, and can change it. */
function guideFor(card: WorkflowGuideCard | undefined) {
  let now = card;
  const listeners = new Set<() => void>();
  const guide: WorkflowGuide = {
    card: (workflow: WorkflowRef) => (workflow.id === "reply" ? now : undefined),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    guide,
    change: (next: WorkflowGuideCard | undefined) => {
      now = next;
      for (const listener of listeners) listener();
    },
  };
}

function screen(guide: WorkflowGuide) {
  const { host } = memoryHost([], [], [reply], [settings], {
    startRun: async () => ({ runId: "run_mfx3k2a1_01jd8q" }),
  });
  return (
    <WorkflowScreen host={host} runs={memoryRuns().source} hubId="acme" id="reply" guide={guide} />
  );
}

const guideCardOf = (page: HTMLElement) => page.querySelector<HTMLElement>("[data-guide-card]");

verifies("workflows.guide-card", () => {
  it("shows the guide's card at the right of the canvas, named by its title, with no ✕", async () => {
    const page = await show(screen(guideFor(firstRunCard).guide));
    const card = guideCardOf(page);
    expect(card?.tagName).toBe("ASIDE");
    expect(card?.getAttribute("aria-labelledby")).toBe(card?.querySelector("h2")?.id);
    expect(card?.querySelector("h2")?.textContent).toBe("Your first run");
    expect(card?.textContent).toContain("The email: Sam writes that an order arrived damaged.");
    expect(card?.querySelector("[aria-label=Close]")).toBeNull();
    // At the right: after the canvas's panel, in the same row.
    const panel = page.querySelector("[role=tabpanel]") as HTMLElement;
    expect(panel.parentElement).toBe(card?.parentElement);
  });

  it("opens the Run form from the button, and the card goes while the form is docked", async () => {
    const page = await show(screen(guideFor(firstRunCard).guide));
    await act(async () => buttonNamed(page, "Run your first workflow")?.click());
    expect(page.textContent).toContain("START A RUN");
    expect(guideCardOf(page)).toBeNull();
  });

  it("shows no card on Configuration", async () => {
    const page = await show(screen(guideFor(firstRunCard).guide));
    const configuration = [...page.querySelectorAll("[role=tab]")].find((tab) =>
      tab.textContent?.startsWith("Configuration"),
    ) as HTMLElement;
    await act(async () => configuration.click());
    expect(guideCardOf(page)).toBeNull();
  });

  it("reads the card again when the guide changes it, and shows none when it gives none", async () => {
    const { guide, change } = guideFor(firstRunCard);
    const page = await show(screen(guide));
    act(() => change({ ...firstRunCard, action: { ...firstRunCard.action, label: "Run again" } }));
    expect(buttonNamed(page, "Run again")).toBeDefined();
    act(() => change(undefined));
    expect(guideCardOf(page)).toBeNull();
  });

  it("puts the card above the canvas on a phone", async () => {
    const page = await show(
      <PresentationProvider presentation="phone">
        {screen(guideFor(firstRunCard).guide)}
      </PresentationProvider>,
    );
    const card = guideCardOf(page) as HTMLElement;
    const panel = page.querySelector("[role=tabpanel]") as HTMLElement;
    expect(card.compareDocumentPosition(panel)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(card.parentElement).not.toBe(panel.parentElement);
  });
});
