// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { memoryHost, memoryRuns, show, unmount } from "../test-support.tsx";
import { reply } from "./page-fixtures.ts";
import { WorkflowScreen } from "./workflow-page.tsx";

afterEach(unmount);

// jsdom lays nothing out, so the canvas measures as the 800 × 600 it falls back to, and the zoom
// buttons take its left 56 pixels.
const CANVAS = { left: 56, top: 0, right: 800, bottom: 600 };

const canvasOf = (page: HTMLElement) =>
  page.querySelector<HTMLElement>("[aria-label='Workflow canvas']");
const cards = (page: HTMLElement) => [
  ...page.querySelectorAll<HTMLButtonElement>("button[aria-pressed]"),
];

/** The canvas's zoom and pan, read back from its surface's transform. */
function viewOf(page: HTMLElement) {
  const transform =
    page.querySelector<HTMLElement>("[data-testid=canvas-surface]")?.style.transform ?? "";
  const [x, y, zoom] = (transform.match(/-?[\d.]+/g) ?? []).map(Number);
  return { zoom: zoom ?? 1, pan: { x: x ?? 0, y: y ?? 0 } };
}

/** Where a card shows on screen, its Start chip (8 pixels above it) included when it has one. */
function shownBox(page: HTMLElement, card: HTMLElement, chip: boolean) {
  const { zoom, pan } = viewOf(page);
  const left = Number.parseFloat(card.style.left);
  const top = Number.parseFloat(card.style.top) - (chip ? 8 : 0);
  const right = left + Number.parseFloat(card.style.width);
  const bottom = Number.parseFloat(card.style.top) + Number.parseFloat(card.style.height);
  return {
    left: left * zoom + pan.x,
    top: top * zoom + pan.y,
    right: right * zoom + pan.x,
    bottom: bottom * zoom + pan.y,
  };
}

/** Moves focus to `card` as the Tab key does, so it takes keyboard focus (`:focus-visible`). */
async function tabTo(card: HTMLElement) {
  const from = document.activeElement ?? document.body;
  await act(async () => {
    from.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    card.focus();
  });
}

/** Moves focus to `card` as a press of the mouse does. */
async function clickOn(card: HTMLElement) {
  await act(async () => {
    card.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    card.focus();
  });
}

/** The page at 200 %; `canChangeSteps` docks a picked step's card. */
async function zoomedToTwoHundred({ canChangeSteps = false } = {}) {
  const { host } = memoryHost([], [], [reply], [], {
    ...(canChangeSteps ? { changeStep: async () => {} } : {}),
  });
  const page = await show(
    <WorkflowScreen host={host} runs={memoryRuns().source} hubId="acme" id="reply" />,
  );
  const zoomIn = page.querySelector<HTMLButtonElement>("button[aria-label='Zoom in']");
  for (let press = 0; press < 4; press++) await act(async () => zoomIn?.click());
  expect(viewOf(page).zoom).toBe(2);
  return page;
}

verifies("workflows.canvas.focus-in-view", () => {
  it("pans the first card into view at 200 %, chip and all, and the canvas box doesn't scroll", async () => {
    const page = await zoomedToTwoHundred();
    const [first] = cards(page);
    if (first === undefined) throw new Error("no card");
    expect(shownBox(page, first, true).top).toBeLessThan(CANVAS.top);

    await tabTo(first);

    const box = shownBox(page, first, true);
    expect(box.left).toBeGreaterThanOrEqual(CANVAS.left);
    expect(box.top).toBeGreaterThanOrEqual(CANVAS.top);
    expect(box.right).toBeLessThanOrEqual(CANVAS.right);
    expect(box.bottom).toBeLessThanOrEqual(CANVAS.bottom);
    expect(viewOf(page).zoom).toBe(2);
    const canvas = canvasOf(page);
    expect(canvas?.scrollTop).toBe(0);
    // `overflow: clip` is what keeps a real browser from scrolling the box to the card.
    expect(canvas?.className).toContain("overflow-clip");
  });

  it("pans a card below the view up into it", async () => {
    const page = await zoomedToTwoHundred();
    const last = cards(page).at(-1);
    if (last === undefined) throw new Error("no card");
    expect(shownBox(page, last, false).bottom).toBeGreaterThan(CANVAS.bottom);

    await tabTo(last);

    expect(shownBox(page, last, false).bottom).toBe(CANVAS.bottom - 16);
  });

  it("doesn't move the view for a card that already shows", async () => {
    const page = await zoomedToTwoHundred();
    const middle = cards(page)[1];
    if (middle === undefined) throw new Error("no card");
    const before = viewOf(page);

    await tabTo(middle);

    expect(viewOf(page)).toEqual(before);
  });

  it("doesn't move a card out from under the pointer when it's clicked", async () => {
    const page = await zoomedToTwoHundred();
    const last = cards(page).at(-1);
    if (last === undefined) throw new Error("no card");
    const before = viewOf(page);

    await clickOn(last);

    expect(document.activeElement).toBe(last);
    expect(viewOf(page)).toEqual(before);
  });
});

verifies("workflows.page.step-card", () => {
  it("pans a picked step that's half out of view clear of its docked card, keeping the zoom", async () => {
    const page = await zoomedToTwoHundred({ canChangeSteps: true });
    const last = cards(page).at(-1);
    if (last === undefined) throw new Error("no card");
    expect(shownBox(page, last, false).bottom).toBeGreaterThan(CANVAS.bottom);

    await act(async () => last.click());

    expect(page.querySelector("aside")).not.toBeNull();
    const box = shownBox(page, last, false);
    expect(box.right).toBeLessThanOrEqual(CANVAS.right - 16);
    expect(box.bottom).toBe(CANVAS.bottom - 16);
    expect(viewOf(page).zoom).toBe(2);
  });

  it("doesn't move the view for a picked step that already shows", async () => {
    const page = await zoomedToTwoHundred({ canChangeSteps: true });
    const middle = cards(page)[1];
    if (middle === undefined) throw new Error("no card");
    const before = viewOf(page);

    await act(async () => middle.click());

    expect(page.querySelector("aside")).not.toBeNull();
    expect(viewOf(page)).toEqual(before);
  });

  it("doesn't move the view when no card docks for the picked step", async () => {
    const page = await zoomedToTwoHundred();
    const last = cards(page).at(-1);
    if (last === undefined) throw new Error("no card");
    const before = viewOf(page);

    await act(async () => last.click());

    expect(page.querySelector("aside")).toBeNull();
    expect(viewOf(page)).toEqual(before);
  });
});
