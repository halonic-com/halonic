import type { MergeQueue, PullRequest, TeamStatus, TeamStatusParts } from "@halonicjs/ports";
import { loadPullRequestsScreen } from "@halonicjs/studio-feature-team/api";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

/*
 * The Pull requests screen (HAL-17515 P1–P10) from a made-up repo: stuck PRs, one with a very long
 * title, and two coming up. `?state=` picks what the reads answer: `attention` (P1, the default),
 * `old` (P7, a snapshot 43 min old), `loading` (P9), `failed` (the first read fails),
 * `no-snapshot` (P8) and `no-access` (P10). The spec presses All open itself (P4). The clock is
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

const queue: MergeQueue = {
  source,
  repo: "acme",
  asOf,
  health: "running",
  groups: [{ position: 1, state: "building", since: minutesAgo(9), pullRequests: ["pr-5650"] }],
  waiting: [],
  removedToday: [],
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
    state === "no-snapshot" ? [] : [{ source, repo: "acme", asOf, open, recent: [] }],
  pullRequest: async () => undefined,
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
