import type {
  MergeQueue,
  PullRequest,
  PullRequestEvent,
  TeamStatus,
  TeamStatusParts,
} from "@halonicjs/ports";
import { loadPullRequestsScreen } from "@halonicjs/studio-feature-team/api";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

/*
 * The Pull requests screen (HAL-17515 P1–P10) from a made-up repo: stuck PRs, one with a very long
 * title, some coming up, a merge queue and two merged today. `?state=` picks what the reads answer:
 * `attention` (P1, the default), `old` (P7, a snapshot 43 min old), `loading` (P9), `failed` (the
 * first read fails), `no-snapshot` (P8), `no-access` (P10), `runners-busy` (P20) and `queue-empty`
 * (P22). The spec presses All open (P4), Queue (P18) and Merged today (P6) itself. The clock is
 * fixed at 24 Nov 13:00 UTC, so the times never change.
 */

const now = new Date("2026-11-24T13:00:00.000Z");
const source = "acme-paperclip";
const state = new URLSearchParams(location.search).get("state") ?? "attention";
const asOf = state === "old" ? "2026-11-24T12:17:00.000Z" : "2026-11-24T12:57:00.000Z";
const agent = (name: string) => ({ kind: "agent" as const, agent: `acme-${name}`, name });
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();

function pullRequest(number: number, title: string, rest: Partial<PullRequest>): PullRequest {
  return {
    id: `pr-${number}`,
    source,
    repo: "acme",
    label: `#${number}`,
    title,
    author: agent("Ravi"),
    work: `task-${number}`,
    state: "waiting-for-review",
    since: minutesAgo(30),
    fastTrack: false,
    ...rest,
  };
}

/** A PR whose branch names no task, so its row says so and offers GitHub. */
function withoutTask(pullRequest: PullRequest): PullRequest {
  const { work, ...rest } = pullRequest;
  return rest;
}

const open: PullRequest[] = [
  pullRequest(
    5644,
    "fix(studio-feature-team): keep the seat rows readable when a seat label is very long and the window is narrow, without cutting the title",
    {
      author: agent("Priya"),
      state: "conflicting",
      since: minutesAgo(300),
    },
  ),
  pullRequest(5641, "feat(inbox): bundle cards and show waiting time", {
    state: "failing",
    reason: "typecheck",
    since: minutesAgo(120),
  }),
  pullRequest(5602, "fix(seats): reset group rule", {
    author: agent("Priya"),
    reviewer: agent("Liam"),
    since: minutesAgo(6 * 60),
    fastTrack: true,
  }),
  pullRequest(5590, "docs(guide): failure path", {
    author: agent("Nina"),
    state: "approval-outdated",
    since: minutesAgo(40),
  }),
  pullRequest(5650, "feat(assistant): proposal card", {
    author: agent("Elena"),
    state: "in-queue",
    queue: { position: 1, group: 1 },
  }),
  pullRequest(5651, "fix(cli): quieter test output", {
    author: agent("Owen"),
    state: "in-queue",
    queue: { position: 2, group: 2 },
    fastTrack: true,
  }),
  pullRequest(5652, "docs(guide): merge queue", {
    author: agent("Mara"),
    state: "in-queue",
    queue: { position: 3, group: 2 },
  }),
  pullRequest(5653, "feat(team): seat rows", {
    author: agent("Priya"),
    state: "in-queue",
    queue: { position: 4 },
    since: minutesAgo(31),
  }),
  pullRequest(5655, "feat(inbox): notice order", {
    author: agent("Kim"),
    state: "dequeued",
    reason: "group failed",
    since: minutesAgo(20),
  }),
  pullRequest(5647, "fix(ui): focus ring on chips", {
    author: agent("Elena"),
    state: "approved",
  }),
  withoutTask(
    pullRequest(5672, "chore: bump fixtures", {
      author: agent("Kim"),
      state: "draft",
      since: minutesAgo(2 * 24 * 60),
      webLink: "https://github.com/acme/acme/pull/5672",
    }),
  ),
];

const recent: PullRequest[] = [
  pullRequest(5630, "fix(engine): resume after sleep", {
    author: agent("Owen"),
    state: "merged",
    since: minutesAgo(160),
  }),
  pullRequest(5638, "feat(studio): Team sidebar group", {
    author: agent("Elena"),
    state: "merged",
    since: minutesAgo(40),
  }),
];

const busy = state === "runners-busy";
const queue: MergeQueue =
  state === "queue-empty"
    ? { source, repo: "acme", asOf, health: "empty", groups: [], waiting: [], removedToday: [] }
    : {
        source,
        repo: "acme",
        asOf,
        health: busy ? "runners-busy" : "running",
        runnerWaitMinutes: busy ? 12 : 0,
        medianMinutesToMerge: 22,
        groups: [
          { position: 1, state: "passed", since: minutesAgo(14), pullRequests: ["pr-5650"] },
          {
            position: 2,
            state: "building",
            since: minutesAgo(9),
            pullRequests: ["pr-5651", "pr-5652"],
          },
        ],
        waiting: ["pr-5653"],
        removedToday: [
          { pullRequest: "pr-5655", at: minutesAgo(20), reason: "Group failed: typecheck" },
        ],
      };

const never = new Promise<never>(() => {});

/** What `parts` answers for each state: the first read hangs, fails, or names what's served. */
async function parts(): Promise<readonly TeamStatusParts[]> {
  if (state === "loading") return never;
  if (state === "failed") throw new Error("Paperclip didn't answer (made up for the screenshot).");
  const pullRequests = state !== "no-access";
  return [{ source, spend: false, seats: false, pullRequests }];
}

const team: TeamStatus = {
  parts,
  spend: async () => [],
  agentSpend: async () => [],
  seats: async () => [],
  pullRequests: async () =>
    state === "no-snapshot" ? [] : [{ source, repo: "acme", asOf, open, recent }],
  // A PR's own page, with a short timeline, for the `detail` screenshot (HAL-19765).
  pullRequest: async (id) => {
    const found = open.find((each) => each.id === id);
    if (found === undefined) return undefined;
    const timeline: PullRequestEvent[] = [
      { kind: "out-of-draft", text: "Out of draft", at: minutesAgo(150) },
      { kind: "check-failed", text: "typecheck failed", at: minutesAgo(120) },
    ];
    return { asOf, pullRequest: { ...found, changedLines: 312 }, timeline };
  },
  mergeQueue: async () => [queue],
  changes: async function* () {},
};

/** Draws the screen once the feature's code has loaded. */
async function show(): Promise<void> {
  const { PullRequestsPage, PullRequests } = await loadPullRequestsScreen();
  const pullRequests = new PullRequests(team, undefined, { now: () => now, timeZone: "UTC" });
  const opener = { connectionOrigin: "https://paperclip.acme.test", open: () => {} };
  const root = document.getElementById("root");
  if (root === null) throw new Error("The page has no #root.");
  createRoot(root).render(
    <StrictMode>
      <PullRequestsPage pullRequests={pullRequests} opener={opener} onLink={() => {}} />
    </StrictMode>,
  );
}

show().catch((error: unknown) => {
  console.error("The Pull requests page couldn't be drawn:", error);
});
