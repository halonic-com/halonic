// @vitest-environment jsdom
import type { ViewRef } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnsweredViewProps, InboxAnsweredView } from "../answered-view.ts";
import { Inbox } from "../inbox.ts";
import type { InboxRuns } from "../inbox-runs.ts";
import { waitingRun } from "../test-runs.test-helper.ts";
import { unmountAll } from "../test-support/render.tsx";
import { button, openCard, press, reviewItem } from "./wait-card.test-helper.tsx";

afterEach(unmountAll);

/** An open workspace's Inbox with nothing waiting: only its answered views matter here. */
function emptyInbox(): Inbox {
  const runs: InboxRuns = {
    waiting: async () => [],
    subscribe: () => () => {},
    send: vi.fn(async (runId: string) => waitingRun(runId)),
  };
  return new Inbox(runs);
}

function DoneView({ item }: AnsweredViewProps) {
  return <h2>Your run {item.runId} is done.</h2>;
}

const doneView: ViewRef = { view: "DoneView", load: async () => ({ DoneView }) };

/** Claims an approve that finished run `r43`, and nothing else. */
const finishedApprove: InboxAnsweredView = {
  claims: (item, event, after) =>
    item.runId === "r43" && event === "approve" && after === "finished",
  view: doneView,
};

/** A wait card on `inbox` whose answer finishes the run, a minute after it started waiting. */
function finishingCard(inbox: Inbox) {
  const card = openCard({
    decisions: { answer: async () => waitingRun("r43", { status: "completed" }) },
    answeredViews: { inbox, close: () => {} },
  });
  card.later(61);
  return card;
}

verifies("inbox.answered-view", () => {
  describe("Inbox.addAnsweredView", () => {
    it("finds the view that claims an answer, and none once it is taken out", () => {
      const inbox = emptyInbox();
      const remove = inbox.addAnsweredView(finishedApprove);
      const item = reviewItem();
      expect(inbox.answeredView(item, "approve", "finished")).toBe(doneView);
      expect(inbox.answeredView(item, "approve", "continues")).toBeUndefined();
      expect(inbox.answeredView(item, "reject", "finished")).toBeUndefined();
      remove();
      expect(inbox.answeredView(item, "approve", "finished")).toBeUndefined();
    });

    it("claims nothing once the workspace has closed", () => {
      const inbox = emptyInbox();
      inbox.addAnsweredView(finishedApprove);
      inbox.dispose();
      inbox.addAnsweredView(finishedApprove);
      expect(inbox.answeredView(reviewItem(), "approve", "finished")).toBeUndefined();
    });
  });

  describe("the wait card", () => {
    it("is replaced by the view that claims the answer", async () => {
      const inbox = emptyInbox();
      inbox.addAnsweredView(finishedApprove);
      const { root } = finishingCard(inbox);
      await press(button(root, "Approve"));
      await vi.waitFor(() => expect(root.textContent).toBe("Your run r43 is done."));
    });

    it("keeps its decided bar when no view claims the answer", async () => {
      const inbox = emptyInbox();
      inbox.addAnsweredView(finishedApprove);
      const { root } = finishingCard(inbox);
      await press(button(root, "Reject"));
      expect(root.querySelector("[role='group']")?.textContent).toContain(
        "Rejected by you at 10:44.",
      );
      expect(root.textContent).not.toContain("is done");
    });

    it("stays with its decided bar when the view can't load, and says why on the console", async () => {
      const report = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const inbox = emptyInbox();
        const broken = new Error("chunk missing");
        inbox.addAnsweredView({
          ...finishedApprove,
          view: { view: "DoneView", load: async () => Promise.reject(broken) },
        });
        const { root } = finishingCard(inbox);
        await press(button(root, "Approve"));
        await vi.waitFor(() => expect(report).toHaveBeenCalledWith(expect.any(String), broken));
        expect(root.querySelector("[role='group']")?.textContent).toContain(
          "Approved by you at 10:44. The run finished.",
        );
      } finally {
        report.mockRestore();
      }
    });

    it("shows a recorded answer as recorded when a view's claims throws, and says why on the console", async () => {
      const report = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const inbox = emptyInbox();
        const broken = new Error("claims failed");
        inbox.addAnsweredView({
          ...finishedApprove,
          claims: () => {
            throw broken;
          },
        });
        const { root } = finishingCard(inbox);
        await press(button(root, "Approve"));
        expect(report).toHaveBeenCalledWith(expect.any(String), broken);
        expect(root.querySelector("[role='group']")?.textContent).toContain(
          "Approved by you at 10:44. The run finished.",
        );
      } finally {
        report.mockRestore();
      }
    });
  });
});
