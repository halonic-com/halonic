// @vitest-environment jsdom
import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { unmountAll } from "../test-support/render.tsx";
import * as approval from "./approval-card.test-helper.tsx";
import * as wait from "./wait-card.test-helper.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

/** Answers that fail one at a time, when the test says so, as a retryable refusal. */
function failingAnswers() {
  const pending: ((error: Error) => void)[] = [];
  return {
    send: () => new Promise<never>((_resolve, reject) => pending.push(reject)),
    async fail() {
      await act(async () => pending.shift()?.(new KindedError("unavailable", "Acme is busy.")));
    },
  };
}

/** Presses **Try again** as the keyboard does: focus it, then a click with no press before it. */
async function retryWithKeyboard(root: HTMLElement, find: typeof approval.button) {
  const slot = root.querySelector("[role='alert']") as HTMLElement;
  const retry = find(slot, "Try again");
  act(() => retry.focus());
  await act(async () => retry.click());
}

verifies("inbox.retry-focus", () => {
  describe("Try again on the approval card", () => {
    it("moves focus to the busy Approve and keeps it there when the decision fails again", async () => {
      const answers = failingAnswers();
      const { root, later } = approval.openCard({
        decisions: { approve: answers.send, reject: answers.send, askForChanges: answers.send },
      });
      later(2);
      const approve = approval.button(root, "Approve");
      await approval.press(approve);
      await answers.fail();

      await retryWithKeyboard(root, approval.button);
      expect(document.activeElement).toBe(approve);
      expect(approve.getAttribute("aria-busy")).toBe("true");
      expect(approve.textContent).toContain("Approving…");

      await answers.fail();
      expect(document.activeElement).toBe(approve);
      expect(root.querySelector("[role='alert']")?.textContent).toContain("Try again");
    });

    it("moves focus to Reject when the decision it sends again is Reject", async () => {
      const answers = failingAnswers();
      const { root, later } = approval.openCard({
        decisions: { approve: answers.send, reject: answers.send, askForChanges: answers.send },
      });
      later(2);
      const reject = approval.button(root, "Reject");
      await approval.press(reject);
      await answers.fail();

      await retryWithKeyboard(root, approval.button);
      expect(document.activeElement).toBe(reject);
      await answers.fail();
      expect(document.activeElement).toBe(reject);
    });
  });

  describe("Try again on the wait card", () => {
    it("moves focus to the answer it sends again and keeps it there when the answer fails again", async () => {
      const answers = failingAnswers();
      const { root, later } = wait.openCard({ decisions: { answer: answers.send } });
      later(2);
      const reject = wait.button(root, "Reject");
      await wait.press(reject);
      await answers.fail();

      await retryWithKeyboard(root, wait.button);
      expect(document.activeElement).toBe(reject);
      expect(reject.getAttribute("aria-busy")).toBe("true");
      expect(reject.textContent).toContain("Rejecting…");

      await answers.fail();
      expect(document.activeElement).toBe(reject);
      expect(root.querySelector("[role='alert']")?.textContent).toContain("Try again");
    });
  });
});
