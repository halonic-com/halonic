import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { readSettings } from "../plugin/job.ts";
import { type PullDetails, shownTitle, titleText } from "../pr-tools/pr-status.ts";
import { githubApprovals } from "../snapshot/github-approvals.ts";
import type { GitHubQuery } from "../snapshot/graphql.ts";
import { type CheckFallback, takeSnapshot } from "../snapshot/read.ts";
import type { OpenFacts, Snapshot, SnapshotPull } from "../snapshot/shape.ts";
import { snapshotFacts } from "./facts.ts";
import { agents, fakeGitHub, fakePaperclip, task } from "./fakes.test-helper.ts";
import { tick } from "./watch.ts";

/** The PR watcher on `cloud` (HAL-17730), from snapshots shaped like cloud#102 and #103. */

const cloud = "halonic-com/cloud";
const halonic = "halonic-com/halonic";
const head = "2bcdd20e58070669f38b2a92295163447f5b3c30";
const older = "a137ca8b0e4c1f2a3b4c5d6e7f8091a2b3c4d5e6";
const branch = "mateo/HAL-103-owner-actions";

const noFallback: CheckFallback = async () => {
  throw new Error("no fallback expected");
};

/** An open pull request's facts: green, mergeable, Liam's signed approval on an older head, a GitHub approval on the head. */
function openFacts(extra: Partial<OpenFacts> = {}): OpenFacts {
  return {
    draft: false,
    mergeable: "yes",
    ciOk: "success",
    draftCiOk: "missing",
    inQueue: false,
    labels: [],
    finding: null,
    approvals: [{ by: "Liam", head: older.slice(0, 8) }],
    githubApprovals: [{ by: "acme-reviewer", head }],
    ...extra,
  };
}

function pull(repo: string, number: number, extra: Partial<SnapshotPull> = {}): SnapshotPull {
  return {
    number,
    url: `https://github.com/${repo}/pull/${number}`,
    state: "open",
    branch,
    headRepo: repo,
    base: "main",
    head,
    updatedAt: "2026-11-24T18:09:52Z",
    mergedAt: null,
    mergeCommit: null,
    open: openFacts(),
    ...extra,
  };
}

/** `ci-ok` passed on every merge commit asked about. */
const greenMergeCommit: GitHubQuery = async () => ({
  repository: {
    c0: {
      statusCheckRollup: {
        contexts: {
          pageInfo: { hasNextPage: false },
          nodes: [{ name: "ci-ok", status: "COMPLETED", conclusion: "SUCCESS", startedAt: null }],
        },
      },
    },
  },
});

/** One watcher pass over a snapshot of `repo` holding `snapshotPull`, for Mateo's task of the same number. */
function watcher(repo: string, snapshotPull: SnapshotPull) {
  const { number } = snapshotPull;
  const paperclip = fakePaperclip([
    { ...task(number, agents.mateo), pulls: [{ repo, number, branch }] },
  ]);
  const snapshot: Snapshot = {
    version: 1,
    takenAt: "2026-11-24T18:20:00Z",
    closedWindowDays: 3,
    repos: [{ repo, defaultBranch: "main", queue: [], pulls: [snapshotPull] }],
  };
  const run = () =>
    tick({
      paperclip: paperclip.paperclip,
      discover: paperclip.discover,
      facts: snapshotFacts({
        snapshot,
        query: greenMergeCommit,
        fallback: noFallback,
        greenSince: async () => false,
      }),
      dryRun: false,
      log: () => undefined,
      now: new Date("2026-11-24T18:20:00Z"),
      route: async () => ({ reviewer: "liam", security: false }),
    });
  const bodies = () => (paperclip.comments[`task-${number}`] ?? []).map(({ body }) => body);
  return { ...paperclip, run, bodies };
}

/** A GraphQL answer with no pull requests, for both snapshot queries. */
const emptyRepository = {
  repository: {
    defaultBranchRef: { name: "main" },
    mergeQueue: null,
    pullRequests: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
  },
};

/** A GitHub whose token reaches only `halonic`; another failure for `failing`. */
function tokenForHalonicOnly(failing = ""): GitHubQuery {
  return async (_document, variables) => {
    const name = `${variables["owner"]}/${variables["name"]}`;
    if (name === failing) {
      throw new Error("GitHub: the GraphQL query answered 502: Bad gateway.");
    }
    if (name !== halonic) {
      throw new Error(
        `GitHub: the GraphQL query answered 200: Could not resolve to a Repository with the name '${name}'.`,
      );
    }
    return emptyRepository;
  };
}

verifies("paperclip.pr-watcher-cloud", () => {
  test("wakes the author once to merge a cloud pull request approved on GitHub, and hands it to nobody", async () => {
    const cloudWatcher = watcher(cloud, pull(cloud, 103));
    expect(await cloudWatcher.run()).toMatchObject({ woken: 1, handedOff: 0, failed: [] });
    expect(await cloudWatcher.run()).toMatchObject({ woken: 0, handedOff: 0 });
    expect(cloudWatcher.wakes).toEqual([
      { taskId: "task-103", key: `${cloud}#103 2bcdd20 approved on GitHub` },
    ]);
    expect(cloudWatcher.bodies()[0]).toContain(
      "it has an approving GitHub review on its head `2bcdd20`, which its base branch needs.",
    );
    expect(cloudWatcher.handoffs).toEqual([]);
  });

  test("doesn't count a GitHub approval on halonic, where only signed approvals count", async () => {
    const halonicWatcher = watcher(halonic, pull(halonic, 103));
    await halonicWatcher.run();
    expect(halonicWatcher.wakes).toEqual([]);
    expect(halonicWatcher.handoffs.map(({ to }) => to)).toEqual([agents.liam]);
  });

  test("doesn't ask to merge after a push voided the approval, or while it's a draft", async () => {
    const pushed = watcher(
      cloud,
      pull(cloud, 103, {
        open: openFacts({ githubApprovals: [{ by: "acme-reviewer", head: older }] }),
      }),
    );
    await pushed.run();
    expect(pushed.wakes).toEqual([]);
    expect(pushed.bodies().filter((body) => body.includes("pushed after approval"))).toHaveLength(
      1,
    );
    const draft = watcher(cloud, pull(cloud, 103, { open: openFacts({ draft: true }) }));
    await draft.run();
    expect(draft.wakes).toEqual([]);
  });

  test("marks the task done once its cloud pull request merged with a green ci-ok", async () => {
    const merged = watcher(
      cloud,
      pull(cloud, 102, {
        state: "merged",
        open: null,
        mergedAt: "2026-11-23T20:34:37Z",
        mergeCommit: "58888a27564eb9240533a64222fdc7b085998735",
      }),
    );
    expect(await merged.run()).toMatchObject({ done: 1, failed: [] });
    expect(merged.done).toEqual(["task-102"]);
  });

  test("records only standing approvals by accounts other than the shared one, from the organization", () => {
    const by = (login: string | null, state: string, authorAssociation = "MEMBER") => ({
      state,
      authorAssociation,
      commit: { oid: head },
      author: login === null ? null : { login },
    });
    expect(
      githubApprovals([
        by("acme-reviewer", "APPROVED"),
        by("halonic-dev", "APPROVED"),
        by("acme-stranger", "APPROVED", "NONE"),
        by("acme-dismissed", "DISMISSED"),
        by("acme-changed", "APPROVED"),
        by("acme-changed", "CHANGES_REQUESTED"),
        by("acme-second", "CHANGES_REQUESTED"),
        by("acme-second", "APPROVED"),
        by("acme-second", "COMMENTED"),
        by(null, "APPROVED"),
      ]),
    ).toEqual([
      { by: "acme-reviewer", head },
      { by: "acme-second", head },
    ]);
  });

  test("leaves out a repository after the first that the token doesn't reach, and fails on anything else", async () => {
    const unread: string[] = [];
    const now = new Date("2026-11-24T18:20:00Z");
    const snapshot = await takeSnapshot({
      token: "shared",
      query: tokenForHalonicOnly(),
      repos: [halonic, cloud],
      now,
      fallback: noFallback,
      unread: (repo) => unread.push(repo),
    });
    expect(snapshot.repos.map(({ repo }) => repo)).toEqual([halonic]);
    expect(unread).toEqual([cloud]);
    const first = {
      token: "shared" as const,
      query: tokenForHalonicOnly(),
      repos: [cloud, halonic],
      now,
    };
    await expect(takeSnapshot({ ...first, fallback: noFallback })).rejects.toThrow(
      "Could not resolve to a Repository",
    );
    const broken = {
      token: "shared" as const,
      query: tokenForHalonicOnly(cloud),
      repos: [halonic, cloud],
      now,
    };
    await expect(takeSnapshot({ ...broken, fallback: noFallback })).rejects.toThrow("502");
  });

  test("leaves out a repository after the first whose checks the token doesn't reach (HAL-17883)", async () => {
    // A token with pull request access on cloud but no checks access: GitHub
    // answers 200 with `errors` on every head's `statusCheckRollup`.
    const checksForbidden: GitHubQuery = async (document, variables) => {
      if (variables["name"] !== "cloud") {
        return tokenForHalonicOnly()(document, variables);
      }
      throw new Error(
        "GitHub: the GraphQL query answered 200: Resource not accessible by personal access token.",
      );
    };
    const unread: string[] = [];
    const now = new Date("2026-11-24T19:50:00Z");
    const snapshot = await takeSnapshot({
      token: "shared",
      query: checksForbidden,
      repos: [halonic, cloud],
      now,
      fallback: noFallback,
      unread: (repo) => unread.push(repo),
    });
    expect(snapshot.repos.map(({ repo }) => repo)).toEqual([halonic]);
    expect(unread).toEqual([cloud]);
  });

  test("keeps and shows no title of a private repository's pull request", async () => {
    const privateTitle = "feat: acme private plan";
    const query: GitHubQuery = async (document) =>
      document.includes("ClosedPulls")
        ? {
            repository: {
              pullRequests: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [
                  {
                    number: 102,
                    url: `https://github.com/${cloud}/pull/102`,
                    title: privateTitle,
                    state: "MERGED",
                    updatedAt: "2026-11-24T18:00:00Z",
                    mergedAt: "2026-11-24T18:00:00Z",
                    headRefName: branch,
                    headRefOid: head,
                    baseRefName: "main",
                    headRepository: { nameWithOwner: cloud },
                    mergeCommit: { oid: older },
                  },
                ],
              },
            },
          }
        : { repository: { ...emptyRepository.repository, isPrivate: true } };
    const snapshot = await takeSnapshot({
      token: "shared",
      query,
      repos: [cloud],
      now: new Date("2026-11-24T18:20:00Z"),
      fallback: noFallback,
    });
    expect(snapshot.repos[0]?.pulls.map(({ number }) => number)).toEqual([102]);
    expect(JSON.stringify(snapshot)).not.toContain(privateTitle);
    const details = (isPrivate: boolean): PullDetails => ({
      html_url: `https://github.com/${cloud}/pull/103`,
      title: privateTitle,
      state: "open",
      merged_at: null,
      mergeable: true,
      head: { sha: head, ref: branch, repo: { full_name: cloud } },
      base: { ref: "main", repo: { private: isPrivate } },
    });
    expect(shownTitle(details(true))).toBeUndefined();
    expect(shownTitle(details(false))).toBe(privateTitle);
    expect(titleText(undefined)).toBe("title not shown (private repository)");
  });

  test("watches halonic and cloud when no repos are set", () => {
    expect(readSettings({}).repos).toEqual([halonic, cloud]);
  });
});
