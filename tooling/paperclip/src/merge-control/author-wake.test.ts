import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { commandForJob, failedGroupFacts, fallbackCommand } from "./author-wake.ts";
import {
  actionsOf,
  ago,
  entry,
  headOf,
  logText,
  pass,
  pull,
  snapshot,
} from "./merge-control.test-helper.ts";
import type { GroupRun } from "./snapshot.ts";

const run = "https://github.com/acme/tools/actions/runs/7005";

function failedGroup(number: number, jobs: readonly string[]): GroupRun {
  return {
    id: 7000 + number,
    conclusion: "failure",
    branch: `gh-readonly-queue/main/pr-${number}-${headOf(number)}`,
    url: `https://github.com/acme/tools/actions/runs/${7000 + number}`,
    createdAt: ago(20),
    failedJobs: jobs.map((name, index) => ({
      id: index + 1,
      name,
      url: `https://github.com/acme/tools/job/${index + 1}`,
      failedSteps: [],
    })),
  };
}

verifies("paperclip.merge-control-author-wake", () => {
  test("wakes the author on a queue removal", () => {
    const facts = snapshot({
      pulls: [pull(5, { mergeable: "CONFLICTING" })],
      queue: [entry(5, 1)],
    });
    const first = pass(facts);
    expect(actionsOf(first, "wake")).toEqual([
      {
        kind: "wake",
        agent: "mateo",
        task: "HAL-5",
        key: `wake-removed#5@${headOf(5)}`,
        facts: [
          `Queue manager: #5 (head \`${headOf(5).slice(0, 9)}\`) was removed from the merge queue: conflicts with main: please rebase.`,
          "What to run: `git fetch origin && git rebase origin/main`, then push.",
          "The queue manager re-adds it once it passes the gate; don't queue it yourself.",
        ],
      },
    ]);
    expect(logText(first)).toContain("#5 -> HAL-5 (mateo): removed");
    expect(actionsOf(pass(facts, first.state), "wake")).toEqual([]);
  });

  test("wakes the author when the merge group failed, with each job and the command to run", () => {
    const jobs = ["Typecheck, lint, test, build (core)", "Leak guard"];
    const facts = snapshot({ pulls: [pull(5)], groupRuns: [failedGroup(5, jobs)] });
    const [wake] = actionsOf(pass(facts), "wake");
    expect(wake?.task).toBe("HAL-5");
    expect(wake?.key).toBe(`wake-group-failed#5@${headOf(5)}`);
    expect(wake?.facts).toEqual([
      `Queue manager: #5 (head \`${headOf(5).slice(0, 9)}\`) was taken out of the merge queue: its merge group failed in \`Typecheck, lint, test, build (core)\`, \`Leak guard\`: ${run}`,
      "What to run: `git fetch origin && git rebase origin/main`, then `pnpm exec turbo run typecheck lint test build --filter=...[origin/main]`, then `pnpm exec node tooling/check/src/cli/leaks.ts --range origin/main..HEAD`.",
      "Fix what fails and push: it isn't queued again until it has a new head. If the failure isn't from this PR's code, say so on the PR and push a rebase.",
    ]);
  });

  test("a fork's branch or a branch that names no task wakes nobody", () => {
    const facts = snapshot({
      pulls: [
        pull(4, { crossRepository: true, branch: "mateo/HAL-4-thing" }),
        pull(6, { mergeable: "CONFLICTING", branch: "fix-the-thing" }),
      ],
      queue: [entry(4, 1), entry(6, 2)],
    });
    const decision = pass(facts);
    expect(actionsOf(decision, "dequeue").map((each) => each.number)).toEqual([4, 6]);
    expect(actionsOf(decision, "wake")).toEqual([]);
    expect(logText(decision)).toContain("#6: branch fix-the-thing names no task; nobody woken");
  });

  test("an unknown job, or no failed job, falls back to the full check", () => {
    expect(commandForJob("Sandbox fence (bubblewrap)")).toBe(fallbackCommand);
    expect(commandForJob("Fast gates")).toBe("pnpm check");
    expect(failedGroupFacts({ number: 7, head: headOf(7) }, [], run)[1]).toBe(
      "What to run: `git fetch origin && git rebase origin/main`, then `pnpm check:enqueue`.",
    );
  });
});
