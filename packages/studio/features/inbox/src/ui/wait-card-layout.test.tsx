// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { unmountAll } from "../test-support/render.tsx";
import { button, openCard, reviewItem } from "./wait-card.test-helper.tsx";

afterEach(unmountAll);

const twoAnswers = { item: reviewItem({ accepts: ["approve", "reject"] }) };

// jsdom lays nothing out, so these hold the classes that do it (HAL-19399 G8).
verifies("inbox.wait-card", () => {
  it("puts the answers in one right-aligned row at their natural width on a desktop", () => {
    const { root } = openCard(twoAnswers);
    const approve = button(root, "Approve");
    const reject = button(root, "Reject");
    const row = approve.closest(".justify-end");
    expect(row?.contains(reject)).toBe(true);
    expect(row?.className).toContain("flex-wrap");
    expect(approve.classList.contains("w-full")).toBe(false);
    expect(reject.classList.contains("w-full")).toBe(false);
    expect(approve.compareDocumentPosition(reject) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the first answer full width over the others on a phone", () => {
    const { root } = openCard(twoAnswers, "phone");
    const approve = button(root, "Approve");
    const reject = button(root, "Reject");
    expect(approve.classList.contains("w-full")).toBe(true);
    expect(approve.closest(".justify-end")).toBeNull();
    expect(reject.parentElement?.closest(".flex.gap-2")?.contains(approve)).toBe(false);
  });
});
