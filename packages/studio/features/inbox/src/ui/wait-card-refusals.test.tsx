// @vitest-environment jsdom
import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { unmountAll } from "../test-support/render.tsx";
import { button, openCard, press } from "./wait-card.test-helper.tsx";

afterEach(unmountAll);

verifies("inbox.wait-card", () => {
  describe("an answer the window refuses", () => {
    it("says the workspace isn't trusted, with Review and no Try again, when the answer is denied", async () => {
      const review = vi.fn();
      const { root, later } = openCard({
        trust: { review, granted: 0 },
        decisions: {
          answer: async () => {
            throw new KindedError(
              "denied",
              "This workspace isn't trusted yet, so nothing was started.",
            );
          },
        },
      });
      later(2);
      await press(button(root, "Reject"));
      const slot = root.querySelector("[role='alert']") as HTMLElement;
      expect(slot.textContent).toBe(
        "This workspace isn't trusted yet, so Studio can't send your answer.Review",
      );
      const reviewButton = button(slot, "Review");
      await act(async () => reviewButton.click());
      expect(review).toHaveBeenCalledWith(reviewButton);
    });
  });
});
