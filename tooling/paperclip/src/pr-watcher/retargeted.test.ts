import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { GitHubQuery } from "../snapshot/graphql.ts";
import { takeSnapshot } from "../snapshot/read.ts";
import { decide, type Memory, type WatchedTask } from "./decide.ts";
import { snapshotFacts } from "./facts.ts";
import { wakeMessage } from "./watch.ts";

/**
 * A stacked pull request that GitHub moved to `main` when the one below it
 * merged: its note check ran against the old base, and GitHub doesn't run
 * the required copy again on a base change, only on a reopen or push
 * (HAL-16394).
 */

const repo = "halonic-com/halonic";
const head = "9807761bbaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

interface Shape {
  readonly base?: string;
  readonly baseChangedAt?: string;
  readonly committedAt?: string;
  readonly reopenedAt?: string;
  readonly noteCheckAt?: string;
  readonly draft?: boolean;
  readonly inQueue?: boolean;
}

/** The required job's name, which the repository's own copy shares. */
const noteCheckName = "Decision note and the guard's own paths";

function check(name: string, startedAt: string) {
  return { name, status: "COMPLETED", conclusion: "SUCCESS", startedAt };
}

function openNode(shape: Shape) {
  const contexts = [check("ci-ok", "2026-11-22T10:12:00Z")];
  if (shape.noteCheckAt !== undefined) {
    contexts.push(check(noteCheckName, shape.noteCheckAt));
  }
  return {
    number: 5007,
    url: `https://github.com/${repo}/pull/5007`,
    isDraft: shape.draft === true,
    mergeable: "MERGEABLE",
    updatedAt: "2026-11-22T10:17:30Z",
    isInMergeQueue: shape.inQueue === true,
    headRefName: "tomas/HAL-16026-02-seats",
    headRefOid: head,
    baseRefName: shape.base ?? "main",
    headRepository: { nameWithOwner: repo },
    labels: { nodes: [] },
    timelineItems: { nodes: [] },
    baseChanges: {
      nodes: shape.baseChangedAt === undefined ? [] : [{ createdAt: shape.baseChangedAt }],
    },
    reopens: {
      nodes: shape.reopenedAt === undefined ? [] : [{ createdAt: shape.reopenedAt }],
    },
    commits: {
      nodes: [
        {
          commit: {
            committedDate: shape.committedAt ?? "2026-11-22T10:05:00Z",
            statusCheckRollup: {
              contexts: { pageInfo: { hasNextPage: false }, nodes: contexts },
            },
          },
        },
      ],
    },
    reviews: { nodes: [] },
    comments: { nodes: [] },
  };
}

function page(nodes: readonly unknown[]) {
  return { pageInfo: { hasNextPage: false, endCursor: null }, nodes };
}

const notCalled = async (): Promise<never> => {
  throw new Error("not expected for an open pull request");
};

/** A check the rollup cut off: REST finds none either. */
const noneByRest = async () => "missing" as const;

async function factsOf(shape: Shape) {
  const query: GitHubQuery = async (document) =>
    document.includes("query OpenPulls")
      ? {
          repository: {
            defaultBranchRef: { name: "main" },
            mergeQueue: { entries: { nodes: [] } },
            pullRequests: page([openNode(shape)]),
          },
        }
      : { repository: { pullRequests: page([]) } };
  const snapshot = await takeSnapshot({
    query,
    repos: [repo],
    now: new Date("2026-11-22T17:00:00Z"),
    fallback: noneByRest,
  });
  const read = snapshotFacts({ snapshot, query, fallback: notCalled, greenSince: notCalled });
  const facts = await read([{ repo, number: 5007, branch: "tomas/HAL-16026-02-seats" }]);
  return { snapshot, pull: facts.get(`${repo}#5007`) };
}

const task: WatchedTask = {
  id: "task-5007",
  identifier: "HAL-16026",
  assigneeAgentId: "tomas",
  running: false,
  openChildren: false,
};

function memory(reported: readonly string[] = []): Memory {
  return {
    reported: new Set(reported),
    seenUntil: undefined,
    heldAt: undefined,
    lastCommentAt: undefined,
  };
}

async function decision(shape: Shape, reported: readonly string[] = []) {
  const { pull } = await factsOf(shape);
  if (pull === undefined) {
    throw new Error("no facts for #5007");
  }
  return decide(task, "tomas", [pull], memory(reported));
}

const retargeted = {
  noteCheckAt: "2026-11-22T10:09:38Z",
  baseChangedAt: "2026-11-22T10:17:57Z",
} satisfies Shape;

verifies("paperclip.pr-watcher-retargeted", () => {
  test("wakes the author once to reopen a pull request retargeted after its last push", async () => {
    const { snapshot } = await factsOf(retargeted);
    expect(snapshot.repos[0]?.pulls[0]?.open?.baseChangedSincePush).toBe(true);
    const first = await decision(retargeted);
    expect(first.kind).toBe("wake");
    if (first.kind !== "wake") {
      return;
    }
    expect(first.reasons.map((reason) => reason.key)).toEqual([`${repo}#5007 9807761 retargeted`]);
    const message = wakeMessage(first.reasons);
    expect(message).toContain("Close and reopen it (or push a commit)");
    expect(message).toContain("Reopening keeps head `9807761`");
    const again = await decision(
      retargeted,
      first.reasons.map((reason) => reason.key),
    );
    expect(again).toEqual({ kind: "skip", why: "nothing new" });
  });

  test("wakes the author when the repository's note check ran on the base change itself", async () => {
    const onEdited = { ...retargeted, noteCheckAt: "2026-11-22T10:18:04Z" };
    expect((await decision(onEdited)).kind).toBe("wake");
  });

  test("does nothing once the pull request was reopened, force-pushed or given a new commit", async () => {
    const shapes: Shape[] = [
      { ...retargeted, reopenedAt: "2026-11-22T17:49:12Z" },
      { ...retargeted, committedAt: "2026-11-22T17:49:12Z" },
    ];
    for (const shape of shapes) {
      expect(await decision(shape)).toEqual({ kind: "skip", why: "nothing new" });
    }
  });

  test("does nothing for a base other than the default branch, a draft or a queued pull request", async () => {
    const shapes: Shape[] = [
      { ...retargeted, base: "tomas/HAL-16026-01-seats" },
      { ...retargeted, draft: true },
      { ...retargeted, inQueue: true },
      { noteCheckAt: "2026-11-22T10:09:38Z" },
    ];
    for (const shape of shapes) {
      expect(await decision(shape)).toEqual({ kind: "skip", why: "nothing new" });
    }
  });
});
