import {
  type ChangedFile,
  previousPathsOf as namedPreviousPaths,
  readManifests,
} from "../pr-tools/manifests.ts";
import type { GitHubGet } from "../pr-watcher/github.ts";
import { ciOkOf } from "./checks.ts";
import { type BoundedCache, cached } from "./facts-cache.ts";
import type { CiOkRun, FailedJob, GatePull, GroupRun, MainRun, RunFact } from "./snapshot.ts";

/**
 * The facts read from the GitHub Actions REST API, GET only: merge-group
 * runs, queued pull request runs, `main`'s CI runs, a failed run's jobs
 * (with a merge group's failure annotations), a red fast-track head's
 * `ci-ok` run, changed package manifests and renamed files' old paths.
 */

/** A workflow run as the REST API lists it. */
export interface RestRun {
  readonly id: number;
  readonly name: string;
  readonly event: string;
  readonly head_sha: string;
  readonly head_branch: string | null;
  readonly status: string;
  readonly conclusion: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly run_attempt?: number;
  readonly run_started_at?: string;
  readonly triggering_actor?: { readonly login: string } | null;
  readonly html_url: string;
}

interface RestJob {
  readonly id: number;
  readonly name: string;
  readonly html_url: string | null;
  readonly conclusion: string | null;
  readonly run_attempt?: number;
  readonly steps?: readonly { readonly name: string; readonly conclusion: string | null }[];
}

/** The longest a run list is read, in pages of 100. */
export const runPagesMax = 10;

/** Every run a list query finds, newest first, up to `runPagesMax` pages. */
export async function listRuns(get: GitHubGet, repo: string, query: string): Promise<RestRun[]> {
  const runs: RestRun[] = [];
  for (let page = 1; page <= runPagesMax; page += 1) {
    const body = (await get(`/repos/${repo}/actions/runs?${query}&per_page=100&page=${page}`)) as {
      workflow_runs?: RestRun[];
    };
    const list = body.workflow_runs ?? [];
    runs.push(...list);
    if (list.length < 100) {
      break;
    }
  }
  return runs;
}

/** A run as the stall and stale-run rules need it. */
export function runFactOf(run: RestRun): RunFact {
  return {
    id: run.id,
    headSha: run.head_sha,
    status: run.status,
    conclusion: run.conclusion,
    createdAt: run.created_at,
    branch: run.head_branch ?? "",
  };
}

/** Job conclusions that aren't red. */
const notRed = new Set(["success", "skipped", "neutral"]);

/**
 * `main`'s newest `CI` push runs; the newest completed, not cancelled one
 * that didn't pass with the names of its red jobs, for the main-red freeze.
 */
export async function mainRunsOf(
  get: GitHubGet,
  repo: string,
  cache: BoundedCache<string[]>,
): Promise<MainRun[]> {
  const body = (await get(
    `/repos/${repo}/actions/workflows/ci.yml/runs?branch=main&event=push&per_page=10`,
  )) as { workflow_runs?: RestRun[] };
  const runs = body.workflow_runs ?? [];
  const newest = runs
    .filter((run) => run.status === "completed" && run.conclusion !== "cancelled")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const runFacts: MainRun[] = runs.map(runFactOf);
  if (newest === undefined || newest.conclusion === "success") {
    return runFacts;
  }
  const redJobs = await cached(cache, `${newest.id}:${newest.run_attempt ?? 1}`, async () => {
    // Every page: a red job missed past the first 100 would end the freeze wrongly.
    const red: string[] = [];
    for (let page = 1; page <= runPagesMax; page += 1) {
      const body = (await get(
        `/repos/${repo}/actions/runs/${newest.id}/jobs?filter=latest&per_page=100&page=${page}`,
      )) as { jobs?: RestJob[] };
      const jobs = body.jobs ?? [];
      red.push(...jobs.filter((job) => !notRed.has(job.conclusion ?? "")).map((job) => job.name));
      if (jobs.length < 100) {
        return red;
      }
    }
    // More jobs than were read: count the rest as red, so the freeze holds.
    return [...red, "(jobs not read)"];
  });
  return runFacts.map((run) => (run.id === newest.id ? { ...run, redJobs } : run));
}

/** A run's failed jobs on its latest attempt, without `ci-ok`, with their failed steps. */
async function failedJobsOf(get: GitHubGet, repo: string, runId: number): Promise<FailedJob[]> {
  const body = (await get(
    `/repos/${repo}/actions/runs/${runId}/jobs?filter=latest&per_page=100`,
  )) as {
    jobs?: RestJob[];
  };
  return (body.jobs ?? [])
    .filter((job) => job.conclusion === "failure" && job.name !== "ci-ok")
    .map((job) => ({
      id: job.id,
      name: job.name,
      url: job.html_url ?? "",
      failedSteps: (job.steps ?? [])
        .filter((step) => step.conclusion === "failure")
        .map((step) => step.name),
    }));
}

interface RestAnnotation {
  readonly path?: string;
  readonly annotation_level?: string;
}

/**
 * The paths a job's `failure` annotations name, once each; `.github` (a
 * workflow's own annotation) and empty paths left out. Undefined when they
 * can't be read, which keeps the culprit hold (`main-broken.ts`).
 */
async function annotatedFilesOf(
  get: GitHubGet,
  repo: string,
  jobId: number,
): Promise<string[] | undefined> {
  try {
    const annotations = (await get(
      `/repos/${repo}/check-runs/${jobId}/annotations?per_page=100`,
    )) as RestAnnotation[];
    const paths = annotations
      .filter((annotation) => annotation.annotation_level === "failure")
      .map((annotation) => annotation.path ?? "")
      .filter((path) => path !== "" && path !== ".github");
    return [...new Set(paths)];
  } catch {
    return undefined;
  }
}

/** A merge group's failed jobs, each with the files its annotations name. */
async function groupFailedJobsOf(
  get: GitHubGet,
  repo: string,
  runId: number,
): Promise<FailedJob[]> {
  const jobs: FailedJob[] = [];
  for (const job of await failedJobsOf(get, repo, runId)) {
    const annotatedFiles = await annotatedFilesOf(get, repo, job.id);
    jobs.push(annotatedFiles === undefined ? job : { ...job, annotatedFiles });
  }
  return jobs;
}

/** The merge groups' `CI` runs that finished in the last 3 hours, with the failed jobs of each that didn't pass. */
export async function groupRunsOf(
  get: GitHubGet,
  repo: string,
  runs: readonly RestRun[],
  now: Date,
  cache: BoundedCache<FailedJob[]>,
): Promise<GroupRun[]> {
  const since = now.getTime() - 3 * 60 * 60_000;
  const finished = runs.filter(
    (run) => run.name === "CI" && run.status === "completed" && Date.parse(run.created_at) >= since,
  );
  const groups: GroupRun[] = [];
  for (const run of finished) {
    const key = `${run.id}:${run.run_attempt ?? 1}`;
    let failedJobs = run.conclusion === "success" ? [] : cache.get(key);
    if (failedJobs === undefined) {
      failedJobs = await groupFailedJobsOf(get, repo, run.id);
      // A job whose annotations couldn't be read is read again on the next pass.
      if (failedJobs.every((job) => job.annotatedFiles !== undefined)) {
        cache.set(key, failedJobs);
      }
    }
    groups.push({
      id: run.id,
      conclusion: run.conclusion ?? "",
      branch: run.head_branch ?? "",
      url: run.html_url,
      createdAt: run.created_at,
      failedJobs,
    });
  }
  return groups;
}

const jobUrl = /\/actions\/runs\/(\d+)\/job\/(\d+)/;

/**
 * For a red `ci-ok` on a `fast-track` head: its run, its failed jobs, and
 * its error annotations in place of its log. The job writes the line the
 * flake rule looks for as an `::error::`, so it is an annotation; the log
 * itself is served from another host, which the reader never calls.
 */
export async function ciOkRunOf(
  get: GitHubGet,
  repo: string,
  pull: GatePull,
  cache: BoundedCache<CiOkRun | null>,
): Promise<CiOkRun | null> {
  if (!pull.labels.includes("fast-track") || ciOkOf(pull).state !== "failure") {
    return null;
  }
  const check = pull.checks
    .filter((each) => each.name === "ci-ok" && each.event !== "merge_group")
    .sort((a, b) => a.runCreatedAt.localeCompare(b.runCreatedAt))
    .at(-1);
  const match = jobUrl.exec(check?.url ?? "");
  if (match === null) {
    return null;
  }
  const runId = Number(match[1]);
  const jobId = Number(match[2]);
  return await cached(cache, `${pull.head}:${jobId}`, async () => {
    const annotations = (await get(
      `/repos/${repo}/check-runs/${jobId}/annotations?per_page=50`,
    )) as { message?: string }[];
    return {
      runId,
      headSha: pull.head,
      ciOkJobId: jobId,
      ciOkLog: annotations.map((annotation) => annotation.message ?? "").join("\n"),
      failedJobs: await failedJobsOf(get, repo, runId),
    };
  });
}

/**
 * Each changed package `package.json` at the merge base and head, for
 * Julian's scope; undefined when none changed. One compare read gives the
 * merge base and each file's status.
 */
export async function manifestsOf(
  get: GitHubGet,
  repo: string,
  pull: GatePull,
  cache: BoundedCache<GatePull["manifests"]>,
): Promise<GatePull["manifests"]> {
  if (!pull.files.some((path) => path.endsWith("/package.json"))) {
    return undefined;
  }
  // Each part encoded, like a path, so a branch name can't change the request.
  const base = pull.base.split("/").map(encodeURIComponent).join("/");
  return await cached(cache, `${pull.base}:${pull.head}`, async () => {
    const compare = (await get(`/repos/${repo}/compare/${base}...${pull.head}`)) as {
      merge_base_commit?: { sha?: string };
      files?: ChangedFile[];
    };
    return await readManifests(get, repo, compare.files ?? [], {
      base: compare.merge_base_commit?.sha,
      head: pull.head,
    });
  });
}

/**
 * The old paths of the renamed files GraphQL left unnamed (HAL-19283), from
 * one compare read. A renamed file the compare doesn't list (it lists at most
 * 300) keeps null, so only the code reviewer may approve the pull request.
 */
export async function previousPathsOf(
  get: GitHubGet,
  repo: string,
  pull: GatePull,
  cache: BoundedCache<GatePull["previousPaths"]>,
): Promise<GatePull["previousPaths"]> {
  const unknown = pull.previousPaths;
  if (unknown === undefined) {
    return undefined;
  }
  const base = pull.base.split("/").map(encodeURIComponent).join("/");
  try {
    return await cached(cache, `${pull.base}:${pull.head}`, async () => {
      const compare = (await get(`/repos/${repo}/compare/${base}...${pull.head}`)) as {
        files?: ChangedFile[];
      };
      const named = namedPreviousPaths(compare.files ?? []);
      return Object.fromEntries(Object.keys(unknown).map((path) => [path, named[path] ?? null]));
    });
  } catch {
    // Unread, the old paths stay unknown: only the code reviewer's approval counts.
    return unknown;
  }
}
