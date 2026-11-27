// @vitest-environment jsdom

import { NarrowProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import { waitingRun } from "../test-runs.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";

afterEach(unmountAll);

// Local times, so the test reads the same in every time zone. Sun 8 Nov 2026.
const at = (minute: number) => new Date(2026, 10, 8, 9, minute).toISOString();

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Three runs that wait, listed newest first: "Third?", "Second?", "First?". */
async function threeWaiting(narrow = false): Promise<HTMLElement> {
  const runs = ["First?", "Second?", "Third?"].map((title, index) =>
    waitingRun(`r${index + 1}`, { lastWaitingAt: at(index * 10), waitingFor: { title, body: "" } }),
  );
  const root = render(
    <NarrowProvider narrow={narrow}>
      <InboxView inbox={new Inbox(fakeRuns(runs).runs)} now={() => new Date(2026, 10, 8, 10, 0)} />
    </NarrowProvider>,
  );
  await settled();
  return root;
}

async function openRow(root: HTMLElement, index: number): Promise<void> {
  const cells = root.querySelectorAll<HTMLElement>('[role="grid"] [role="gridcell"]');
  await act(async () => cells[index]?.click());
  await settled();
}

function stepButton(root: HTMLElement, name: string): HTMLButtonElement | undefined {
  return [...root.querySelectorAll<HTMLButtonElement>('[data-pane="item"] header button')].find(
    (button) => button.getAttribute("aria-label") === name,
  );
}

/** The open item's title and its place, "2 of 3". */
function header(root: HTMLElement): string[] {
  const head = root.querySelector('[data-pane="item"] header');
  return [
    head?.querySelector("h2")?.textContent ?? "",
    head?.querySelector("p.shrink-0")?.textContent ?? "",
  ];
}

async function press(key: string, target: EventTarget = document.body): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
  await settled();
}

verifies("inbox.item-steps", () => {
  it("opens the item after the open one with Next item, and names the keys", async () => {
    const root = await threeWaiting();
    await openRow(root, 1);
    expect(header(root)).toEqual(["Second?", "2 of 3"]);
    const next = stepButton(root, "Next item");
    expect(next?.getAttribute("aria-keyshortcuts")).toBe("J");
    expect(stepButton(root, "Previous item")?.getAttribute("aria-keyshortcuts")).toBe("K");
    await act(async () => next?.click());
    await settled();
    expect(header(root)).toEqual(["First?", "3 of 3"]);
    expect(stepButton(root, "Previous item")?.closest(".invisible")).toBeNull();
    expect(stepButton(root, "Next item")?.closest(".invisible")).not.toBeNull();
  });

  it("steps with K and J, and hides the step past the first item", async () => {
    const root = await threeWaiting();
    await openRow(root, 0);
    expect(header(root)).toEqual(["Third?", "1 of 3"]);
    expect(stepButton(root, "Previous item")?.closest(".invisible")).not.toBeNull();
    await press("k");
    expect(header(root)).toEqual(["Third?", "1 of 3"]);
    await press("j");
    expect(header(root)).toEqual(["Second?", "2 of 3"]);
    await press("k");
    expect(header(root)).toEqual(["Third?", "1 of 3"]);
  });

  it("leaves a J typed into a field, or with Ctrl held, alone", async () => {
    const root = await threeWaiting();
    await openRow(root, 0);
    const field = document.createElement("textarea");
    root.append(field);
    await press("j", field);
    expect(header(root)).toEqual(["Third?", "1 of 3"]);
    await act(async () => {
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", { key: "j", ctrlKey: true, bubbles: true }),
      );
    });
    expect(header(root)).toEqual(["Third?", "1 of 3"]);
  });

  it("leaves the up and down buttons out at one pane, so the title keeps its room", async () => {
    const root = await threeWaiting(true);
    await openRow(root, 1);
    expect(header(root)).toEqual(["Second?", "2 of 3"]);
    expect(stepButton(root, "Back to Inbox")).toBeDefined();
    expect(stepButton(root, "Next item")).toBeUndefined();
    expect(stepButton(root, "Previous item")).toBeUndefined();
    await press("j");
    expect(header(root)).toEqual(["First?", "3 of 3"]);
  });
});
