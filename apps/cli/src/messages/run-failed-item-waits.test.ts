import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { plainText } from "./phrase.ts";
import { type FailedRun, runFailedLines } from "./run-failures.ts";

const reviewAll: FailedRun = { title: "Review all", step: "Each", runId: "01JD8Q", dir: "./acme" };

verifies("cli.run-failed-item-waits", () => {
  it("says the item's run waited, counted from 1, and where to move the wait step", () => {
    const { message, fix } = runFailedLines(reviewAll, {
      reason: "item-run-waits",
      workflow: "review-one",
      item: 1,
    });
    expect(plainText(message.phrase)).toBe(
      "Review all failed in the step Each: the run it started for item 2 waited, and a run for one item can't wait.",
    );
    expect(fix === undefined ? undefined : plainText(fix.phrase)).toBe(
      "Move the wait step in review-one into this workflow after Each, or take it out of review-one. To see which step it is, run halonic validate --dir ./acme.",
    );
  });
});
