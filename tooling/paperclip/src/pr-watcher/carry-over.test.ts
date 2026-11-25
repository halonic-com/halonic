import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { carries } from "./carry-over.ts";
import type { PullFacts } from "./decide.ts";
import { agents, task } from "./fakes.test-helper.ts";
import { mateoBranch, open, setup } from "./handoff.test-helper.ts";
import type { Reviewer } from "./handoff.ts";

/** An approval that carries over a rebase-only push (HAL-18460), on facts given directly. */

function rebased(by: string, extra: Partial<PullFacts> = {}): PullFacts {
  return open(5701, mateoBranch, { approvals: [{ by, head: "4999bbb" }], ...extra });
}

function watcher(pull: PullFacts, byPaths: Reviewer, rebaseOnly = true, files: string[] = []) {
  const compared: string[] = [];
  const run = setup({
    tasks: [task(5701, agents.mateo, { branch: mateoBranch })],
    pulls: [pull],
    byPaths,
    files,
    rebaseOnly: async (_pull, approved) => {
      compared.push(approved);
      return rebaseOnly;
    },
  });
  return { ...run, compared };
}

function bodies(comments: Record<string, { body: string }[]>): string[] {
  return (comments["task-5701"] ?? []).map(({ body }) => body);
}

const since = { by: "Liam", approvedHead: "4999bbb", rebaseOnly: true };

verifies("paperclip.pr-watcher-rebase-carry", () => {
  test("records Liam's approval as carried over once, compares once, and hands nothing to review", async () => {
    const carried = watcher(rebased("Liam"), "julian");
    expect(await carried.run()).toMatchObject({ handedOff: 0, warned: 0, failed: [] });
    expect(await carried.run()).toMatchObject({ handedOff: 0, warned: 0, failed: [] });
    expect(carried.compared).toEqual(["4999bbb"]);
    expect(carried.handoffs).toEqual([]);
    const notes = bodies(carried.comments);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain(
      "PR watcher: only a rebase since the approval, so no new review round.",
    );
    expect(notes[0]).toContain("Liam approved `4999bbb`; `5701aaa` has the same changes.");
    expect(notes[0]).toContain("<!-- pr-watcher: halonic-com/halonic#5701 5701aaa carried -->");
  });

  test("records it while ci-ok still runs, instead of the push-after-approval warning", async () => {
    const pending = watcher(rebased("Liam", { ciOkOnHead: "pending" }), "liam");
    expect(await pending.run()).toMatchObject({ warned: 0, handedOff: 0 });
    const notes = bodies(pending.comments);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain("so no new review round");
    expect(notes[0]).not.toContain("this voids the approval");
  });

  test("carries Julian's approval within his limits, but not outside them", async () => {
    const within = watcher(rebased("Julian"), "julian");
    await within.run();
    expect(within.handoffs).toEqual([]);
    expect(bodies(within.comments)[0]).toContain("Julian approved `4999bbb`");
    const outside = watcher(rebased("Julian"), "liam");
    await outside.run();
    expect(outside.handoffs.map(({ to }) => to)).toEqual([agents.liam]);
    expect(bodies(outside.comments).join("\n")).not.toContain("so no new review round");
  });

  test("never carries a changed head or a security pull request: they go to the reviewer", async () => {
    const changed = watcher(rebased("Liam"), "julian", false);
    await changed.run();
    expect(changed.handoffs.map(({ to }) => to)).toEqual([agents.julian]);
    const security = watcher(rebased("Liam"), "liam", true, ["packages/x/src/sandbox/fence.ts"]);
    await security.run();
    expect(security.compared).toEqual([]);
    expect(security.handoffs.map(({ to }) => to)).toEqual([agents.liam]);
  });

  test("carries only on the Merger's repository, and never a stacked or Liam's own pull request", () => {
    expect(carries(rebased("Liam"), since, "liam")).toBe(true);
    expect(carries(rebased("Liam", { repo: "halonic-com/cloud" }), since, "liam")).toBe(false);
    expect(carries(rebased("Liam"), { ...since, stacked: true }, "liam")).toBe(false);
    expect(carries(rebased("Liam"), { ...since, security: true }, "liam")).toBe(false);
    const liams = open(5701, "liam/HAL-5701-work");
    expect(carries(liams, { ...since, by: "Julian" }, "julian")).toBe(false);
  });
});
