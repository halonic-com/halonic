import type { StepperRequest } from "@halonicjs/action-steppers";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { pinned, stepperCatalog } from "./stepper-fixtures.test-helper.ts";
import { renderStepperResult } from "./stepper-result.ts";

const request: StepperRequest = {
  format: "halonic.stepper-request/1",
  title: "Run the acme migration on my server",
  reason: "The migration needs the server's own database.",
  blocks: [
    {
      kind: "server-session",
      task: "HAL-1234",
      steps: ["Run the acme migration."],
      doneWhen: "The migration reports no pending steps.",
    },
  ],
};

const at = new Date("2026-11-27T09:30:00.000Z");

verifies("paperclip-client.stepper-result-server-session", () => {
  describe("a succeeded server-session block", () => {
    const result = renderStepperResult({
      request,
      revision: pinned,
      answer: {
        kind: "action-result",
        outcome: "succeeded",
        steps: [{ step: 1, outcome: "succeeded" }],
      },
      catalog: stepperCatalog,
      at,
    });

    it("reads as the session it started in the stepper-result document", () => {
      expect(result.document).toContain(
        "| 1 | server session `HAL-1234` | Started a server session on 27 Nov 2026 for HAL-1234 | 2026-11-27 09:30 UTC |",
      );
    });

    it("says the same in the summary comment", () => {
      expect(result.summary).toBe(
        "Started a server session on 27 Nov 2026 for HAL-1234. The document `stepper-result` on this task has each block's result.",
      );
    });
  });

  it("keeps the failure and the plain summary when the session didn't start", () => {
    const result = renderStepperResult({
      request,
      revision: pinned,
      answer: {
        kind: "action-result",
        outcome: "failed",
        steps: [{ step: 1, outcome: "failed", failure: "refused" }],
      },
      catalog: stepperCatalog,
      at,
    });
    expect(result.document).toContain("| 1 | server session `HAL-1234` | failed (refused) |");
    expect(result.summary).toBe(
      "The stepper failed in Halonic: 0 of 1 blocks done. The document `stepper-result` on this task has each block's result.",
    );
  });
});
