// @vitest-environment jsdom

import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WorkflowGuide, WorkflowGuideCard, WorkflowRef, WorkflowsHost } from "../api.ts";
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

const firstRunCard: WorkflowGuideCard = {
  title: "Your first run",
  lines: [
    { text: "This is Acme, an example company." },
    { label: "The email", text: "Sam writes that an order arrived damaged." },
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

const startRun = async () => ({ runId: "run_mfx3k2a1_01jd8q" });

function screen(
  guide: WorkflowGuide,
  overrides: Partial<WorkflowsHost> = { startRun },
  runs = memoryRuns(),
) {
  const { host } = memoryHost([], [], [reply], [settings], overrides);
  return <WorkflowScreen host={host} runs={runs.source} hubId="acme" id="reply" guide={guide} />;
}

const press = (button: HTMLButtonElement | null | undefined) =>
  act(async () => {
    button?.click();
  });

/** The page's own Run, not the guide's "Run your first workflow". */
const runButtonOf = (page: HTMLElement) =>
  [...page.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Run");

const guideCardOf = (page: HTMLElement) => page.querySelector<HTMLElement>("[data-guide-card]");

verifies("workflows.page.guide-card", () => {
  it("shows the guide's card at the right of the canvas, named by its title, with no ✕", async () => {
    const page = await show(screen(guideFor(firstRunCard).guide));
    const card = guideCardOf(page);
    expect(card?.tagName).toBe("ASIDE");
    expect(card?.getAttribute("aria-labelledby")).toBe(card?.querySelector("h2")?.id);
    expect(card?.querySelector("h2")?.textContent).toBe("Your first run");
    expect(card?.querySelector("[aria-label=Close]")).toBeNull();
    // Sheet 05: its own border and corners, as tall as its content, the title over a divider.
    expect(card?.className).toContain("rounded-md");
    expect(card?.className).toContain("self-start");
    // A card as the kit's, not a popup: `surface`, and a gap from the canvas on every side.
    expect(card?.className.split(" ")).toContain("bg-surface");
    expect(card?.className.split(" ")).toContain("m-4");
    expect(card?.className).not.toContain("ms-0");
    expect(card?.querySelector("h2")?.className).toContain("border-b");
    expect(card?.querySelector("h2")?.className).toContain("text-section");
    // At the right: after the canvas's panel, in the same row.
    const panel = page.querySelector("[data-workflow-view]") as HTMLElement;
    expect(panel.parentElement).toBe(card?.parentElement);
  });

  it("shows a labelled line as a quote, the label small above the text", async () => {
    const page = await show(screen(guideFor(firstRunCard).guide));
    const quote = [...(guideCardOf(page)?.querySelectorAll("div") ?? [])].find((box) =>
      box.className.includes("border-s-2"),
    );
    expect([...(quote?.children ?? [])].map((line) => line.textContent)).toEqual([
      "The email",
      "Sam writes that an order arrived damaged.",
    ]);
    expect(quote?.firstElementChild?.className).toContain("text-caption");
    // Square on the bar's side, so the bar stays straight.
    expect(quote?.className).toContain("rounded-e-sm");
  });

  it("draws the button full width with a ›, or with the refresh mark when it runs again", async () => {
    const { guide, change } = guideFor(firstRunCard);
    const page = await show(screen(guide));
    const first = buttonNamed(page, "Run your first workflow") as HTMLButtonElement;
    expect(first.className).toContain("w-full");
    expect(first.className).toContain("min-h-control-lg");
    expect(first.lastElementChild?.getAttribute("aria-hidden")).toBe("true");
    expect(first.querySelectorAll("svg")).toHaveLength(1);
    const chevron = first.querySelector("svg")?.outerHTML;
    act(() =>
      change({
        ...firstRunCard,
        action: { ...firstRunCard.action, label: "Run again", again: true },
      }),
    );
    const again = buttonNamed(page, "Run again") as HTMLButtonElement;
    expect(again.className).toContain("w-full");
    expect(again.querySelectorAll("svg")).toHaveLength(1);
    expect(again.querySelector("svg")?.outerHTML).not.toBe(chevron);
    expect(again.textContent?.trim()).toBe("Run again");
  });

  it("opens the Run form from the button, and the card goes while the form is docked", async () => {
    const page = await show(screen(guideFor(firstRunCard).guide));
    await act(async () => buttonNamed(page, "Run your first workflow")?.click());
    expect(page.textContent).toContain("START A RUN");
    expect(guideCardOf(page)).toBeNull();
  });

  it("doesn't open the Run form while the files refuse the run, as Run doesn't", async () => {
    const refusal = {
      reason: "Reporter uses a connector, which Studio can't start yet.",
      fix: "To start it, run this in a terminal:",
      command: "halonic run reply",
    };
    const page = await show(
      screen(guideFor(firstRunCard).guide, { startRun, startRefusal: async () => refusal }),
    );
    await press(buttonNamed(page, "Run your first workflow"));
    expect(page.textContent).not.toContain("START A RUN");
    expect(guideCardOf(page)).not.toBeNull();
  });

  it("doesn't open the Run form on a page that has no Run", async () => {
    const page = await show(screen(guideFor(firstRunCard).guide, {}));
    await press(buttonNamed(page, "Run your first workflow"));
    expect(page.textContent).not.toContain("START A RUN");
  });

  it("is gone while a run's card is docked", async () => {
    const runs = memoryRuns();
    const page = await show(screen(guideFor(firstRunCard).guide, { startRun }, runs));
    await press(buttonNamed(page, "Run your first workflow"));
    await press(buttonNamed(page, "Start run"));
    await act(async () => runs.change([runSummary({ status: "running", state: "start" })]));
    expect(page.querySelector("aside[aria-label='Run 01jd8q']")).not.toBeNull();
    expect(guideCardOf(page)).toBeNull();
  });

  it("is gone while a picked step's card is docked", async () => {
    const page = await show(
      screen(guideFor(firstRunCard).guide, { startRun, changeStep: async () => {} }),
    );
    const write = [...page.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find(
      (card) => card.querySelector("[title]")?.textContent === "write",
    );
    await press(write);
    expect(page.querySelector("aside h2")?.textContent).toBe("write");
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

  it("shows no card, and says why, when the guide fails to give one", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const guide: WorkflowGuide = {
      card: () => {
        throw new Error("The first run's state can't be read.");
      },
      subscribe: () => () => {},
    };
    const page = await show(screen(guide));
    expect(guideCardOf(page)).toBeNull();
    expect(runButtonOf(page)).toBeDefined();
    expect(error).toHaveBeenCalledWith(
      'The guide couldn\'t give a card for "reply".',
      expect.any(Error),
    );
    error.mockRestore();
  });

  it("puts the card above the canvas on a phone", async () => {
    const page = await show(
      <PresentationProvider presentation="phone">
        {screen(guideFor(firstRunCard).guide)}
      </PresentationProvider>,
    );
    const card = guideCardOf(page) as HTMLElement;
    const panel = page.querySelector("[data-workflow-view]") as HTMLElement;
    expect(card.compareDocumentPosition(panel)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(card.parentElement).not.toBe(panel.parentElement);
  });
});

verifies("workflows.page.guide-card-focus", () => {
  it("gives focus back to the guide's button when the Run form it opened closes", async () => {
    const page = await show(screen(guideFor(firstRunCard).guide));
    await press(buttonNamed(page, "Run your first workflow"));
    await press(buttonNamed(page, "Cancel"));
    expect(guideCardOf(page)).not.toBeNull();
    expect(document.activeElement).toBe(buttonNamed(page, "Run your first workflow"));
  });

  it("gives focus back to Run when the guide card doesn't come back", async () => {
    const { guide, change } = guideFor(firstRunCard);
    const page = await show(screen(guide));
    await press(buttonNamed(page, "Run your first workflow"));
    act(() => change(undefined));
    await press(buttonNamed(page, "Cancel"));
    expect(document.activeElement).toBe(runButtonOf(page));
  });

  it("gives focus back to Run when Run opened the form", async () => {
    const page = await show(screen(guideFor(firstRunCard).guide));
    await press(runButtonOf(page));
    await press(buttonNamed(page, "Cancel"));
    expect(document.activeElement).toBe(runButtonOf(page));
  });
});

verifies("workflows.page.guide-card-first", () => {
  it("puts the card before the canvas's cards in Tab order, still drawn at the canvas's right", async () => {
    const page = await show(screen(guideFor(firstRunCard).guide));
    const button = buttonNamed(page, "Run your first workflow");
    const firstStep = page.querySelector("[data-step]");
    expect(firstStep).not.toBeNull();
    const after = firstStep === null ? 0 : (button?.compareDocumentPosition(firstStep) ?? 0);
    expect(after & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(guideCardOf(page)?.className.split(" ")).toContain("order-last");
  });
});
