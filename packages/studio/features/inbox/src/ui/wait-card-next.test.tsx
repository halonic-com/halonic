// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { unmountAll } from "../test-support/render.tsx";
import { button, openCard, press } from "./wait-card.test-helper.tsx";

afterEach(unmountAll);

verifies("inbox.wait-card", () => {
  describe("Next, once answered", () => {
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
