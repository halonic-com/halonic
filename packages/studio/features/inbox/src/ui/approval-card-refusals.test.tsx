// @vitest-environment jsdom
import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitingRun } from "../test-runs.test-helper.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { unmountAll } from "../test-support/render.tsx";
import { button, openCard, press } from "./approval-card.test-helper.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

verifies("inbox.approval-card", () => {
  describe("a decision the window refuses", () => {
    it("says what to close under Try again, not Decided elsewhere, when another engine holds the workspace", async () => {
      let held = true;
      const { root, sent, later } = openCard({
        decisions: {
          approve: async () => {
            sent.push("approve");
            if (held) {
              throw new KindedError(
                "unavailable",
                "Acme is already running in another Halonic on this computer (process 4242). Stop that one, then try again.",
              );
            }
            return waitingRun("r47");
          },
          reject: async () => waitingRun("r47"),
          askForChanges: async () => waitingRun("r47"),
        },
      });
      later(2);
      await press(button(root, "Approve"));
      const slot = root.querySelector("[role='alert']");
      // The reason follows the first sentence and comes before Try again, so the alert reads both
      // sentences first (WCAG 1.3.2).
      expect(slot?.textContent).toBe(
        "Couldn't record your decision. Acme is already running in another Halonic on this computer (process 4242). Stop that one, then try again.Try again",
      );
      expect(root.textContent).not.toContain("This is no longer waiting for you.");
      expect(button(root, "Reject")).toBeDefined();
      held = false;
      await press(button(root, "Try again"));
      expect(sent).toEqual(["approve", "approve"]);
      expect(root.textContent).toContain("Approved by you at");
    });

    it("brings the focused Approve back into view when the failure lines appear above it", async () => {
      const scrolled: { element: Element; options: unknown }[] = [];
      Element.prototype.scrollIntoView = function (this: Element, options?: unknown) {
        scrolled.push({ element: this, options });
      };
      try {
        const { root, later } = openCard({
          decisions: {
            approve: async () => {
              throw new KindedError(
                "unavailable",
                "Acme is already running in another Halonic on this computer (process 4242). Stop that one, then try again.",
              );
            },
            reject: async () => waitingRun("r47"),
            askForChanges: async () => waitingRun("r47"),
          },
        });
        later(2);
        const approve = button(root, "Approve");
        act(() => approve.focus());
        await press(approve);
        expect(document.activeElement).toBe(approve);
        expect(scrolled).toEqual([{ element: approve, options: { block: "nearest" } }]);
      } finally {
        Reflect.deleteProperty(Element.prototype, "scrollIntoView");
      }
    });

    it("says the workspace isn't trusted, with Review and no Try again, when the decision is denied", async () => {
      const review = vi.fn();
      const untrusted = async (): Promise<never> => {
        throw new KindedError(
          "denied",
          "This workspace isn't trusted yet, so nothing was started.",
        );
      };
      const { root, later } = openCard({
        decisions: { approve: untrusted, reject: untrusted, askForChanges: untrusted },
        trust: { review, granted: 0 },
      });
      later(2);
      await press(button(root, "Approve"));
      const slot = root.querySelector("[role='alert']");
      expect(slot?.textContent).toBe(
        "This workspace isn't trusted yet, so Studio can't send your answer.Review",
      );
      expect(root.textContent).not.toContain("Try again");
      const reviewButton = button(root, "Review");
      await press(reviewButton);
      expect(review).toHaveBeenCalledWith(reviewButton);
      await press(button(root, "Reject"));
      expect(slot?.textContent).toBe(
        "This workspace isn't trusted yet, so Studio can't send your answer.Review",
      );
    });

    it("gives the untrusted line no Review when the window can't open the trust check", async () => {
      const { root, later } = openCard({
        decisions: {
          approve: async () => {
            throw new KindedError(
              "denied",
              "This workspace isn't trusted yet, so nothing was started.",
            );
          },
          reject: async () => waitingRun("r47"),
          askForChanges: async () => waitingRun("r47"),
        },
      });
      later(2);
      await press(button(root, "Approve"));
      expect(root.querySelector("[role='alert']")?.textContent).toBe(
        "This workspace isn't trusted yet, so Studio can't send your answer.",
      );
    });
  });
});
