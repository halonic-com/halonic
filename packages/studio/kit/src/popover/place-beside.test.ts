import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { placeBeside } from "./place-popover.ts";

const view = { width: 800, height: 600 };
const tooltip = { width: 60, height: 24 };
const leftToRight = { gap: 4, rightToLeft: false };
const rightToLeft = { gap: 4, rightToLeft: true };

/** A 40px rail button whose top left corner is at `left`, `top`. */
function railButton(left: number, top: number) {
  return { left, top, right: left + 40, bottom: top + 40 };
}

verifies("kit.tooltip-beside", () => {
  it("sits 4px after the control, its middle level with the control's", () => {
    // The button ends at 52; its middle is at 74, so the 24px tooltip starts at 62.
    expect(placeBeside(railButton(12, 54), tooltip, view, leftToRight)).toEqual({
      top: 62,
      left: 56,
    });
  });

  it("sits 4px before the control right to left", () => {
    expect(placeBeside(railButton(748, 54), tooltip, view, rightToLeft).left).toBe(684);
  });

  it("goes on the other side when it doesn't fit after the control", () => {
    expect(placeBeside(railButton(748, 54), tooltip, view, leftToRight).left).toBe(684);
    expect(placeBeside(railButton(12, 54), tooltip, view, rightToLeft).left).toBe(56);
  });

  it("keeps 8px from the window's edges and lands on whole pixels", () => {
    expect(placeBeside(railButton(12, 0), tooltip, view, leftToRight).top).toBe(8);
    expect(placeBeside(railButton(12, 580), tooltip, view, leftToRight).top).toBe(568);
    const odd = { width: 60, height: 23 };
    expect(placeBeside(railButton(12, 54), odd, view, leftToRight).top).toBe(63);
  });
});
