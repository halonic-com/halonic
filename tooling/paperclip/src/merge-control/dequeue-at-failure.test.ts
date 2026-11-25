import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { act, writesOf } from "./act.ts";
import {
  actionsOf,
  ago,
  enqueued,
  entry,
  headOf,
  logText,
  pass,
  pull,
  snapshot,
} from "./merge-control.test-helper.ts";
import { hookRefusedTitle } from "./refused.ts";
import type { GroupRun } from "./snapshot.ts";

function group(number: number, changes: Partial<GroupRun> = {}): GroupRun {
  return {
    id: 7000 + number,
    conclusion: "failure",
    branch: `gh-readonly-queue/main/pr-${number}-${headOf(number)}`,
    url: `https://github.com/acme/tools/actions/runs/${7000 + number}`,
    createdAt: ago(20),
    failedJobs: [
      {
        id: 1,
        name: "Test (core)",
        url: "https://github.com/acme/tools/job/1",
        failedSteps: ["Run tests"],
        annotationTitles: ["expected 2 to be 3"],
      },
    ],
    ...changes,
  };
}

/** One pass with pull request 5 queued first and 6 behind it, and `run` as 5's group. */
function passQueued(run: GroupRun) {
  return pass(
    snapshot({
      pulls: [pull(5), pull(6)],
      queue: [entry(5, 1), entry(6, 2)],
      groupRuns: [run],
    }),
  );
}

verifies("paperclip.merge-control-dequeue-at-failure", () => {
  test("a queued pull request whose own group failed is dequeued and held in the same pass", () => {
    const decision = passQueued(group(5));
    const dequeues = actionsOf(decision, "dequeue");
    expect(dequeues.map((each) => [each.number, each.reason, each.head])).toEqual([
      [5, "group-failed", headOf(5)],
    ]);
    expect(decision.state.failedHeads).toEqual({ "5": headOf(5) });
    expect(decision.state.seenFailedRuns).toEqual([7005]);
    expect(decision.state.lastQueue).toEqual([6]);
    expect(logText(decision)).toContain("DEQUEUE_AT_FAILURE #5");
    // The hold's comment says why, so the dequeue posts none of its own.
    expect(dequeues[0]?.comment).toBe("");
    const writes = dequeues.flatMap((each) => writesOf(each, "acme/tools"));
    expect(writes.map((each) => each.kind)).toEqual(["dequeue"]);
    expect(actionsOf(decision, "comment").map((each) => each.key)).toEqual([`held#5@${headOf(5)}`]);
  });

  test("the next pass, once GitHub has it out, neither holds it twice nor adds it again", () => {
    const first = passQueued(group(5));
    const second = pass(
      snapshot({ pulls: [pull(5), pull(6)], queue: [entry(6, 1)], groupRuns: [group(5)] }),
      first.state,
    );
    expect(actionsOf(second, "dequeue")).toEqual([]);
    expect(actionsOf(second, "comment")).toEqual([]);
    expect(enqueued(second)).toEqual([]);
  });

  test("a cancelled group isn't dequeued: GitHub's removal is waited for", () => {
    const decision = passQueued(group(5, { conclusion: "cancelled" }));
    expect(actionsOf(decision, "dequeue")).toEqual([]);
    expect(decision.state.failedHeads).toEqual({});
    expect(decision.state.lastQueue).toEqual([5, 6]);
  });

  test("a group the runner hook refused isn't dequeued", () => {
    const refused = group(5, {
      failedJobs: [
        {
          id: 1,
          name: "Test (core)",
          url: "https://github.com/acme/tools/job/1",
          failedSteps: [],
          annotationTitles: [hookRefusedTitle],
        },
      ],
    });
    const decision = passQueued(refused);
    expect(actionsOf(decision, "dequeue")).toEqual([]);
    expect(decision.state.failedHeads).toEqual({});
  });

  test("a failure older than the hour dequeues nothing", () => {
    const decision = passQueued(group(5, { createdAt: ago(90) }));
    expect(actionsOf(decision, "dequeue")).toEqual([]);
  });

  test("a pull request another rule already takes out this pass is dequeued once", () => {
    const decision = pass(
      snapshot({
        pulls: [pull(5, { mergeable: "CONFLICTING" })],
        queue: [entry(5, 1)],
        groupRuns: [group(5)],
      }),
    );
    expect(actionsOf(decision, "dequeue").map((each) => each.reason)).toEqual(["conflict"]);
  });

  test("the dequeue goes out before the hold's comment", async () => {
    const decision = passQueued(group(5));
    const sent: string[] = [];
    await act(decision.actions, {
      repo: "acme/tools",
      client: {
        send: async (write) => {
          sent.push(write.kind);
        },
      },
    });
    expect(sent.slice(0, 2)).toEqual(["dequeue", "comment"]);
  });
});
