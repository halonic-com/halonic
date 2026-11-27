// @vitest-environment jsdom

import type { MessagingProject } from "@halonicjs/ports";
import { TOOLTIP_DELAY_MS } from "@halonicjs/studio-kit";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { projectColour } from "../agent/project-colour.ts";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";

afterEach(() => {
  unmountAll();
  vi.useRealTimers();
  Reflect.deleteProperty(HTMLElement.prototype, "showPopover");
  Reflect.deleteProperty(HTMLElement.prototype, "hidePopover");
});

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function rows(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('[role="grid"] tr')];
}

/** The row's line under its title, the project's tooltip left out. */
function rowLine(row: HTMLElement | undefined): string {
  const copy = row?.cloneNode(true) as HTMLElement | undefined;
  for (const tip of copy?.querySelectorAll('[role="tooltip"]') ?? []) tip.remove();
  return copy?.textContent ?? "";
}

const studioApp = { id: "p-studio", name: "Studio app" };

/** Questions from Chief and Noah, each in a project or none, listed at 10:02. */
async function inboxWith(items: readonly { question: string; project?: MessagingProject }[]) {
  const messaging = new FakeAgentMessaging({ now: () => new Date(2026, 10, 24, 10, 0) });
  const source = messaging.addSource({ label: "Paperclip · Acme" });
  items.forEach((item, index) => {
    const name = index % 2 === 0 ? "Chief" : "Noah";
    const agent = messaging.addAgent(source.id, { name });
    messaging.addInboxItem(source.id, {
      question: item.question,
      from: { kind: "agent", agent: agent.id, name },
      ...(item.project === undefined ? {} : { project: item.project }),
    });
  });
  const root = render(
    <InboxView
      inbox={new Inbox(fakeRuns([]).runs)}
      now={() => new Date(2026, 10, 24, 10, 2)}
      agentMessaging={messaging}
    />,
  );
  await settled();
  return root;
}

/** Chief asks twice in the Studio app project, so the two cards make one bundle. */
async function chiefBundle() {
  const messaging = new FakeAgentMessaging({ now: () => new Date(2026, 10, 24, 10, 0) });
  const source = messaging.addSource({ label: "Paperclip · Acme" });
  const agent = messaging.addAgent(source.id, { name: "Chief" });
  const from = { kind: "agent" as const, agent: agent.id, name: "Chief" };
  messaging.addInboxItem(source.id, {
    question: "Ship the phone build?",
    from,
    project: studioApp,
  });
  messaging.addInboxItem(source.id, { question: "Which button size?", from, project: studioApp });
  const root = render(
    <InboxView
      inbox={new Inbox(fakeRuns([]).runs)}
      now={() => new Date(2026, 10, 24, 10, 2)}
      agentMessaging={messaging}
    />,
  );
  await settled();
  return root;
}

async function openFirstRow(root: HTMLElement): Promise<Element | null> {
  await act(async () => rows(root)[0]?.querySelector<HTMLElement>('[role="gridcell"]')?.click());
  await settled();
  return root.querySelector('[data-pane="item"] header h2 + p');
}

verifies("inbox.project-dot", () => {
  it("leads an item's row line with its project's dot and name", async () => {
    const root = await inboxWith([
      { question: "Send preview.98 to the phone?", project: studioApp },
    ]);
    const [row] = rows(root);
    expect(rowLine(row).replace(/\s/g, " ")).toContain(
      "Studio app · Paperclip · Acme · Chief · Waiting 2 min",
    );
    const dot = row?.querySelector(`.${projectColour("p-studio")}`);
    expect(dot?.getAttribute("aria-hidden")).toBe("true");
    expect(dot?.className).toContain("forced-colors:bg-[CanvasText]");
    expect(dot?.nextElementSibling?.className).toContain("truncate");
  });

  it("shows the whole name in the open item's header, uncut", async () => {
    const root = await inboxWith([
      { question: "Send preview.98 to the phone?", project: studioApp },
    ]);
    await act(async () => rows(root)[0]?.querySelector<HTMLElement>('[role="gridcell"]')?.click());
    await settled();
    const line = root.querySelector('[data-pane="item"] header h2 + p');
    expect(line?.textContent).toMatch(/^Studio app · /);
    expect(line?.querySelector(`.${projectColour("p-studio")}`)).not.toBeNull();
    expect(line?.querySelector(".truncate")).toBeNull();
  });

  it("shows a cut name whole in a tooltip on hover, and an uncut one none", async () => {
    const shown = vi.fn();
    HTMLElement.prototype.showPopover = shown;
    HTMLElement.prototype.hidePopover = () => undefined;
    const root = await inboxWith([
      { question: "Send preview.98?", project: { id: "p-web", name: "Halonic marketing website" } },
    ]);
    const name = [...(rows(root)[0]?.querySelectorAll<HTMLElement>(".truncate") ?? [])].find(
      (each) => each.textContent === "Halonic marketing website",
    );
    const tag = name?.parentElement;
    if (name === undefined || tag === null || tag === undefined) {
      throw new Error("no project name in the row");
    }
    const tip = rows(root)[0]?.querySelector('[role="tooltip"]');
    expect(tip?.textContent).toBe("Halonic marketing website");
    expect(tip?.getAttribute("aria-hidden")).toBe("true");
    const hover = () => {
      vi.useFakeTimers();
      act(() => {
        tag.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
        vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
      });
      act(() => tag.dispatchEvent(new MouseEvent("pointerout", { bubbles: true })));
      vi.useRealTimers();
    };
    hover();
    expect(shown).not.toHaveBeenCalled();
    Object.defineProperty(name, "scrollWidth", { configurable: true, value: 240 });
    Object.defineProperty(name, "clientWidth", { configurable: true, value: 144 });
    hover();
    expect(shown).toHaveBeenCalledTimes(1);
  });

  it("gives two items in one project one colour, and an item with no project no dot", async () => {
    const root = await inboxWith([
      { question: "Ship the phone build?", project: studioApp },
      { question: "Which button size?", project: studioApp },
      { question: "Send the weekly digest?" },
    ]);
    const colour = `.${projectColour("p-studio")}`;
    const rowOf = (question: string) => rows(root).find((row) => rowLine(row).includes(question));
    const first = rowOf("Ship the phone build?");
    const second = rowOf("Which button size?");
    const third = rowOf("Send the weekly digest?");
    expect(first?.querySelector(colour)).not.toBeNull();
    expect(second?.querySelector(colour)).not.toBeNull();
    expect(third?.querySelector('[class*="bg-series-"]')).toBeNull();
    expect(rowLine(third)).toContain("Paperclip · Acme · Chief");
  });

  it("marks a hidden character in the project's name, in the row and in the header", async () => {
    const rightToLeft = String.fromCodePoint(0x202e);
    const tricky = { id: "p-tricky", name: `Studio${rightToLeft}app` };
    const root = await inboxWith([{ question: "Send preview.98 to the phone?", project: tricky }]);
    expect(rowLine(rows(root)[0])).toContain("Studio⟦U+202E⟧app · Paperclip · Acme");
    expect(rowLine(rows(root)[0])).not.toContain(rightToLeft);
    const line = await openFirstRow(root);
    expect(line?.textContent).toMatch(/^Studio⟦U\+202E⟧app · /);
    expect(line?.textContent).not.toContain(rightToLeft);
  });

  it("leads a bundle's row and, once open, its header with the project's dot and name", async () => {
    const root = await chiefBundle();
    const [row] = rows(root);
    expect(rows(root)).toHaveLength(1);
    expect(rowLine(row)).toContain("2 cards from Chief");
    expect(rowLine(row).replace(/\s/g, " ")).toContain("Studio app · Paperclip · Acme");
    const colour = `.${projectColour("p-studio")}`;
    expect(row?.querySelector(colour)?.nextElementSibling?.className).toContain("truncate");

    const line = await openFirstRow(root);
    expect(line?.textContent).toMatch(/^Studio app · /);
    expect(line?.querySelector(colour)).not.toBeNull();
    expect(line?.querySelector(".truncate")).toBeNull();
  });
});

describe("projectColour", () => {
  it("picks one of four fixed colours from the ID alone, none violet, amber, azure or rose", () => {
    const ids = Array.from({ length: 60 }, (_, index) => `project-${index}`);
    const picked = new Set(ids.map(projectColour));
    expect(picked.size).toBe(4);
    expect(picked).not.toContain("bg-series-2");
    expect(projectColour("p-studio")).toBe(projectColour("p-studio"));
    for (const colour of picked) expect(colour).not.toMatch(/warning|attention|running/);
  });
});
