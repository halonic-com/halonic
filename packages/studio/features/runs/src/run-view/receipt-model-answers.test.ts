import type { RunEventBody } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { approvalLines } from "./receipt-model.ts";
import { logOf } from "./run-log.test-helper.ts";

// Kept apart from receipt-model.test.ts, which is at the file-size limit.
const id = "run_mfx3k2a1_01jd8q";

verifies("runs.run-view.receipt-approvals", () => {
  const received = (event: string): RunEventBody => ({ type: "event.received", event });

  it("names a wait step's other answer by the label its author gave it, as the Inbox card does (HAL-12745)", () => {
    const labelled: RunEventBody = {
      type: "run.waiting",
      state: "review",
      events: ["approve", "reject", "escalate", "hold"],
      labels: { escalate: "Send to a manager" },
    };
    const events = logOf(id, [
      [1, labelled],
      [2, received("escalate")],
      [3, labelled],
      [4, received("hold")],
    ]);
    expect(approvalLines(events).map((entry) => entry.text)).toEqual([
      "Review: answered Send to a manager by you at 10:42",
      "Review: answered hold by you at 10:44",
    ]);
  });
});
