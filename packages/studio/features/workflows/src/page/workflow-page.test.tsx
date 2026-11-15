// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WorkflowView } from "../api.ts";
import { buttonNamed, memoryHost, show, unmount } from "../test-support.tsx";
import { WorkflowScreen } from "./workflow-page.tsx";

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

const reply: WorkflowView = {
  hubId: "acme",
  id: "reply",
  name: "Support reply",
  initial: "start",
  steps: [
    { id: "start", type: "task" },
    { id: "write", type: "task", agent: "writer" },
    { id: "done", type: "final" },
  ],
  arrows: [
    { from: "start", to: "write" },
    { from: "write", to: "done", label: "ok" },
  ],
  layout: {},
};

const surface = (page: HTMLElement) =>
  page.querySelector<HTMLElement>("[data-testid=canvas-surface]");

verifies("workflows.page.frame-and-states", () => {
  it("shows the name and the cards at once, with no skeleton and no ⤢ or ✕", async () => {
    const { host } = memoryHost([], [], [reply]);
    const page = await show(<WorkflowScreen host={host} hubId="acme" id="reply" />);

    expect(page.querySelector("h1")?.textContent).toBe("Support reply");
    expect(page.textContent).toContain("WORKFLOW");
    expect(page.querySelector("[role=status]")).toBeNull();
    expect(page.querySelector("[aria-label*=ximise], [aria-label=Close]")).toBeNull();
  });

  it("shows a skeleton only after 300 ms, and Still loading after 10 s", async () => {
    const { host } = memoryHost([], [], [reply]);
    const slow = { ...host, read: () => new Promise<WorkflowView>(() => {}) };
    const page = await show(<WorkflowScreen host={slow} hubId="acme" id="reply" />);
    expect(page.querySelector("[role=status]")).toBeNull();

    await act(async () => vi.advanceTimersByTime(300));
    expect(page.querySelector("[role=status]")?.textContent).toContain("Loading reply");
    expect(page.textContent).not.toContain("Still loading");

    await act(async () => vi.advanceTimersByTime(10_000));
    expect(page.textContent).toContain("Still loading");
    expect(buttonNamed(page, "Try again")).toBeDefined();
  });

  it("says why it couldn't load, and Try again reads again", async () => {
    let calls = 0;
    const { host } = memoryHost([], [], [reply]);
    const failing = {
      ...host,
      read: async (ref: { hubId: string; id: string }) => {
        calls += 1;
        if (calls === 1) throw new Error("The engine isn't answering. It may still be starting.");
        return host.read(ref);
      },
    };
    const page = await show(<WorkflowScreen host={failing} hubId="acme" id="reply" />);
    expect(page.textContent).toContain("Couldn't load this workflow");
    expect(page.textContent).toContain("The engine isn't answering. It may still be starting.");

    await act(async () => buttonNamed(page, "Try again")?.click());
    expect(page.querySelector("h1")?.textContent).toBe("Support reply");
  });

  it("keeps the zoom when the workflow changes under it", async () => {
    let current = reply;
    let tell = () => {};
    const { host } = memoryHost([], [], [reply]);
    const changing = {
      ...host,
      read: async () => current,
      subscribe: (listener: () => void) => {
        tell = listener;
        return () => {};
      },
    };
    const page = await show(<WorkflowScreen host={changing} hubId="acme" id="reply" />);
    await act(async () => buttonNamed(page, "Zoom in")?.click());
    const zoomed = surface(page)?.style.transform;

    current = { ...reply, steps: [...reply.steps, { id: "extra", type: "task" }] };
    await act(async () => tell());
    expect(page.querySelectorAll("button[aria-pressed]")).toHaveLength(4);
    expect(surface(page)?.style.transform).toBe(zoomed);
  });

  it("keeps the canvas when a refresh fails", async () => {
    let failing = false;
    let tell = () => {};
    const { host } = memoryHost([], [], [reply]);
    const flaky = {
      ...host,
      read: async () => {
        if (failing) throw new Error("The engine isn't answering. It may still be starting.");
        return reply;
      },
      subscribe: (listener: () => void) => {
        tell = listener;
        return () => {};
      },
    };
    const page = await show(<WorkflowScreen host={flaky} hubId="acme" id="reply" />);
    await act(async () => buttonNamed(page, "Zoom in")?.click());
    const zoomed = surface(page)?.style.transform;

    failing = true;
    await act(async () => tell());
    expect(page.textContent).not.toContain("Couldn't load this workflow");
    expect(surface(page)?.style.transform).toBe(zoomed);
  });
});

verifies("workflows.page.step-cards", () => {
  it("draws a card per step with its kind, id, agent and the Start mark, and an arrow per way on", async () => {
    const { host } = memoryHost([], [], [reply]);
    const page = await show(<WorkflowScreen host={host} hubId="acme" id="reply" />);
    const cards = [...page.querySelectorAll("button[aria-pressed]")].map((card) =>
      card.textContent?.replace(/\s+/g, " "),
    );

    expect(cards).toEqual(["AGENT STEPstartStartNo agent", "AGENT STEPwritewriter", "ENDdone"]);
    expect(page.querySelectorAll("svg path")).toHaveLength(2);
    expect(page.querySelector("svg text")?.textContent).toBe("ok");
  });

  it("selects the pressed card and moves the selection to the next", async () => {
    const { host } = memoryHost([], [], [reply]);
    const page = await show(<WorkflowScreen host={host} hubId="acme" id="reply" />);
    const card = (index: number) =>
      page.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")[index];

    await act(async () => card(0)?.click());
    expect(card(0)?.getAttribute("aria-pressed")).toBe("true");
    await act(async () => card(1)?.click());
    expect(card(0)?.getAttribute("aria-pressed")).toBe("false");
    expect(card(1)?.getAttribute("aria-pressed")).toBe("true");
  });

  it("fits all steps again on Fit to screen", async () => {
    const { host } = memoryHost([], [], [reply]);
    const page = await show(<WorkflowScreen host={host} hubId="acme" id="reply" />);
    const fitted = surface(page)?.style.transform;

    await act(async () => buttonNamed(page, "Zoom in")?.click());
    expect(surface(page)?.style.transform).not.toBe(fitted);
    await act(async () => buttonNamed(page, "Fit to screen")?.click());
    expect(surface(page)?.style.transform).toBe(fitted);
  });
});
