import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { pullNode } from "./facts.test-helper.ts";
import { isGatePull } from "./facts-pulls.ts";
import { actionsOf, entry, logText, pass, pull, snapshot } from "./merge-control.test-helper.ts";
import type { GatePull } from "./snapshot.ts";
import { defaultSettings, type MergeSettings } from "./state.ts";

/**
 * Built in Halonic (board, HAL-18304): a `built-on:halonic` pull request is
 * a candidate only with `fast-track` from a configured labeller.
 */

const labeller = "acme-board";

const settings: MergeSettings = { ...defaultSettings, fastTrackLabellers: [labeller] };

function halonic(number: number, changes: Partial<GatePull> = {}): GatePull {
  return pull(number, {
    labels: ["built-on:halonic", "fast-track"],
    fastTrackBy: labeller,
    ...changes,
  });
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

verifies("paperclip.merge-control-merge-state", () => {
  test("built-on:halonic without fast-track is not a candidate", () => {
    expect(enqueuedWith([halonic(1, { labels: ["built-on:halonic"], fastTrackBy: null })])).toEqual(
      [],
    );
    expect(enqueuedWith([halonic(1, { labels: ["built-on:halonic"] })])).toEqual([]);
  });

  test("built-on:halonic with fast-track from a configured labeller is a fast-track candidate", () => {
    expect(enqueuedWith([pull(2), halonic(1)])).toEqual([
      [1, false],
      [2, false],
    ]);
  });

  test("it jumps only under the normal rule: more than 8 queued and no fast-track queued", () => {
    const nine = queued(9);
    expect(enqueuedWith([...nine.pulls, halonic(1)], nine.queue)).toEqual([[1, true]]);
    const eight = queued(8);
    expect(enqueuedWith([...eight.pulls, halonic(1)], eight.queue)).toEqual([[1, false]]);
  });

  test("fast-track from another actor or an unknown one leaves it out, and is logged", () => {
    const decision = pass(
      snapshot({
        pulls: [halonic(1, { fastTrackBy: "someone" }), halonic(2, { fastTrackBy: null })],
      }),
      undefined,
      settings,
    );
    expect(actionsOf(decision, "enqueue")).toEqual([]);
    expect(logText(decision)).toContain("FAST_UNVERIFIED #1(someone) #2(?)");
  });

  test("a draft with all of it is never a candidate", () => {
    expect(enqueuedWith([halonic(1, { draft: true })])).toEqual([]);
  });

  test("built-on:paperclip decides as before, with or without a verified fast-track", () => {
    const plain = pull(1);
    const verified = pull(2, {
      labels: ["built-on:paperclip", "fast-track"],
      fastTrackBy: labeller,
    });
    const other = pull(3, { labels: ["built-on:paperclip", "fast-track"], fastTrackBy: "someone" });
    expect(enqueuedWith([plain, verified, other])).toEqual([
      [2, false],
      [1, false],
      [3, false],
    ]);
  });
});

verifies("paperclip.merge-control-facts", () => {
  test("the facts read a built-on:halonic pull request only when it carries fast-track", () => {
    const labelled = (...names: string[]) =>
      pullNode(1, { labels: { nodes: names.map((name) => ({ name })) } });
    expect(isGatePull(labelled("built-on:halonic"))).toBe(false);
    expect(isGatePull(labelled("built-on:halonic", "fast-track"))).toBe(true);
    expect(isGatePull(labelled("built-on:paperclip"))).toBe(true);
    expect(isGatePull(labelled("fast-track"))).toBe(false);
  });
});
