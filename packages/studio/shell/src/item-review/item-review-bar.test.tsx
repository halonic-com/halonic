// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { ItemReviewBar, type ItemReviewBarProps } from "./item-review-bar.tsx";
import { positionWithin, steppedPosition } from "./review-position.ts";

afterEach(unmountAll);

/** The bar for `count` changes on `position`, with the positions its steps asked for. */
function bar(props: Partial<ItemReviewBarProps> & { readonly count: number }) {
  const steps: number[] = [];
  const container = render(
    <ItemReviewBar
      position={0}
      onStep={(position) => steps.push(position)}
      onAcceptAll={() => {}}
      onRejectAll={() => {}}
      {...props}
    />,
  );
  const button = (name: string) =>
    [...container.querySelectorAll("button")].find((each) => each.textContent === name);
  const press = (name: string) => act(() => button(name)?.click());
  return { container, steps, button, press };
}

describe("ItemReviewBar", () => {
  verifies("shell.item-review-bar", () => {
    it("says how many things the assistant changed, where the steps are, and offers both decisions", () => {
      const { container, button } = bar({ count: 3 });
      const region = container.querySelector("section");
      expect(region?.getAttribute("aria-label")).toBe("Changes to review");
      expect(region?.textContent).toContain("The assistant changed 3 things here");
      const live = container.querySelector('[aria-live="polite"]');
      expect(live?.querySelector('[aria-hidden="true"]')?.textContent).toBe("1 of 3");
      expect(live?.querySelector(".sr-only")?.textContent).toBe("Change 1 of 3");
      for (const name of ["Previous", "Next", "Accept all", "Reject all"]) {
        expect(button(name)).toBeDefined();
      }
    });

    it("wraps Next from the last change to the first, and Previous from the first to the last", () => {
      const last = bar({ count: 3, position: 2 });
      last.press("Next");
      expect(last.steps).toEqual([0]);
      unmountAll();
      const first = bar({ count: 3, position: 0 });
      first.press("Previous");
      expect(first.steps).toEqual([2]);
      expect(first.button("Previous")?.getAttribute("aria-disabled")).toBeNull();
    });

    it("shows no count, Previous or Next with one change", () => {
      const { container, button } = bar({ count: 1 });
      expect(container.textContent).toContain("The assistant changed 1 thing here");
      expect(container.querySelector('[aria-live="polite"]')).toBeNull();
      expect(button("Previous")).toBeUndefined();
      expect(button("Next")).toBeUndefined();
      expect(button("Accept all")).toBeDefined();
    });

    it("shows nothing without changes to review", () => {
      expect(bar({ count: 0 }).container.innerHTML).toBe("");
    });

    it("offers Compare in place of the decisions while the file changed outside Halonic", () => {
      let compared = 0;
      const { container, button, press } = bar({
        count: 2,
        heldOutside: { onCompare: () => compared++ },
      });
      expect(container.textContent).toContain("Changed outside Halonic");
      expect(button("Accept all")).toBeUndefined();
      expect(button("Reject all")).toBeUndefined();
      press("Compare");
      expect(compared).toBe(1);
    });

    it("keeps the position after a decision, or moves it to the last change", () => {
      expect(positionWithin(2, 2)).toBe(1);
      expect(positionWithin(1, 2)).toBe(1);
      expect(positionWithin(0, 0)).toBe(0);
      expect(steppedPosition(1, 3, "next")).toBe(2);
      expect(steppedPosition(0, 0, "next")).toBe(0);
    });
  });
});
