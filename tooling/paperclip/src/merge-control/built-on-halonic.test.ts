import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { labelNoopCheck } from "./checks.ts";
import { pullNode } from "./facts.test-helper.ts";
import { isGatePull } from "./facts-pulls.ts";
import { gateRow } from "./gate.ts";
import {
  actionsOf,
  ago,
  check,
  entry,
  greenChecks,
  logText,
  pass,
  pull,
  said,
  snapshot,
} from "./merge-control.test-helper.ts";
import type { GatePull } from "./snapshot.ts";
import { defaultSettings, type MergeSettings } from "./state.ts";

/**
 * Built in Halonic (HAL-18470, the live Merger since 25 Nov 12:02 UTC): a
 * `built-on:halonic` pull request is a candidate like a `built-on:paperclip`
 * one; `fast-track` still counts only from a configured labeller.
 */

const labeller = "acme-board";

const settings: MergeSettings = { ...defaultSettings, fastTrackLabellers: [labeller] };

function halonic(number: number, changes: Partial<GatePull> = {}): GatePull {
  return pull(number, { labels: ["built-on:halonic"], ...changes });
}

function enqueuedWith(pulls: GatePull[], queue = snapshot().queue): [number, boolean][] {
  return actionsOf(pass(snapshot({ pulls, queue }), undefined, settings), "enqueue").map((each) => [
    each.number,
    each.jump,
  ]);
}

function queued(count: number, from = 100) {
  const numbers = Array.from({ length: count }, (_, index) => from + index);
  return {
    pulls: numbers.map((number) => pull(number)),
    queue: numbers.map((number, index) => entry(number, index + 1)),
  };
}

/** The same pull request in each state, to compare the two labels on. */
const variants: Record<string, Partial<GatePull>> = {
  green: {},
  unapproved: { texts: [said("Looks fine to me")] },
  red: { checks: [...greenChecks().slice(1), check("ci-ok", "CI", { conclusion: "failure" })] },
  "label-noop": {
    checks: [...greenChecks(), check(labelNoopCheck, "CI", { runCreatedAt: ago(20) })],
  },
  conflicting: { mergeable: "CONFLICTING" },
  draft: { draft: true },
};

verifies("paperclip.merge-control-merge-state", () => {
  test("built-on:halonic gets the same gate verdict as built-on:paperclip", () => {
    for (const [name, changes] of Object.entries(variants)) {
      const verdict = (labels: string[]) => {
        const each = pull(1, { ...changes, labels });
        const row = gateRow(snapshot({ pulls: [each] }), each, settings);
        const decision = pass(snapshot({ pulls: [each] }), undefined, settings);
        return {
          name,
          pass: row.pass,
          candidate: row.candidate,
          paperclip: row.paperclip,
          reasons: row.reasons,
          actions: decision.actions.map((action) => action.kind),
        };
      };
      expect(verdict(["built-on:halonic"])).toEqual(verdict(["built-on:paperclip"]));
    }
  });

  test("a pull request with neither label is skipped", () => {
    expect(enqueuedWith([pull(1, { labels: [] }), pull(2, { labels: ["fast-track"] })])).toEqual(
      [],
    );
    expect(enqueuedWith([halonic(3), pull(4)])).toEqual([
      [3, false],
      [4, false],
    ]);
  });

  test("fast-track from a configured labeller still puts it first, and it jumps only under the normal rule", () => {
    const fast = halonic(1, { labels: ["built-on:halonic", "fast-track"], fastTrackBy: labeller });
    expect(enqueuedWith([pull(2), fast])).toEqual([
      [1, false],
      [2, false],
    ]);
    const nine = queued(9);
    expect(enqueuedWith([...nine.pulls, fast], nine.queue)).toEqual([[1, true]]);
    const eight = queued(8);
    expect(enqueuedWith([...eight.pulls, fast], eight.queue)).toEqual([[1, false]]);
  });

  test("fast-track from another actor or an unknown one queues it normally, and is logged", () => {
    const decision = pass(
      snapshot({
        pulls: [
          pull(5),
          halonic(1, { labels: ["built-on:halonic", "fast-track"], fastTrackBy: "someone" }),
          halonic(2, { labels: ["built-on:halonic", "fast-track"], fastTrackBy: null }),
        ],
      }),
      undefined,
      settings,
    );
    expect(actionsOf(decision, "enqueue").map((each) => [each.number, each.jump])).toEqual([
      [1, false],
      [2, false],
      [5, false],
    ]);
    expect(logText(decision)).toContain("FAST_UNVERIFIED #1(someone) #2(?)");
  });
});

verifies("paperclip.merge-control-facts", () => {
  test("the facts read a pull request with either built-on label", () => {
    const labelled = (...names: string[]) =>
      pullNode(1, { labels: { nodes: names.map((name) => ({ name })) } });
    expect(isGatePull(labelled("built-on:halonic"))).toBe(true);
    expect(isGatePull(labelled("built-on:halonic", "fast-track"))).toBe(true);
    expect(isGatePull(labelled("built-on:paperclip"))).toBe(true);
    expect(isGatePull(labelled("fast-track"))).toBe(false);
    expect(isGatePull(labelled())).toBe(false);
  });
});
