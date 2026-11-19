import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  type AreaReport,
  areaReports,
  everyPackageJobs,
  issueBody,
  type Job,
  parseAreaTable,
  type Run,
} from "../lib/main-failures.ts";
import { findRepoRoot } from "../lib/workspace.ts";

/**
 * node tooling/check/src/cli/main-failures.ts [--repo owner/name] [--apply]
 *
 * Reads the newest finished push run of `ci.yml` on main and the newest
 * finished `android-screens.yml` run, maps each failed job to an area with
 * `docs/guides/area-owners.md` and prints one report per area. With
 * `--apply` it opens or updates one issue per failing area (label
 * `nightly:<area>`) and closes the issue of an area that is green again.
 * Needs `gh`, signed in with actions:read and issues:write.
 */

interface RunSummary {
  readonly id: number;
  readonly created_at: string;
  readonly conclusion: string | null;
  readonly html_url: string;
}

/** The night before: the newest run at least this much older than the newest one. */
const nightBefore = 20 * 60 * 60 * 1000;

function gh(...args: string[]): string {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

function jsonLines<T>(text: string): T[] {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as T);
}

/** Finished runs on main of the last 3 days, newest first, cancelled ones left out. */
function finishedRuns(repo: string, workflow: string, event: string): RunSummary[] {
  const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const runs = jsonLines<RunSummary>(
    gh(
      "api",
      "--paginate",
      `repos/${repo}/actions/workflows/${workflow}/runs?branch=main&event=${event}&status=completed&created=>=${since}&per_page=100`,
      "--jq",
      ".workflow_runs[] | {id, created_at, conclusion, html_url}",
    ),
  );
  return runs
    .filter((run) => run.conclusion === "success" || run.conclusion === "failure")
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

/** The newest run and the one from the night before, if there is one. */
function latestAndEarlier(
  runs: readonly RunSummary[],
): [RunSummary | undefined, RunSummary | undefined] {
  const latest = runs[0];
  const earlier =
    latest === undefined
      ? undefined
      : runs.find(
          (run) => Date.parse(latest.created_at) - Date.parse(run.created_at) >= nightBefore,
        );
  return [latest, earlier];
}

function ciRun(repo: string, summary: RunSummary): Run {
  const jobs = jsonLines<Job>(
    gh(
      "api",
      "--paginate",
      `repos/${repo}/actions/runs/${summary.id}/jobs?per_page=100&filter=latest`,
      "--jq",
      ".jobs[] | {id, name, conclusion, url: .html_url}",
    ),
  );
  return { url: summary.html_url, jobs };
}

/** Another workflow's run, as one job named by its file. */
function workflowAsJob(workflow: string, summary: RunSummary | undefined): Job[] {
  return summary === undefined
    ? []
    : [{ id: summary.id, name: workflow, conclusion: summary.conclusion, url: summary.html_url }];
}

/** The logs of the failed jobs that test every package, to find the failing package. */
function logsOf(repo: string, runs: readonly Run[]): Map<number, string> {
  const logs = new Map<number, string>();
  for (const job of runs.flatMap((run) => run.jobs)) {
    if (everyPackageJobs.includes(job.name) && job.conclusion === "failure") {
      try {
        logs.set(job.id, gh("api", `repos/${repo}/actions/jobs/${job.id}/logs`));
      } catch {
        console.warn(`main-failures: no log for job ${job.id}; it goes to the fallback area.`);
      }
    }
  }
  return logs;
}

function apply(repo: string, reports: readonly AreaReport[], runUrl: string): void {
  for (const report of reports) {
    const label = `nightly:${report.slug}`;
    const open = gh(
      "issue",
      "list",
      "--repo",
      repo,
      "--state",
      "open",
      "--label",
      label,
      "--json",
      "number",
      "--jq",
      ".[0].number // empty",
    ).trim();
    if (report.failures.length > 0) {
      const body = issueBody(report, runUrl);
      if (open !== "") {
        gh("issue", "comment", open, "--repo", repo, "--body", body);
      } else {
        gh("label", "create", label, "--repo", repo, "--force", "--color", "B60205");
        gh(
          "issue",
          "create",
          "--repo",
          repo,
          "--title",
          `Failing on main: ${report.area}`,
          "--label",
          label,
          "--body",
          body,
        );
      }
      console.log(`${report.area}: ${report.failures.length} failing job(s), issue updated.`);
    } else if (open !== "") {
      gh("issue", "close", open, "--repo", repo, "--comment", `Green again on main: ${runUrl}`);
      console.log(`${report.area}: green again, issue #${open} closed.`);
    }
  }
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      repo: { type: "string", default: process.env["GITHUB_REPOSITORY"] ?? "halonic-com/halonic" },
      apply: { type: "boolean", default: false },
    },
  });
  const repo = values.repo;
  const table = parseAreaTable(
    readFileSync(join(findRepoRoot(), "docs/guides/area-owners.md"), "utf8"),
  );
  const [latestCi, earlierCi] = latestAndEarlier(finishedRuns(repo, "ci.yml", "push"));
  if (latestCi === undefined) {
    console.error("main-failures: no finished push run of ci.yml on main in 3 days.");
    process.exitCode = 1;
  } else {
    const [latestAndroid, earlierAndroid] = latestAndEarlier(
      finishedRuns(repo, "android-screens.yml", "workflow_dispatch"),
    );
    const latestRun = ciRun(repo, latestCi);
    const latest = {
      url: latestRun.url,
      jobs: [...latestRun.jobs, ...workflowAsJob("android-screens.yml", latestAndroid)],
    };
    const earlierRun = earlierCi === undefined ? undefined : ciRun(repo, earlierCi);
    const earlier =
      earlierRun === undefined
        ? undefined
        : {
            url: earlierRun.url,
            jobs: [...earlierRun.jobs, ...workflowAsJob("android-screens.yml", earlierAndroid)],
          };
    const logs = logsOf(repo, earlier === undefined ? [latest] : [latest, earlier]);
    const reports = areaReports({ table, latest, earlier, logs });
    console.log(JSON.stringify({ run: latest.url, reports }, null, 2));
    if (values.apply) {
      apply(repo, reports, latest.url);
    }
  }
}
