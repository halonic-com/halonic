/** A check run on a head as GitHub's REST API lists it, in the check suite `suite`. */
export interface RecordedCheckRun {
  readonly name: string;
  readonly conclusion: string | null;
  readonly suite: number;
  readonly startedAt?: string;
}

/** A workflow run on a head, for the check suite `suite`. */
export interface RecordedWorkflowRun {
  readonly name: string;
  readonly suite: number;
  readonly createdAt: string;
  readonly event?: string;
}

/** A green `Guard notes` job, in check suite 1. */
export const guardGreen: RecordedCheckRun = {
  name: "Decision note and the guard's own paths",
  conclusion: "success",
  suite: 1,
};

/** A green `Built-on label` job, in check suite 2. */
export const builtOnGreen: RecordedCheckRun = {
  name: "built-on-label",
  conclusion: "success",
  suite: 2,
};

/** The `Guard notes` workflow run of check suite 1. */
export const guardRun: RecordedWorkflowRun = {
  name: "Guard notes",
  suite: 1,
  createdAt: "2026-11-21T20:00:00Z",
};

/** The `Built-on label` workflow run of check suite 2. */
export const builtOnRun: RecordedWorkflowRun = {
  name: "Built-on label",
  suite: 2,
  createdAt: "2026-11-21T20:00:00Z",
};

/** Green `Guard notes` and `Built-on label` runs on a head, as #4605 had. */
export const greenRequired = {
  checkRuns: [guardGreen, builtOnGreen],
  workflowRuns: [guardRun, builtOnRun],
};

/**
 * The answers `pr_status` reads for the required workflows (HAL-19031): the
 * head's check runs, its workflow runs and the pull request's issue events.
 */
export function requiredAnswers(
  repo: string,
  number: number,
  head: string,
  recorded: {
    readonly checkRuns: readonly RecordedCheckRun[];
    readonly workflowRuns: readonly RecordedWorkflowRun[];
    readonly baseChangedAt?: readonly string[];
  } = greenRequired,
): Record<string, unknown> {
  return {
    [`/repos/${repo}/commits/${head}/check-runs?per_page=100&page=1`]: {
      check_runs: recorded.checkRuns.map((run) => ({
        name: run.name,
        status: run.conclusion === null ? "in_progress" : "completed",
        conclusion: run.conclusion,
        started_at: run.startedAt ?? "2026-11-21T20:00:10Z",
        html_url: `https://github.com/${repo}/runs/${run.suite}`,
        check_suite: { id: run.suite },
      })),
    },
    [`/repos/${repo}/actions/runs?head_sha=${head}&per_page=100`]: {
      workflow_runs: recorded.workflowRuns.map((run) => ({
        name: run.name,
        check_suite_id: run.suite,
        event: run.event ?? "pull_request",
        created_at: run.createdAt,
      })),
    },
    [`/repos/${repo}/issues/${number}/events?per_page=100&page=1`]: [
      { event: "labeled", created_at: "2026-11-21T19:00:00Z" },
      ...(recorded.baseChangedAt ?? []).map((at) => ({
        event: "base_ref_changed",
        created_at: at,
      })),
    ],
  };
}
