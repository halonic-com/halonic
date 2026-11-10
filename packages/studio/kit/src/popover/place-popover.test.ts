// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { place, placePopover } from "./place-popover.ts";

const view = { width: 800, height: 600 };
const menu = { width: 200, height: 150 };
const below = { gap: 4, align: "start" } as const;

/** A 32px button whose top left corner is at `left`, `top`. */
function button(left: number, top: number, width = 32) {
  return { left, top, right: left + width, bottom: top + 32 };
}

verifies("kit.popover-position", () => {
  it("goes below the trigger, lined up with its left edge, or its right edge with end", () => {
    expect(place(button(100, 100), menu, view, below)).toEqual({
      top: 136,
      left: 100,
      maxHeight: undefined,
      side: "below",
    });
    expect(place(button(300, 100), menu, view, { gap: 4, align: "end" }).left).toBe(132);
  });

  it("flips above when it doesn't fit below", () => {
    expect(place(button(100, 500), menu, view, below)).toMatchObject({ top: 346, side: "above" });
  });

  it("flips to the other side when it doesn't fit next to the asked edge", () => {
    // Lined up left it would end at 870; lined up right it starts at 582.
    expect(place(button(670, 100, 112), menu, view, below).left).toBe(582);
    expect(place(button(20, 100), menu, view, { gap: 4, align: "end" }).left).toBe(20);
  });

  it("centres it under the trigger with center, still keeping 8px from the edges", () => {
    const centred = { gap: 4, align: "center" } as const;
    // The button's centre is at 116, so the 200px popover starts at 16.
    expect(place(button(100, 100), menu, view, centred)).toEqual({
      top: 136,
      left: 16,
      maxHeight: undefined,
      side: "below",
    });
    expect(place(button(10, 100), menu, view, centred).left).toBe(8);
    expect(place(button(770, 100), menu, view, centred).left).toBe(592);
    expect(place(button(100, 500), menu, view, centred)).toMatchObject({ top: 346, left: 16 });
  });

  it("keeps 8px from the window's edges when neither side fits", () => {
    const narrow = { width: 220, height: 600 };
    expect(place(button(100, 100), menu, narrow, below).left).toBe(12);
    expect(place(button(2, 100), { width: 300, height: 150 }, narrow, below).left).toBe(8);
  });

  it("takes the side with more room and scrolls inside it when it fits on neither", () => {
    const tall = { width: 200, height: 500 };
    expect(place(button(100, 200), tall, view, below)).toEqual({
      top: 236,
      left: 100,
      maxHeight: 356,
      side: "below",
    });
    expect(place(button(100, 400), tall, view, below)).toEqual({
      top: 8,
      left: 100,
      maxHeight: 388,
      side: "above",
    });
  });

  it("writes the place on the popover's style", () => {
    const trigger = document.createElement("button");
    const popover = document.createElement("div");
    trigger.getBoundingClientRect = () => DOMRect.fromRect({ x: 40, y: 50, width: 32, height: 32 });
    popover.getBoundingClientRect = () => DOMRect.fromRect({ width: 180, height: 120 });
    // jsdom lays nothing out, so the root's client size is 0 unless a test sets it.
    const root = document.documentElement;
    Object.defineProperty(root, "clientWidth", { configurable: true, value: 800 });
    Object.defineProperty(root, "clientHeight", { configurable: true, value: 600 });
    placePopover(popover, trigger, below);
    expect(popover.style.top).toBe("86px");
    expect(popover.style.left).toBe("40px");
    expect(popover.style.maxHeight).toBe("");
    expect(popover.dataset["side"]).toBe("below");
    Reflect.deleteProperty(root, "clientWidth");
    Reflect.deleteProperty(root, "clientHeight");
  });
});
