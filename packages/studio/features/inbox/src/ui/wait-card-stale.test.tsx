// @vitest-environment jsdom
import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { unmountAll } from "../test-support/render.tsx";
import { button, openCard, press, reviewItem } from "./wait-card.test-helper.tsx";

afterEach(unmountAll);

verifies("inbox.wait-card", () => {
  describe("once the run no longer waits", () => {
    it("turns stale: no answers, no waiting time, and says so with Open run", () => {
      const onOpenRun = vi.fn();
      const { root } = openCard({
        onOpenRun,
        waiting: false,
        item: reviewItem({ nextTimer: new Date(2026, 10, 10, 14, 0).toISOString() }),
      });
      const callout = root.querySelector("[role='group']") as HTMLElement;
      expect(callout.textContent).toContain(
        "This is no longer waiting for you. It was answered somewhere else or the run moved on.",
      );
      const labels = [...root.querySelectorAll("button")].map((b) => b.textContent);
      expect(labels).toEqual(["Open run", "Open run"]);
      expect(root.textContent).not.toMatch(/Waiting since|Moves on|Studio can't answer/);
      act(() => button(callout, "Open run").click());
      expect(onOpenRun).toHaveBeenCalledWith("r43");
    });

    it("turns stale while open, after a refusal too, and takes the focus its buttons had", async () => {
      const { root, later, rerender } = openCard({
        decisions: {
          answer: async () => {
            throw new KindedError("unavailable", "Studio can't answer runs yet.", {
              fix: "halonic runs send 7k2m9p approve",
            });
          },
        },
      });
      later(2);
      await press(button(root, "Approve"));
      act(() => button(root, "Approve").focus());
      rerender({ waiting: false });
      const callout = root.querySelector("[role='group']");
      expect(callout?.textContent).toContain("This is no longer waiting for you.");
      expect(document.activeElement).toBe(callout);
      expect(root.textContent).not.toMatch(
        /Approve(?! this)|Reject|Studio can't answer|Waiting since/,
      );
    });

    it("keeps what you decided when your own answer takes the run out of the list", async () => {
      const { root, later, rerender } = openCard();
      later(61);
      await press(button(root, "Approve"));
      rerender({ waiting: false });
      expect(root.textContent).toContain("Approved by you at 10:44. The run continues.");
      expect(root.textContent).not.toContain("no longer waiting");
    });
  });
});
