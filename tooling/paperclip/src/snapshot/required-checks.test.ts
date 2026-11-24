import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { missingRequired } from "./required-checks.ts";

/** Which required checks have no run on a head, from its rollup (HAL-17760). */

function rollup(names: readonly string[], hasNextPage = false) {
  return {
    contexts: {
      pageInfo: { hasNextPage, endCursor: null },
      nodes: names.map((name) => ({
        name,
        status: "COMPLETED",
        conclusion: "SUCCESS",
        startedAt: "2026-11-24T16:00:00Z",
      })),
    },
  };
}

verifies("paperclip.pr-watcher-review-wait", () => {
  test("names Guard notes when its job has no run on the head", () => {
    expect(missingRequired(rollup(["ci-ok", "PR details"]))).toEqual(["Guard notes"]);
  });

  test("names nothing when it ran", () => {
    const ran = rollup(["ci-ok", "Decision note and the guard's own paths"]);
    expect(missingRequired(ran)).toEqual([]);
  });

  test("names nothing when the rollup was cut off, since a later page may hold it", () => {
    expect(missingRequired(rollup(["ci-ok"], true))).toEqual([]);
  });
});
