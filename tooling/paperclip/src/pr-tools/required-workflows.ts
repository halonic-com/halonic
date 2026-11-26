import { requiredWorkflowProblems, requiredWorkflowsOfRepo } from "../merge-control/checks.ts";
import type { CheckFact } from "../merge-control/snapshot.ts";
import { everyPage, type GitHubGet } from "../pr-watcher/github.ts";
import { requiredJobs } from "../pr-watcher/required-workflows.ts";

/**
 * The gate's required-workflow problems for `pr_status` (HAL-19031), read
 * with GET requests: #6247 and #5953 showed `ci-ok` success while `Guard
 * notes` and `Built-on label` had failed, so their authors called them green.
 * The rule is merge control's own (`requiredWorkflowProblems`); this only
 * builds its input from REST: the head's check runs, joined to their
 * workflow runs by check suite, and the pull request's base changes.
 */

interface RestCheckRun {
  readonly name: string;
  readonly status: string;
  readonly conclusion: string | null;
  readonly started_at: string | null;
  readonly html_url?: string | null;
  readonly check_suite?: { readonly id?: number } | null;
}

interface RestWorkflowRun {
  readonly check_suite_id?: number;
  readonly name?: string | null;
  readonly event?: string;
  readonly created_at?: string;
}

interface RestIssueEvent {
  readonly event?: string;
  readonly created_at?: string;
}

/** Pages of 100 check runs read at most: #5999 had 106. */
const checkPages = 5;

/** The issue events GitHub writes when a pull request's base changes, by hand or after a deleted base. */
const baseChangeEvents: ReadonlySet<string> = new Set([
  "base_ref_changed",
  "automatic_base_change_succeeded",
]);

async function headCheckRuns(get: GitHubGet, repo: string, head: string): Promise<RestCheckRun[]> {
  const runs: RestCheckRun[] = [];
  for (let page = 1; page <= checkPages; page += 1) {
    const body = (await get(
      `/repos/${repo}/commits/${head}/check-runs?per_page=100&page=${page}`,
    )) as { check_runs?: RestCheckRun[] };
    const list = body.check_runs ?? [];
    runs.push(...list);
    if (list.length < 100) {
      break;
    }
  }
  return runs;
}

const statuses: Readonly<Record<string, CheckFact["status"]>> = {
  completed: "completed",
  in_progress: "in_progress",
};

/**
 * A check run as the gate reads it. One whose workflow run isn't listed (an
 * organisation's required workflow may not be) takes its workflow from
 * `requiredJobs` and its run time from its start.
 */
function checkFact(run: RestCheckRun, workflows: ReadonlyMap<number, RestWorkflowRun>): CheckFact {
  const workflow = workflows.get(run.check_suite?.id ?? -1);
  return {
    name: run.name,
    workflow: workflow?.name ?? requiredJobs.get(run.name) ?? "",
    event: workflow?.event ?? "pull_request",
    status: statuses[run.status] ?? "queued",
    conclusion: run.conclusion,
    runCreatedAt: workflow?.created_at ?? run.started_at ?? "",
    startedAt: run.started_at,
    url: run.html_url ?? "",
  };
}

/**
 * What keeps the head out of the merge queue besides `ci-ok`, as the gate
 * says it, such as `Guard notes failure (Decision note and the guard's own
 * paths)`; empty when every required workflow passed after the last retarget.
 */
export async function requiredWorkflowsOf(
  get: GitHubGet,
  repo: string,
  number: number,
  head: string,
): Promise<string[]> {
  const [checkRuns, workflowRuns, events] = await Promise.all([
    headCheckRuns(get, repo, head),
    get(`/repos/${repo}/actions/runs?head_sha=${head}&per_page=100`) as Promise<{
      workflow_runs?: RestWorkflowRun[];
    }>,
    everyPage(get, `/repos/${repo}/issues/${number}/events`) as Promise<RestIssueEvent[]>,
  ]);
  const workflows = new Map(
    (workflowRuns.workflow_runs ?? []).flatMap((run) =>
      run.check_suite_id === undefined ? [] : [[run.check_suite_id, run] as const],
    ),
  );
  return requiredWorkflowProblems(
    {
      checks: checkRuns.map((run) => checkFact(run, workflows)),
      retargetedAt: events.flatMap((event) =>
        baseChangeEvents.has(event.event ?? "") && event.created_at !== undefined
          ? [event.created_at]
          : [],
      ),
    },
    requiredWorkflowsOfRepo(repo),
  );
}
