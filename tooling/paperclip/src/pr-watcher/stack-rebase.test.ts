import { verifies } from "@halonicjs/testing-spec";
import { expect, test, vi } from "vitest";
import type { GitHubQuery } from "../snapshot/graphql.ts";
import type { PullFacts } from "./decide.ts";
import { pullKey } from "./facts.ts";
import { agents, type FakeTask, fakeGitHub, fakePaperclip } from "./fakes.test-helper.ts";
import { gitHubRebaseOnly } from "./rebase-only.ts";
import {
  gitHubStackBase,
  type StackBase,
  type StackRebase,
  type StackRecord,
  triedHeads,
} from "./stack-rebase.ts";
import { type TickOptions, tick } from "./watch.ts";

/**
 * #5674 was stacked on #5659 (HAL-18031). #5659 merged as one squash commit,
 * GitHub deleted its branch and moved #5674 to `main`.
 */

const repo = "halonic-com/halonic";
const oldHead = "4948ef42b1111111111111111111111111111111";
const newHead = "9e694d0c22222222222222222222222222222222";
const base: StackBase = { number: 5659, head: "ea06f9c343333333333333333333333333333333" };
const branch = "mateo/HAL-17843-approvals-1b";

function child(change: Partial<PullFacts> = {}): PullFacts {
  return {
    repo,
    number: 5674,
    url: `https://github.com/${repo}/pull/5674`,
    state: "open",
    branch,
    head: oldHead,
    ciOkOnHead: "success",
    draft: false,
    conflicting: false,
    inQueue: false,
    retargeted: true,
    latestReview: undefined,
    approvals: [{ by: "Liam", head: oldHead.slice(0, 9) }],
    landed: false,
    mergedAt: undefined,
    ...change,
  };
}

function holderTask(change: Partial<FakeTask> = {}): FakeTask {
  return {
    id: "task-17843",
    identifier: "HAL-17843",
    assigneeAgentId: agents.mateo,
    running: false,
    openChildren: false,
    monitorNextCheckAt: null,
    monitorLastTriggeredAt: null,
    priority: "medium",
    pulls: [{ repo, number: 5674, branch }],
    ...change,
  };
}

/** A stack rebase whose GitHub answers `outcome`, with its requests and tried heads kept. */
function stack(outcome: "rebased" | "refused", found: StackBase | "none" = base) {
  const saved: StackRecord[][] = [];
  const tried = triedHeads([], async (records) => {
    saved.push([...records]);
  });
  const rebase = vi.fn(async (_pull: PullFacts) =>
    outcome === "rebased"
      ? ({ kind: "rebased" } as const)
      : ({
          kind: "refused",
          reason: "GitHub answered 200: PullRequest::RebaseConflictError",
        } as const),
  );
  const find = vi.fn(async (_pull: PullFacts) => (found === "none" ? undefined : found));
  const options: StackRebase = { find, rebase, tried };
  return { options, rebase, find, saved, tried };
}

/** One pass over the task with these facts; the same Paperclip across passes. */
function passer(paperclip: ReturnType<typeof fakePaperclip>, extra: Partial<TickOptions>) {
  return (pull: PullFacts) =>
    tick({
      paperclip: paperclip.paperclip,
      discover: paperclip.discover,
      facts: async (refs) => new Map(refs.map((ref) => [pullKey(ref), pull] as const)),
      dryRun: false,
      log: () => undefined,
      now: new Date("2026-11-25T02:00:00Z"),
      conflictFiles: async () => ["tooling/paperclip/src/approvals.ts"],
      route: async () => ({ reviewer: "liam", security: false }),
      ...extra,
    });
}

/** The compare GitHub gives for the child's own change, with the hunk header a rebase moves. */
function change(at: number) {
  return {
    files: [
      {
        filename: "src/approvals.ts",
        status: "modified",
        patch: `@@ -${at},1 +${at},1 @@\n-old\n+new`,
      },
    ],
  };
}

verifies("paperclip.pr-watcher-stack-rebase", () => {
  test("(a) a child moved to main after its base merged gets one rebase request and no wake, and its approval carries over", async () => {
    const paperclip = fakePaperclip([holderTask()]);
    const { options, rebase, tried } = stack("rebased");
    const github = fakeGitHub({
      [`/repos/${repo}/pulls/5674`]: { base: { ref: "main" } },
      [`/repos/${repo}/compare/${base.head}...${oldHead.slice(0, 9)}`]: change(10),
      [`/repos/${repo}/compare/main...${newHead}`]: change(14),
    });
    const pass = passer(paperclip, {
      stackRebase: options,
      rebaseOnly: gitHubRebaseOnly(github.get, tried.baseOf),
    });
    const first = await pass(child());
    expect(rebase).toHaveBeenCalledTimes(1);
    expect(first.woken).toBe(0);
    expect(paperclip.wakes).toEqual([]);
    const note = paperclip.comments["task-17843"]?.at(-1)?.body ?? "";
    expect(note).toContain("PR watcher: rebased stacked pull requests, nothing for you to do.");
    expect(note).toContain("#5659 below it merged");
    // GitHub's rebase landed: a new head, green, still approved only on the old one.
    const second = await pass(child({ head: newHead, retargeted: false }));
    expect(rebase).toHaveBeenCalledTimes(1);
    expect([second.woken, second.warned, second.handedOff]).toEqual([0, 0, 1]);
    expect(paperclip.handoffs).toEqual([
      expect.objectContaining({ taskId: "task-17843", to: agents.julian }),
    ]);
    expect(paperclip.comments["task-17843"]?.at(-1)?.body).toContain("rebase only");
  });

  test("(b) a refused rebase gives exactly one conflict wake naming the files and the command", async () => {
    const paperclip = fakePaperclip([holderTask()]);
    const { options, rebase } = stack("refused");
    const pass = passer(paperclip, { stackRebase: options });
    await pass(child());
    await pass(child());
    expect(rebase).toHaveBeenCalledTimes(1);
    expect(paperclip.wakes).toEqual([
      { taskId: "task-17843", key: `${repo}#5674 4948ef4 stack-rebase` },
    ]);
    const wake = paperclip.comments["task-17843"]?.at(-1)?.body ?? "";
    expect(wake).toContain("#5659 below it merged, and GitHub couldn't rebase it on `main`");
    expect(wake).toContain("`git rebase --onto origin/main ea06f9c`");
    expect(wake).toContain("`tooling/paperclip/src/approvals.ts`");
    expect(wake).not.toContain("Close and reopen it");
  });

  test("(c) a second pass on the same head does nothing, also when GitHub hasn't shown the new head yet", async () => {
    const paperclip = fakePaperclip([holderTask()]);
    const { options, rebase, find, saved } = stack("rebased");
    const pass = passer(paperclip, { stackRebase: options });
    await pass(child());
    const comments = paperclip.comments["task-17843"]?.length;
    const again = await pass(child());
    expect(rebase).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenCalledTimes(1);
    expect(again.woken).toBe(0);
    expect(paperclip.comments["task-17843"]?.length).toBe(comments);
    expect(saved).toEqual([
      [
        {
          key: `${repo}#5674 4948ef4 stack-rebase`,
          pull: `${repo}#5674`,
          from: oldHead,
          baseHead: base.head,
        },
      ],
    ]);
  });

  test("leaves today's wake when there is no merged base, and sends nothing in a dry run or while its author runs", async () => {
    const noBase = stack("rebased", "none");
    const paperclip = fakePaperclip([holderTask()]);
    await passer(paperclip, { stackRebase: noBase.options })(child());
    expect(noBase.rebase).not.toHaveBeenCalled();
    expect(paperclip.wakes).toEqual([
      { taskId: "task-17843", key: `${repo}#5674 4948ef4 retargeted` },
    ]);
    const dry = stack("rebased");
    await passer(fakePaperclip([holderTask()]), { stackRebase: dry.options, dryRun: true })(
      child(),
    );
    const running = stack("rebased");
    await passer(fakePaperclip([holderTask({ running: true })]), { stackRebase: running.options })(
      child(),
    );
    expect([dry.rebase.mock.calls.length, running.rebase.mock.calls.length]).toEqual([0, 0]);
  });

  test("rebases the child of a parked task too, which only a base change wakes", async () => {
    const paperclip = fakePaperclip([holderTask({ parked: true })]);
    const { options, rebase } = stack("rebased");
    const pass = await passer(paperclip, { stackRebase: options })(child({ approvals: [] }));
    expect(rebase).toHaveBeenCalledTimes(1);
    expect(pass.woken).toBe(0);
  });
});

/** GitHub's GraphQL answers for the child and its old base. */
function stackQuery(
  change: { cross?: boolean; base?: string; merged?: boolean; from?: string } = {},
): GitHubQuery {
  return async (document) =>
    document.includes("query StackBaseMerged")
      ? {
          repository: {
            pullRequests: {
              nodes: [{ number: 5659, merged: change.merged ?? true, headRefOid: base.head }],
            },
          },
        }
      : {
          repository: {
            pullRequest: {
              isCrossRepository: change.cross ?? false,
              baseRefName: change.base ?? "main",
              timelineItems: {
                nodes:
                  change.from === ""
                    ? []
                    : [{ previousRefName: change.from ?? "mateo/HAL-17575-approvals-1" }],
              },
            },
          },
        };
}

verifies("paperclip.pr-watcher-stack-rebase", () => {
  test("finds the base only when GitHub says it merged, the child is ours and on main, and still carries the base's head", async () => {
    const compare = `/repos/${repo}/compare/${base.head}...${oldHead}`;
    const holds = fakeGitHub({ [compare]: { behind_by: 0 } }).get;
    const rebased = fakeGitHub({ [compare]: { behind_by: 3 } }).get;
    expect(await gitHubStackBase(stackQuery(), holds)(child())).toEqual(base);
    for (const [query, get] of [
      [stackQuery({ merged: false }), holds],
      [stackQuery({ cross: true }), holds],
      [stackQuery({ base: "mateo/HAL-17575-approvals-1" }), holds],
      [stackQuery({ from: "" }), holds],
      [stackQuery(), rebased],
    ] as const) {
      expect(await gitHubStackBase(query, get)(child())).toBeUndefined();
    }
  });
});
