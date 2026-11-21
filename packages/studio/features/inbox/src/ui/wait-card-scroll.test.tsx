// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { unmountAll } from "../test-support/render.tsx";
import { button, openCard, press } from "./wait-card.test-helper.tsx";

afterEach(unmountAll);

verifies("inbox.wait-card", () => {
  describe("once answered, in a window that scrolls", () => {
    it("brings the answered line and what follows it into view, in a short window too (HAL-13918)", async () => {
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      try {
        const { root, later } = openCard();
        later(2);
        await press(button(root, "Approve"));
        const bar = root.querySelector("[role='group']")?.parentElement;
        expect(bar?.textContent).toContain("Nothing else is waiting for you.");
        expect(scrollIntoView.mock.contexts).toEqual([bar]);
        expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
      } finally {
        delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
      }
    });

    it("closes cleanly when scrollIntoView returns a promise, as it does in Chromium (HAL-13918)", async () => {
      // React keeps whatever an effect returns as its clean-up, and a promise isn't a function.
      Element.prototype.scrollIntoView = () => Promise.resolve();
      try {
        const { root, later } = openCard();
        later(2);
        await press(button(root, "Approve"));
        expect(root.querySelector("[role='group']")).not.toBeNull();
        expect(unmountAll).not.toThrow();
      } finally {
        delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
      }
    });

    it("opens the next card at its top, whichever element scrolls (HAL-13975)", async () => {
      // A short window: the column around the card scrolls, down to where the decided bar was.
      let scrollWhenOpened: number | undefined;
      const open = vi.fn(() => {
        scrollWhenOpened = root.scrollTop;
      });
      const { root, later } = openCard({ next: { title: "Approve this reply?", left: 2, open } });
      root.style.overflowY = "auto";
      later(2);
      await press(button(root, "Approve"));
      root.scrollTop = 337;
      await press(button(root, "Next"));
      expect(open).toHaveBeenCalledOnce();
      expect(scrollWhenOpened).toBe(0);
    });
  });
});
