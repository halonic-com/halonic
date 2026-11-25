import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { pullNode } from "./facts.test-helper.ts";
import { gatePullOf } from "./facts-pulls.ts";
import type { PullNode } from "./facts-query.ts";
import {
  ago,
  enqueued,
  entry,
  headOf,
  logText,
  pass,
  pull,
  snapshot,
  stateWith,
} from "./merge-control.test-helper.ts";
import type { GatePull, GroupRun } from "./snapshot.ts";

/**
 * The shadow pass against the live Merger, 25 Nov (HAL-18324): #5768 failed
 * in a group the pass never judged, and #5889 was approved and green but
 * blocked on GitHub. Both were enqueued by the shadow and held by the Merger.
 */

/** Taken out by GitHub for failed checks `minutes` ago, after its last push. */
function failedOut(number: number, minutes: number, changes: Partial<GatePull> = {}): GatePull {
  return pull(number, {
    headCommittedAt: ago(minutes + 60),
    queueExit: { at: ago(minutes), reason: "FAILED_CHECKS" },
    ...changes,
  });
}

function group(number: number, id: number, minutes: number): GroupRun {
  return {
    id,
    conclusion: "failure",
    branch: `gh-readonly-queue/main/pr-${number}-${headOf(number)}`,
    url: `https://github.com/acme/tools/actions/runs/${id}`,
    createdAt: ago(minutes),
    failedJobs: [],
  };
}

verifies("paperclip.merge-control-unjudged-hold", () => {
  test("a head GitHub took out for failed checks, in a group no pass judged, is held", () => {
    const decision = pass(snapshot({ pulls: [failedOut(5768, 11 * 60)] }));
    expect(enqueued(decision)).toEqual([]);
    expect(decision.state.failedHeads).toEqual({ "5768": headOf(5768) });
    expect(logText(decision)).toContain(
      "UNJUDGED_HOLD #5768 (GitHub took it out for failed checks at 01:00 on this head; no pass judged its group)",
    );
    const next = pass(snapshot({ pulls: [failedOut(5768, 11 * 60)] }), decision.state);
    expect(enqueued(next)).toEqual([]);
    const pushed = failedOut(5768, 11 * 60, { head: headOf(5768, 1), headCommittedAt: ago(40) });
    expect(enqueued(pass(snapshot({ pulls: [pushed] }), next.state))).toEqual([5768]);
  });

  test("a judged group, a lifted hold, a push since, another reason or a removal without its run yet hold nothing", () => {
    const judged = pass(
      snapshot({ pulls: [failedOut(5, 90)], groupRuns: [group(5, 7005, 100)] }),
      stateWith({ seenFailedRuns: [7005] }),
    );
    expect(enqueued(judged)).toEqual([5]);
    const lifted = stateWith({ flakeLifted: { "5": headOf(5) } });
    expect(enqueued(pass(snapshot({ pulls: [failedOut(5, 90)] }), lifted))).toEqual([5]);
    const pushedSince = failedOut(5, 90, { headCommittedAt: ago(30) });
    expect(enqueued(pass(snapshot({ pulls: [pushedSince] })))).toEqual([5]);
    const manual = failedOut(5, 90, { queueExit: { at: ago(90), reason: "MANUAL" } });
    expect(enqueued(pass(snapshot({ pulls: [manual] })))).toEqual([5]);
    // No run in the facts yet: a fresh removal waits for its run to show up.
    expect(enqueued(pass(snapshot({ pulls: [failedOut(5, 5)] })))).toEqual([5]);
  });

  test("state reset mid-run: a group too old to judge holds at once, a fresh one goes through the failed-group rules", () => {
    // HAL-18340: the state was emptied 90 minutes after the group; the pass marks it seen without judging it.
    const old = pass(snapshot({ pulls: [failedOut(5, 70)], groupRuns: [group(5, 7005, 90)] }));
    expect(enqueued(old)).toEqual([]);
    expect(old.state.failedHeads).toEqual({ "5": headOf(5) });
    expect(logText(old)).toContain("UNJUDGED_HOLD #5");
    const again = pass(
      snapshot({ pulls: [failedOut(5, 70)], groupRuns: [group(5, 7005, 90)] }),
      old.state,
    );
    expect(enqueued(again)).toEqual([]);

    // Emptied 30 minutes after the group: the culprit rules judge it as before, no unjudged hold.
    const fresh = pass(snapshot({ pulls: [failedOut(5, 10)], groupRuns: [group(5, 7005, 30)] }));
    expect(fresh.state.failedHeads).toEqual({ "5": headOf(5) });
    expect(logText(fresh)).not.toContain("UNJUDGED_HOLD");
  });

  test("the reader keeps the newest queue event only when it is a removal, with its reason", () => {
    const out = {
      __typename: "RemovedFromMergeQueueEvent",
      createdAt: ago(20),
      reason: "failed_checks",
    };
    const added = { __typename: "AddedToMergeQueueEvent", createdAt: ago(30) };
    const exitOf = (nodes: PullNode["timelineItems"]["nodes"]) =>
      gatePullOf(pullNode(1, { timelineItems: { nodes } })).queueExit;
    expect(exitOf([added, out])).toEqual({ at: ago(20), reason: "FAILED_CHECKS" });
    expect(exitOf([added, out, { ...added, createdAt: ago(10) }])).toBeNull();
    expect(exitOf([])).toBeNull();
  });

  test("a queued pull request is never held this way", () => {
    const decision = pass(
      snapshot({ pulls: [failedOut(5, 90)], queue: [entry(5, 1)] }),
      stateWith({ lastQueue: [5] }),
    );
    expect(decision.state.failedHeads).toEqual({});
  });
});

verifies("paperclip.merge-control-blocked-wait", () => {
  test("an approved, green pull request GitHub shows as blocked waits and is told once", () => {
    const blocked = pull(5889, { mergeStateStatus: "BLOCKED" });
    const first = pass(snapshot({ pulls: [blocked] }));
    expect(enqueued(first)).toEqual([]);
    expect(logText(first)).toContain("#5889(GitHub shows it as blocked)");
    expect(first.actions.map((action) => action.kind === "comment" && action.key)).toEqual([
      `blocked#5889@${headOf(5889)}`,
    ]);
    expect(pass(snapshot({ pulls: [blocked] }), first.state).actions).toEqual([]);
    const clean = pull(5889, { mergeStateStatus: "CLEAN" });
    expect(enqueued(pass(snapshot({ pulls: [clean] }), first.state))).toEqual([5889]);
  });
});
