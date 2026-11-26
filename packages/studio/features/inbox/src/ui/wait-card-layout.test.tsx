// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { unmountAll } from "../test-support/render.tsx";
import { button, openCard, reviewItem } from "./wait-card.test-helper.tsx";

afterEach(unmountAll);

const twoAnswers = { item: reviewItem({ accepts: ["approve", "reject"] }) };

// jsdom lays nothing out, so these hold the classes that do it (HAL-19399 G8).
verifies("inbox.wait-card", () => {
  it("puts the answers in one right-aligned row at their natural width, the first last, on a desktop", () => {
    const { root } = openCard(twoAnswers);
    const approve = button(root, "Approve");
    const reject = button(root, "Reject");
    const row = approve.closest(".justify-end");
    expect(row?.contains(reject)).toBe(true);
    expect(row?.className).toContain("flex-wrap");
    expect(approve.classList.contains("w-full")).toBe(false);
    expect(reject.classList.contains("w-full")).toBe(false);
    expect(reject.compareDocumentPosition(approve) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the first answer full width over the others on a phone", () => {
    const { root } = openCard(twoAnswers, "phone");
    const approve = button(root, "Approve");
    const reject = button(root, "Reject");
    expect(approve.classList.contains("w-full")).toBe(true);
    expect(approve.closest(".justify-end")).toBeNull();
    expect(reject.parentElement?.closest(".flex.gap-2")?.contains(approve)).toBe(false);
  });

  it("has a button per answer, the first one primary and none red", () => {
    const { root } = openCard({
      item: reviewItem({ accepts: ["approve", "reject", "needs_info"] }),
    });
    const labels = [...root.querySelectorAll("button")].map((b) => b.textContent);
    // Each button also holds its busy label, hidden, so it keeps its width while busy. On a
    // desktop the first answer ends the row, as Approve does on the approval card.
    expect(labels).toEqual([
      "Open run",
      "RejectRejecting…",
      "Needs infoWorking…",
      "ApproveApproving…",
    ]);
    expect(button(root, "Approve").className).toContain("primary");
    expect(root.innerHTML).not.toContain("danger");
  });

  it("says Working… while sending an answer the step labels itself, never another word", () => {
    const { root } = openCard({
      item: { ...reviewItem(), answerLabels: { approve: "Send reply" } },
    });
    const labels = [...root.querySelectorAll("button")].map((b) => b.textContent);
    expect(labels).toEqual(["Open run", "RejectRejecting…", "Send replyWorking…"]);
  });
});
