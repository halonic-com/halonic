import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { RunWorkflow } from "../api.ts";
import { summaryWith } from "../summary.test-helper.ts";
import { runEnding } from "./run-ending.ts";

const endings: Record<string, string> = {
  replied: "Finished with the reply approved",
  "not-replied": "Finished without the reply\nNothing is sent.",
};

const supportReply: RunWorkflow = {
  name: "Support reply",
  stepDescription: (stateId) => endings[stateId],
  finalStates: ["replied", "not-replied", "ignored"],
};

const ended = (state: string) => summaryWith({ status: "completed", state });

verifies("runs.run-view.receipt-ending", () => {
  it("names the ending a completed run reached by its description's first line (HAL-14586)", () => {
    expect(runEnding(ended("not-replied"), supportReply)).toBe("Finished without the reply");
    expect(runEnding(ended("replied"), supportReply)).toBe("Finished with the reply approved");
  });

  it("names an ending without a description by its id", () => {
    expect(runEnding(ended("ignored"), supportReply)).toBe("Ignored");
  });

  it("has no ending for a workflow with one final state, or whose final states aren't known", () => {
    expect(runEnding(ended("done"), { ...supportReply, finalStates: ["done"] })).toBeUndefined();
    expect(
      runEnding(ended("replied"), { name: "Support reply", stepDescription: () => undefined }),
    ).toBeUndefined();
    expect(runEnding(ended("replied"), undefined)).toBeUndefined();
  });

  it("has no ending for a run that didn't complete", () => {
    expect(runEnding(summaryWith({ status: "failed", state: "draft" }), supportReply)).toBe(
      undefined,
    );
    expect(runEnding(summaryWith({ status: "running", state: "draft" }), supportReply)).toBe(
      undefined,
    );
  });
});
