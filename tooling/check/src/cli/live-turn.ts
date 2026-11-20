import { setTimeout as sleep } from "node:timers/promises";
import {
  type JobState,
  longestWaitMs,
  type TurnResult,
  type UnfinishedRun,
  waitForTurn,
} from "../lib/live-turn.ts";

/**
 * Waits for this run's turn on the live test account (HAL-13840): the
 * live-cloud job runs it before the account probe, with `actions: read`.
 *
 *   GH_TOKEN=… GITHUB_REPOSITORY=owner/repo GITHUB_RUN_ID=… node tooling/check/src/cli/live-turn.ts
 *
 * After the longest wait, or when GitHub can't be read, it warns and lets the
 * run go ahead, as before.
 */

/** A GET on GitHub's REST API, for a path below the API root; returns the parsed body. */
export type GitHubGet = (path: string) => Promise<unknown>;

/** A GET through `fetch` with the token; fails on any answer but 200. */
export function gitHubGet(
  token: string,
  apiBase: string,
  fetchImpl: typeof fetch = fetch,
): GitHubGet {
  return async (path) => {
    const response = await fetchImpl(`${apiBase}${path}`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status !== 200) {
      throw new Error(`GitHub answered ${response.status} for GET ${path}.`);
    }
    return response.json();
  };
}

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/**
 * The live-cloud workflow's unfinished runs, in one call: the newest 100 runs,
 * keeping those whose status isn't `completed` (queued, waiting, requested,
 * pending and in progress alike). A run still unfinished is always among them.
 */
export async function unfinishedLiveRuns(
  get: GitHubGet,
  repository: string,
): Promise<UnfinishedRun[]> {
  const body = await get(`/repos/${repository}/actions/workflows/live-cloud.yml/runs?per_page=100`);
  const runs: UnfinishedRun[] = [];
  for (const run of list(field(body, "workflow_runs"))) {
    const id = field(run, "id");
    const attempt = field(run, "run_attempt");
    if (typeof id === "number" && field(run, "status") !== "completed") {
      runs.push({ id, attempt: typeof attempt === "number" ? attempt : 1 });
    }
  }
  return runs;
}

/** The jobs of a run's latest attempt, with their steps' names and statuses. */
export async function runJobs(
  get: GitHubGet,
  repository: string,
  runId: number,
): Promise<JobState[]> {
  const body = await get(
    `/repos/${repository}/actions/runs/${runId}/jobs?filter=latest&per_page=100`,
  );
  return list(field(body, "jobs")).map((job) => ({
    name: String(field(job, "name")),
    status: String(field(job, "status")),
    steps: list(field(job, "steps")).map((step) => ({
      name: String(field(step, "name")),
      status: String(field(step, "status")),
    })),
  }));
}

/** The line the job prints when the wait ends; a warning when it went ahead without its turn. */
export function turnReport(result: TurnResult): string {
  const waitedMinutes = Math.round(result.waitedMs / 60_000);
  if (result.outcome === "turn") {
    return `live-turn: the account is free after ${waitedMinutes} min; going ahead.`;
  }
  if (result.outcome === "unreadable") {
    return `::warning title=Live cloud turn::Couldn't read the other live-cloud runs (${result.error ?? "no reason given"}); going ahead without its turn after ${waitedMinutes} min, so D1 may refuse work under the load (HAL-13840).`;
  }
  return `::warning title=Live cloud turn::Waited ${longestWaitMs / 60_000} min for run(s) ${result.ahead.join(", ")}; going ahead anyway, so D1 may refuse work under the load (HAL-13840).`;
}

if (import.meta.main) {
  const token = process.env["GH_TOKEN"] ?? "";
  const repository = process.env["GITHUB_REPOSITORY"] ?? "";
  const runId = Number(process.env["GITHUB_RUN_ID"]);
  if (token === "" || repository === "" || !Number.isInteger(runId)) {
    console.error(
      "live-turn: set GH_TOKEN, GITHUB_REPOSITORY and GITHUB_RUN_ID (the live-cloud job sets them).",
    );
    process.exitCode = 2;
  } else {
    const get = gitHubGet(token, process.env["GITHUB_API_URL"] ?? "https://api.github.com");
    const result = await waitForTurn(runId, {
      unfinishedRuns: () => unfinishedLiveRuns(get, repository),
      jobs: (otherRunId) => runJobs(get, repository, otherRunId),
      sleep: (milliseconds) => sleep(milliseconds),
      now: () => Date.now(),
      log: (line) => console.log(line),
    });
    console.log(turnReport(result));
  }
}
