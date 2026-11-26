import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { liamApproved, pull, repo } from "../fast-track/fast-track.test-helper.ts";
import type { SnapshotPull } from "../snapshot/shape.ts";
import { checkPulls } from "./rules/fast-track-checks.ts";

/**
 * The first step of the `fast-track` signal rule on a snapshot saved before
 * the pass named each pull request's reviewer (HAL-19653, HAL-19775): the
 * rule may import nothing, so it can't fall back to the author rule.
 */

const noScope = { pulls: [], tasks: [] };

function checkOf(listed: SnapshotPull) {
  return checkPulls({ repo: repo([listed]), labelAdder: "", sharedScope: noScope })[0];
}

verifies("paperclip.snapshot-reviewer", () => {
  test("names no reviewer and counts no approval until a pass names one", () => {
    expect(checkOf(pull(1, liamApproved))).toMatchObject({ reviewer: null, approved: false });
    expect(checkOf(pull(1, { ...liamApproved, reviewer: "Liam" }))).toMatchObject({
      reviewer: "Liam",
      approved: true,
    });
  });
});
