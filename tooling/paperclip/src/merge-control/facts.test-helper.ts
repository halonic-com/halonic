import type { PullNode, RollupRun } from "./facts-query.ts";
import type { RestRun } from "./facts-runs.ts";
import { ago, headOf, now } from "./merge-control.test-helper.ts";

/**
 * Recorded GitHub and CI server answers for the facts reader's tests, in
 * the shapes GitHub gave on 24 Nov, with invented pull requests, runs and
 * logins. `answerFor` plays GitHub: it answers each request from these,
 * and a request it has no answer for gets a 404.
 */

export const repo = "halonic-com/halonic";
export const merger = "acme-merger";
export const statusUrl = "http://ci-status.acme.test/ci-status.json";
export const prometheusUrl = "http://prometheus.acme.test:9090";

/** A check run on a head, as the rollup gives it. */
export function checkRun(
  name: string,
  workflow: string,
  extra: { run?: number; job?: number; conclusion?: string; status?: string; event?: string } = {},
): RollupRun {
  const run = extra.run ?? 900;
  const job = extra.job ?? 5000 + name.length;
  return {
    databaseId: job,
    name,
    status: extra.status ?? "COMPLETED",
    conclusion: extra.conclusion ?? "SUCCESS",
    startedAt: ago(50),
    detailsUrl: `https://github.com/${repo}/actions/runs/${run}/job/${job}`,
    checkSuite: {
      status: "COMPLETED",
      workflowRun: {
        databaseId: run,
        event: extra.event ?? "pull_request",
        createdAt: ago(55),
        workflow: { name: workflow },
      },
    },
  };
}

function greenRuns(number: number): RollupRun[] {
  return [
    checkRun("ci-ok", "CI", { run: 9000 + number, job: 100 * number + 1 }),
    checkRun("Lint", "CI", { run: 9000 + number, job: 100 * number + 2 }),
    checkRun("guard", "Guard notes", { run: 9100 + number }),
    checkRun("label", "Built-on label", { run: 9200 + number }),
  ];
}

/** An open pull request Liam approved on its head after its last push, all green. */
export function pullNode(number: number, changes: Partial<PullNode> = {}): PullNode {
  const head = changes.headRefOid ?? headOf(number);
  return {
    id: `PR_${number}`,
    number,
    title: `feat(tools): thing ${number} (HAL-${number})`,
    createdAt: ago(600),
    isDraft: false,
    isCrossRepository: false,
    isInMergeQueue: false,
    headRefName: `mateo/HAL-${number}-thing`,
    headRefOid: head,
    baseRefName: "main",
    headRepositoryOwner: { login: "halonic-com" },
    additions: 30,
    deletions: 10,
    changedFiles: 1,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    labels: { nodes: [{ name: "built-on:paperclip" }] },
    files: {
      nodes: [
        {
          path: `packages/core/thing-${number}/src/a.ts`,
          additions: 30,
          deletions: 10,
          changeType: "MODIFIED",
        },
      ],
    },
    timelineItems: { nodes: [] },
    commits: {
      nodes: [
        {
          commit: {
            committedDate: ago(90),
            statusCheckRollup: { contexts: { nodes: greenRuns(number) } },
          },
        },
      ],
    },
    reviews: { nodes: [] },
    comments: {
      nodes: [
        {
          body: `Liam: approved on head \`${head.slice(0, 7)}\``,
          createdAt: ago(40),
          author: { login: "halonic-dev" },
        },
      ],
    },
    ...changes,
  };
}

/** A workflow run as the REST API lists it. */
export function restRun(id: number, extra: Partial<RestRun> = {}): RestRun {
  return {
    id,
    name: "CI",
    event: "merge_group",
    head_sha: `group-${id}`,
    head_branch: `gh-readonly-queue/main/pr-${id}-${headOf(id)}`,
    status: "completed",
    conclusion: "success",
    created_at: ago(30),
    updated_at: ago(20),
    run_attempt: 1,
    triggering_actor: { login: "halonic-dev" },
    html_url: `https://github.com/${repo}/actions/runs/${id}`,
    ...extra,
  };
}

const flakeLine =
  "The merge base's tests job ended as cancelled (a time-out, or a failed walk-back), so its results are incomplete. Rerun the failed jobs.";

/** #103: fast-track, approved, its `ci-ok` red from a cancelled base run. */
function redFastTrack(): PullNode {
  const runs = greenRuns(103).map((run) =>
    run.name === "ci-ok"
      ? checkRun("ci-ok", "CI", { run: 9103, job: 10301, conclusion: "FAILURE" })
      : run,
  );
  return pullNode(103, {
    labels: { nodes: [{ name: "built-on:paperclip" }, { name: "fast-track" }] },
    timelineItems: {
      nodes: [
        {
          __typename: "LabeledEvent",
          createdAt: ago(100),
          label: { name: "fast-track" },
          actor: { login: merger },
        },
      ],
    },
    commits: {
      nodes: [
        { commit: { committedDate: ago(90), statusCheckRollup: { contexts: { nodes: runs } } } },
      ],
    },
  });
}

/** The open pull requests: #101 ready, #102 and #106 queued (#102 jumped), #103 a red fast-track, #104 unlabelled. */
export function openPulls(): PullNode[] {
  return [
    pullNode(101),
    pullNode(102, {
      isInMergeQueue: true,
      files: {
        nodes: [
          {
            path: "packages/acme/package.json",
            additions: 1,
            deletions: 1,
            changeType: "MODIFIED",
          },
        ],
      },
      timelineItems: {
        nodes: [
          { __typename: "HeadRefForcePushedEvent", createdAt: ago(200) },
          { __typename: "BaseRefChangedEvent", createdAt: ago(300) },
          { __typename: "AddedToMergeQueueEvent", createdAt: ago(5), actor: { login: merger } },
        ],
      },
    }),
    redFastTrack(),
    pullNode(104, {
      labels: { nodes: [] },
      timelineItems: {
        nodes: [
          {
            __typename: "RemovedFromMergeQueueEvent",
            createdAt: ago(15),
            actor: { login: merger },
          },
        ],
      },
      comments: {
        nodes: [{ body: "Taken out: conflict.", createdAt: ago(15), author: { login: merger } }],
      },
    }),
    pullNode(106, { isInMergeQueue: true }),
  ];
}

const queueRollup = {
  contexts: {
    nodes: [
      { status: "QUEUED", startedAt: ago(0.5) },
      { status: "IN_PROGRESS", startedAt: ago(8) },
    ],
  },
};

/** The first page's queue: #102 at the front though queued after #106. */
export const queueNodes = [
  {
    position: 1,
    state: "AWAITING_CHECKS",
    enqueuedAt: ago(5),
    enqueuer: { login: merger },
    pullRequest: { number: 102 },
    headCommit: { oid: "group-102", statusCheckRollup: queueRollup },
  },
  {
    position: 2,
    state: "AWAITING_CHECKS",
    enqueuedAt: ago(30),
    enqueuer: { login: "halonic-dev" },
    pullRequest: { number: 106 },
    headCommit: { oid: "group-106", statusCheckRollup: null },
  },
];

/** Merge-group runs of the last day: a failed group, a stale queued one, a rerun by the Merger, a cancelled one. */
export function groupRuns(cancelledStatus: "queued" | "completed" = "completed"): RestRun[] {
  return [
    restRun(7001, { conclusion: "failure", created_at: ago(60) }),
    restRun(7002, {
      status: "queued",
      conclusion: null,
      head_sha: "group-gone",
      created_at: ago(10),
    }),
    restRun(7003, { run_attempt: 2, triggering_actor: { login: merger }, run_started_at: ago(25) }),
    restRun(7004, {
      status: cancelledStatus,
      conclusion: cancelledStatus === "queued" ? null : "cancelled",
      created_at: ago(50),
      updated_at: ago(10),
    }),
  ];
}

function base64(text: string): string {
  return btoa(text);
}

/** The CI server's two sources, fresh. */
export function capacityAnswers(): Record<string, unknown> {
  const seconds = Math.floor(now.getTime() / 1000);
  return {
    [statusUrl]: {
      schema: 1,
      ok: true,
      generated_at: seconds - 30,
      slots: [
        { slot: "1", label: "halonic-ci-large", unit: "active", busy: false, runner: "hci-1" },
        { slot: "2", label: "halonic-ci-large", unit: "active", busy: true, runner: "hci-2" },
        { slot: "3", label: "halonic-ci-fast", unit: "active", busy: false, runner: "hci-3" },
      ],
    },
    [`${prometheusUrl}/api/v1/query`]: {
      status: "success",
      data: {
        result: [
          {
            metric: { __name__: "halonic_ci_live_jobs_waiting", runner: "halonic-ci-fast" },
            value: [seconds, "2"],
          },
          {
            metric: { __name__: "halonic_ci_live_updated" },
            value: [seconds, String(seconds - 20)],
          },
        ],
      },
    },
  };
}

/** GitHub's REST answers, by path; list endpoints by path and `event`. */
export function restAnswers(groups: RestRun[] = groupRuns()): Record<string, unknown> {
  const p = `/repos/${repo}`;
  return {
    [`${p}/actions/runs#merge_group`]: { workflow_runs: groups },
    [`${p}/actions/runs#pull_request`]: {
      workflow_runs: [
        restRun(8001, {
          event: "pull_request",
          status: "queued",
          conclusion: null,
          head_sha: "old-head",
          head_branch: "mateo/HAL-101-thing",
        }),
      ],
    },
    [`${p}/actions/workflows/ci.yml/runs#push`]: {
      workflow_runs: [restRun(6001, { event: "push", head_branch: "main" })],
    },
    [`${p}/actions/runs/7001/jobs`]: {
      jobs: [
        {
          id: 71,
          name: "Lint",
          html_url: "https://github.com/jobs/71",
          conclusion: "failure",
          steps: [{ name: "Run lint", conclusion: "failure" }],
        },
        {
          id: 72,
          name: "ci-ok",
          html_url: "https://github.com/jobs/72",
          conclusion: "failure",
          steps: [],
        },
      ],
    },
    [`${p}/actions/runs/9103/jobs`]: {
      jobs: [
        {
          id: 91,
          name: "Tests",
          html_url: "https://github.com/jobs/91",
          conclusion: "failure",
          steps: [{ name: "Set up job", conclusion: "failure" }],
        },
      ],
    },
    // Lint's only failure annotation is the workflow's own: it names no file.
    [`${p}/check-runs/71/annotations`]: [
      {
        path: ".github",
        annotation_level: "failure",
        message: "Process completed with exit code 1.",
      },
      { path: "packages/core/thing-101/src/a.ts", annotation_level: "warning", message: "Unused" },
    ],
    [`${p}/check-runs/10301/annotations`]: [{ message: flakeLine }],
    [`${p}/actions/runs/7004/jobs`]: { jobs: [{ id: 74, conclusion: "cancelled" }] },
    [`${p}/check-runs/74/annotations`]: [{ message: `The run was canceled by @${merger}.` }],
    [`${p}/compare/main...${headOf(102)}`]: {
      merge_base_commit: { sha: "base-102" },
      files: [{ filename: "packages/acme/package.json", status: "modified" }],
    },
    [`${p}/contents/packages/acme/package.json#base-102`]: {
      encoding: "base64",
      content: base64('{"name":"acme","version":"1.0.0"}'),
    },
    [`${p}/contents/packages/acme/package.json#${headOf(102)}`]: {
      encoding: "base64",
      content: base64('{"name":"acme","version":"1.0.0","description":"Acme"}'),
    },
  };
}

/** The key `restAnswers` files a request under. */
export function restKey(url: URL): string {
  const tag = url.searchParams.get("event") ?? url.searchParams.get("ref");
  return tag === null ? url.pathname : `${url.pathname}#${tag}`;
}

/** GitHub's GraphQL answers, by operation. */
export function graphqlAnswer(document: string): unknown {
  if (document.includes("MergeFactsPulls")) {
    return {
      rateLimit: { cost: 2, remaining: 4990 },
      repository: {
        defaultBranchRef: { name: "main", target: { oid: "main-sha" } },
        mergeQueue: { entries: { nodes: queueNodes } },
        pullRequests: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: openPulls() },
      },
    };
  }
  if (document.includes("MergeFactsMerged")) {
    return {
      repository: {
        pullRequests: {
          nodes: [
            { number: 99, mergedAt: ago(45) },
            { number: 98, mergedAt: null },
          ],
        },
      },
    };
  }
  // Main files: every file asked for is 100 lines.
  const count = (document.match(/object\(/g) ?? []).length;
  const text = "export const line = 1;\n".repeat(100);
  return {
    repository: Object.fromEntries(
      Array.from({ length: count }, (_, index) => [`f${index}`, { text, isBinary: false }]),
    ),
  };
}
