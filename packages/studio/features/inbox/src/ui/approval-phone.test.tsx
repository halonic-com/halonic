// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { waitingRun } from "../test-runs.test-helper.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { unmountAll } from "../test-support/render.tsx";
import { button, openCard, press } from "./approval-card.test-helper.tsx";
import * as wait from "./wait-card.test-helper.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

verifies("inbox.approval-phone", () => {
  describe("on a phone", () => {
    it("says the approval was sent, not that the run continues", async () => {
      const { root, later } = openCard({}, "phone");
      later(61);
      await press(button(root, "Approve"));
      const callout = root.querySelector("[role='group']");
      expect(callout?.textContent).toContain("Approved by you at 10:44. Approval sent.");
      expect(root.textContent).not.toContain("The run continues.");
    });

    it("says the approval was sent after a wait step's approve, in the step's own word", async () => {
      const { root, sent, later } = wait.openCard(
        { item: { ...wait.reviewItem(), answerLabels: { approve: "Send reply" } } },
        "phone",
      );
      later(61);
      await wait.press(wait.button(root, "Send reply"));
      expect(sent).toEqual(["approve"]);
      expect(root.querySelector("[role='group']")?.textContent).toContain(
        "You chose Send reply at 10:44. Approval sent.",
      );
      expect(root.textContent).not.toContain("The run continues.");
    });

    it("points at Open run when the card shows it and nothing else waits (HAL-19480)", async () => {
      const { root, later } = openCard({}, "phone");
      later(61);
      await press(button(root, "Approve"));
      const line = nothingElseLine(root);
      expect(line?.textContent).toBe(
        "Nothing else is waiting for you. Open the run to see what it did.",
      );
      expect(line?.parentElement?.className).toContain("justify-start");
    });

    it("says to look in Studio on your computer when the card has no Open run (HAL-19399 G14)", async () => {
      const { root, later } = openCard({ onOpenRun: undefined }, "phone");
      later(61);
      await press(button(root, "Approve"));
      expect(nothingElseLine(root)?.textContent).toBe(
        "Nothing else is waiting for you. See what it did in Studio on your computer.",
      );
    });

    it("still says the run finished when the approve finished it", async () => {
      const { root, later } = openCard(
        {
          decisions: {
            approve: async () => waitingRun("r47", { status: "completed" }),
            reject: async () => waitingRun("r47"),
            askForChanges: async () => waitingRun("r47"),
          },
        },
        "phone",
      );
      later(61);
      await press(button(root, "Approve"));
      expect(root.querySelector("[role='group']")?.textContent).toContain(
        "Approved by you at 10:44. The run finished.",
      );
    });
  });

  it("says nothing of Studio on your computer on the computer", async () => {
    const { root, later } = openCard();
    later(61);
    await press(button(root, "Approve"));
    expect(root.textContent).toContain("Nothing else is waiting for you.");
    expect(root.textContent).not.toContain("See what it did");
    expect(root.textContent).not.toContain("Open the run");
  });
});

function nothingElseLine(root: HTMLElement) {
  return [...root.querySelectorAll("p")].find((each) =>
    each.textContent?.startsWith("Nothing else is waiting for you."),
  );
}
