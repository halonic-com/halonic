import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { OpenFacts, Snapshot, SnapshotPull } from "../snapshot/shape.ts";
import type { PullFacts, Reason } from "./decide.ts";
import { wakeMessage } from "./messages.ts";
import { snapshotCopies, snapshotSummary } from "./wake-status.ts";

const repo = "halonic-com/halonic";
const head = "7dd0ccf1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const open: OpenFacts = {
  draft: false,
  mergeable: "no",
  ciOk: "failure",
  draftCiOk: "missing",
  inQueue: false,
  labels: [],
  finding: null,
  approvals: [
    { by: "Liam", head: "1234567" },
    { by: "Liam", head: "7dd0ccf" },
  ],
  failingChecks: ["lint", "test"],
};

function pull(number: number, shape: Partial<SnapshotPull>): SnapshotPull {
  return {
    number,
    url: `https://github.com/${repo}/pull/${number}`,
    state: "open",
    branch: `mateo/HAL-${number}-x`,
    headRepo: repo,
    base: "main",
    head,
    updatedAt: "2026-11-24T08:00:00Z",
    mergedAt: null,
    mergeCommit: null,
    open,
    ...shape,
  };
}

const snapshot: Snapshot = {
  version: 1,
  takenAt: "2026-11-24T08:10:00Z",
  closedWindowDays: 3,
  repos: [
    {
      repo,
      defaultBranch: "main",
      queue: [],
      pulls: [
        pull(4614, {}),
        pull(4615, {
          open: { ...open, approvals: [{ by: "Julian", head: "7dd0ccf" }], mergeable: "yes" },
        }),
        pull(4485, { state: "merged", open: null, mergedAt: "2026-11-24T07:00:00Z" }),
      ],
    },
  ],
};

function reason(number: number, kind: Reason["kind"]): Reason {
  const facts: PullFacts = {
    repo,
    number,
    url: `https://github.com/${repo}/pull/${number}`,
    state: kind === "merged" ? "merged" : "open",
    branch: `mateo/HAL-${number}-x`,
    head,
    ciOkOnHead: "failure",
    draft: false,
    conflicting: true,
    inQueue: false,
    retargeted: false,
    latestReview: undefined,
    landed: kind === "merged",
    mergedAt: undefined,
  };
  return { pull: facts, kind, key: `${repo}#${number} 7dd0ccf ${kind}` };
}

verifies("paperclip.pr-watcher-wake-status", () => {
  const summary = snapshotSummary(snapshot);

  test("adds the pr_status head lines of each named pull request, once, in pr_status's words", () => {
    const message = wakeMessage([reason(4614, "ci-red"), reason(4614, "conflict")], summary);
    expect(message.split("\n")).toEqual([
      "PR watcher: this needs you.",
      "",
      `- [#4614](https://github.com/${repo}/pull/4614): \`ci-ok\` failed on its head \`7dd0ccf\`.`,
      `- [#4614](https://github.com/${repo}/pull/4614): it conflicts with its base branch and isn't in the merge queue.`,
      "",
      "What `pr_status` says, as of this check. No need to check again unless you pushed since:",
      '- #4614 head 7dd0ccf: ci-ok failure (failing: "lint", "test"); mergeable conflict',
      "- #4614 merge queue: not queued; approvals: Liam on 1234567 (doesn't count): names an older head; Liam on 7dd0ccf",
      "",
      `<!-- pr-watcher: ${repo}#4614 7dd0ccf ci-red -->`,
      `<!-- pr-watcher: ${repo}#4614 7dd0ccf conflict -->`,
    ]);
  });

  test("says Julian's approval counts only within his limits, since the snapshot has no paths", () => {
    expect(summary({ repo, number: 4615 })[1]).toBe(
      "merge queue: not queued; approvals: Julian on 7dd0ccf: only within his limits (HAL-14809); pr_status checks",
    );
  });

  test("names at most five failing checks and counts the rest", () => {
    const many = snapshotSummary({
      ...snapshot,
      repos: [
        {
          repo,
          defaultBranch: "main",
          queue: [],
          pulls: [pull(4614, { open: { ...open, failingChecks: ["a", "b", "c", "d", "e", "f"] } })],
        },
      ],
    });
    expect(many({ repo, number: 4614 })[0]).toBe(
      'head 7dd0ccf: ci-ok failure (failing: "a", "b", "c", "d", "e" and 1 more); mergeable conflict',
    );
  });

  test("adds no status for a merged pull request", () => {
    const message = wakeMessage([reason(4485, "merged")], summary);
    expect(message).not.toContain("pr_status");
    expect(message).not.toContain("head 7dd0ccf:");
  });
});

verifies("paperclip.pr-tools-approval-copy", () => {
  test("shows each approval's Paperclip copy in the wake lines, and reads only approved pull requests' tasks", async () => {
    const read: string[] = [];
    const copied: Snapshot = {
      ...snapshot,
      repos: [
        {
          repo,
          defaultBranch: "main",
          queue: [],
          pulls: [
            pull(4614, {}),
            pull(4616, { branch: "mateo/no-task" }),
            pull(4617, { open: { ...open, approvals: [{ by: "Liam", head: "1234567" }] } }),
          ],
        },
      ],
    };
    const copies = await snapshotCopies(
      copied,
      {
        taskComments: async (identifier) => {
          read.push(identifier);
          return [{ authorAgentId: "agent-liam", body: `Liam: approved on head \`${head}\`` }];
        },
        agents: async () => [{ id: "agent-liam", urlKey: "liam" }],
      },
      () => undefined,
    );
    const lines = snapshotSummary(copied, copies);
    expect(read).toEqual(["HAL-4614"]);
    expect(lines({ repo, number: 4614 })[1]).toBe(
      "merge queue: not queued; approvals: Liam on 1234567 (doesn't count; copy: no): names an older head; Liam on 7dd0ccf (copy: yes)",
    );
    expect(lines({ repo, number: 4616 })[1]).toContain("Liam on 7dd0ccf (copy: unknown)");
    expect(lines({ repo, number: 4617 })[1]).not.toContain("copy:");
  });

  test("matches a copy against the pull request's full head, not the GitHub line's short sha", async () => {
    const otherHead = `7dd0ccf${"0".repeat(33)}`;
    const copies = await snapshotCopies(
      snapshot,
      {
        taskComments: async () => [
          { authorAgentId: "agent-liam", body: `Liam: approved on head \`${otherHead}\`` },
        ],
        agents: async () => [{ id: "agent-liam", urlKey: "liam" }],
      },
      () => undefined,
    );
    expect(snapshotSummary(snapshot, copies)({ repo, number: 4614 })[1]).toContain(
      "Liam on 7dd0ccf (copy: no)",
    );
  });

  test("logs a pull request whose copies couldn't be read and shows none for it", async () => {
    const logged: string[] = [];
    const copies = await snapshotCopies(
      snapshot,
      {
        taskComments: async () => {
          throw new Error("Paperclip is down");
        },
        agents: async () => [],
      },
      (line) => logged.push(line),
    );
    expect(snapshotSummary(snapshot, copies)({ repo, number: 4614 })[1]).not.toContain("copy:");
    expect(logged).toEqual([
      "PR watcher: couldn't read the approval copies of #4614: Paperclip is down",
      "PR watcher: couldn't read the approval copies of #4615: Paperclip is down",
    ]);
  });
});
