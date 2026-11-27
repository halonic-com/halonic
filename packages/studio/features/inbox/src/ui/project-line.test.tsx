// @vitest-environment jsdom

import type { MessagingProject } from "@halonicjs/ports";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { projectColour } from "../agent/project-colour.ts";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";
import { chipsThatFit } from "./project-line-fit.ts";

const offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");

/**
 * A 330px line whose every chip is 100px wide; jsdom lays nothing out, so with no gap between
 * chips "All" and one project fit, with room kept for "+N".
 */
beforeEach(() => {
  HTMLElement.prototype.showPopover = () => undefined;
  HTMLElement.prototype.hidePopover = () => undefined;
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: () => 100,
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get(this: HTMLElement) {
      return this.tagName === "FIELDSET" ? 330 : 0;
    },
  });
});

afterEach(() => {
  unmountAll();
  Reflect.deleteProperty(HTMLElement.prototype, "showPopover");
  Reflect.deleteProperty(HTMLElement.prototype, "hidePopover");
  Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
  if (offsetWidth !== undefined) {
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", offsetWidth);
  }
});

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const studio = { id: "p-studio", name: "Studio app" };
const engine = { id: "p-engine", name: "Engine" };
const website = { id: "p-web", name: "Halonic marketing website" };

/** Two Studio app questions, one each in Engine and the website, and one with no project. */
async function inboxWithProjects() {
  const messaging = new FakeAgentMessaging({ now: () => new Date(2026, 10, 24, 10, 0) });
  const source = messaging.addSource({ label: "Paperclip · Acme" });
  const add = (question: string, project?: MessagingProject) =>
    messaging.addInboxItem(source.id, project === undefined ? { question } : { question, project });
  add("Ship the phone build?", studio);
  add("Which button size?", studio);
  add("Retry the nightly job?", engine);
  add("Publish the new home page?", website);
  add("Send the weekly digest?");
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

function line(root: HTMLElement): HTMLButtonElement[] {
  return [...root.querySelectorAll<HTMLButtonElement>('fieldset[aria-label="Project"] > button')];
}

function names(root: HTMLElement): string[] {
  return line(root).map((chip) => chip.getAttribute("aria-label") ?? chip.textContent ?? "");
}

/** The "+N" menu's choices: their words, with ✓ on the picked one. */
function menu(root: HTMLElement): string[] {
  return [...root.querySelectorAll<HTMLElement>("[role=menuitemradio]")].map(
    (entry) => `${entry.getAttribute("aria-checked") === "true" ? "✓ " : ""}${entry.textContent}`,
  );
}

async function press(target: HTMLElement | undefined) {
  if (target === undefined) throw new Error("nothing to press");
  await act(async () => target.click());
  await settled();
}

function rowCount(root: HTMLElement): number {
  return root.querySelectorAll('[role="grid"] tr').length;
}

verifies("inbox.project-line", () => {
  it("shows All, the projects that fit, then +N for the rest, most items first", async () => {
    const root = await inboxWithProjects();
    expect(names(root)).toEqual(["All projects, 5", "Studio app", "+3 more projects"]);
    expect(line(root).map((chip) => chip.getAttribute("aria-pressed"))).toEqual([
      "true",
      "false",
      null,
    ]);
    expect(line(root)[1]?.querySelector(`.${projectColour("p-studio")}`)).not.toBeNull();
  });

  it("lists every choice in +N's menu with its count, the picked one ticked", async () => {
    const root = await inboxWithProjects();
    expect(menu(root)).toEqual([
      "✓ All projects5",
      "Studio app2",
      "Engine1",
      "Halonic marketing website1",
      "No project1",
    ]);
  });

  it("shows a project picked from +N alone after All, with the rest under +N", async () => {
    const root = await inboxWithProjects();
    const entry = [...root.querySelectorAll<HTMLElement>("[role=menuitemradio]")].find((each) =>
      each.textContent?.startsWith("Halonic marketing website"),
    );
    await press(entry);
    expect(names(root)).toEqual(["All projects", "Halonic marketing website", "+3 more projects"]);
    const picked = line(root)[1];
    expect(picked?.getAttribute("aria-pressed")).toBe("true");
    expect(picked?.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
    expect(picked?.querySelector(".truncate")).not.toBeNull();
    expect(rowCount(root)).toBe(1);
    expect(menu(root)).toContain("✓ Halonic marketing website1");
  });

  it("goes back to all when the picked chip is pressed again", async () => {
    const root = await inboxWithProjects();
    await press(line(root)[1]);
    expect(names(root)).toEqual(["All projects", "Studio app", "+3 more projects"]);
    expect(rowCount(root)).toBe(2);
    await press(line(root)[1]);
    expect(names(root)).toEqual(["All projects, 5", "Studio app", "+3 more projects"]);
    expect(rowCount(root)).toBe(5);
  });

  it("measures again when the chips' widths change, as when the web font arrives", async () => {
    const observed = new Map<Element, () => void>();
    globalThis.ResizeObserver = class {
      readonly #measure: ResizeObserverCallback;
      constructor(measure: ResizeObserverCallback) {
        this.#measure = measure;
      }
      observe(target: Element) {
        observed.set(target, () => this.#measure([], this));
      }
      unobserve() {}
      disconnect() {}
    };
    try {
      const root = await inboxWithProjects();
      expect(names(root)).toEqual(["All projects, 5", "Studio app", "+3 more projects"]);
      Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
        configurable: true,
        get: () => 60,
      });
      const copy = root.querySelector('div.invisible[aria-hidden="true"]');
      await act(async () => observed.get(copy ?? root)?.());
      expect(names(root)).toEqual([
        "All projects, 5",
        "Studio app",
        "Engine",
        "Halonic marketing website",
        "No project",
      ]);
    } finally {
      Reflect.deleteProperty(globalThis, "ResizeObserver");
    }
  });
});

describe("chipsThatFit", () => {
  it("keeps room for +N while any chip is left over, and fits all on an unmeasured line", () => {
    const widths = { first: 50, more: 40, gap: 8 };
    expect(chipsThatFit({ ...widths, room: 328, chips: [100, 100, 100] })).toBe(2);
    expect(chipsThatFit({ ...widths, room: 328, chips: [100, 100] })).toBe(2);
    expect(chipsThatFit({ ...widths, room: 150, chips: [100, 100] })).toBe(0);
    expect(chipsThatFit({ ...widths, room: 0, chips: [100, 100, 100] })).toBe(3);
  });
});
