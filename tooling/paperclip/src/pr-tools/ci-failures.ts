import type { GitHubGet } from "../pr-watcher/github.ts";
import { type PullDetails, untrustedNote } from "./pr-status.ts";

/**
 * The `ci_failures` tool: why CI is red on a pull request's head or a commit,
 * in one call instead of `gh run view --log` and `gh api` log reads (token
 * plan Track B, HAL-18938). It reads the commit's check runs and each failed
 * run's annotations, the lines a job marks as errors (a failing test's name
 * and message, a type error's file and line), with the same GET-only reader
 * and token as `pr_status`. The raw job logs stay out: GitHub serves them
 * only through a redirect to another host, which the reader refuses so the
 * token never leaves api.github.com.
 */

/** At most this many failed jobs are read and named; the rest are counted. */
export const maxJobs = 8;

/** At most this many error annotations per job; the rest are counted. */
export const maxAnnotations = 10;

/** One annotation's message keeps at most this many of its last lines. */
export const maxMessageLines = 8;

/** One job's summary keeps at most this many of its last lines. */
export const maxSummaryLines = 12;

/** A line of GitHub text longer than this is cut. */
export const maxLineLength = 300;

/** The whole answer's text stays under this many characters. */
export const maxAnswerLength = 8_000;

/** A check run's conclusions that make it red. A cancelled or skipped run isn't red. */
const redConclusions: ReadonlySet<string> = new Set(["failure", "timed_out", "startup_failure"]);

/** The parts of a check run the tool reads. */
interface CheckRunDetails {
  readonly id: number;
  readonly name: string;
  readonly status?: string;
  readonly conclusion?: string | null;
  readonly html_url?: string;
  readonly output?: { readonly title?: string | null; readonly summary?: string | null };
}

/** The parts of an annotation the tool reads. */
interface AnnotationDetails {
  readonly path?: string;
  readonly start_line?: number;
  readonly annotation_level?: string;
  readonly title?: string | null;
  readonly message?: string | null;
}

/** One error a failed job marked: often a failing test, with its file and line. */
export interface FailureNote {
  readonly path: string;
  readonly line: number | undefined;
  /** The test's name for a test reporter's annotation. */
  readonly title: string | undefined;
  /** Its last lines, each cut to `maxLineLength`. */
  readonly message: string;
}

/** One failed job on the commit. */
export interface FailedJob {
  readonly name: string;
  readonly conclusion: string;
  readonly url: string | undefined;
  /** The job's own summary, its last lines; left out for a private repository. */
  readonly summary?: string;
  /** Left out for a private repository. */
  readonly errors?: readonly FailureNote[];
  readonly moreErrors: number;
}

/** What `ci_failures` returns. */
export interface CiFailures {
  readonly repo: string;
  /** The pull request asked about, when one was. */
  readonly number: number | undefined;
  readonly head: string;
  /** No GitHub text of a private repository leaves it: names, counts and links only. */
  readonly private: boolean;
  readonly failed: readonly FailedJob[];
  readonly moreJobs: number;
  /** Check runs still queued or running on the commit. */
  readonly running: number;
}

/** Which commit to read: a pull request's head, or a commit itself. */
export type CiTarget =
  | { readonly repo: string; readonly number: number }
  | { readonly repo: string; readonly sha: string };

/** The last `count` lines of a text, each cut to `maxLineLength`. */
export function lastLines(text: string, count: number): string {
  return text
    .trimEnd()
    .split(/\r?\n/)
    .slice(-count)
    .map((line) => (line.length > maxLineLength ? `${line.slice(0, maxLineLength)}…` : line))
    .join("\n");
}

function failureNote(annotation: AnnotationDetails): FailureNote {
  return {
    path: annotation.path ?? "",
    line: annotation.start_line,
    title: annotation.title ?? undefined,
    message: lastLines(annotation.message ?? "", maxMessageLines),
  };
}

/** A failed job, with its errors and summary unless the repository is private. */
async function failedJob(
  get: GitHubGet,
  repo: string,
  run: CheckRunDetails,
  isPrivate: boolean,
): Promise<FailedJob> {
  const job = { name: run.name, conclusion: run.conclusion ?? "", url: run.html_url };
  if (isPrivate) {
    return { ...job, moreErrors: 0 };
  }
  // One page is enough: only the first `maxAnnotations` errors are shown, the rest counted.
  const annotations = (await get(
    `/repos/${repo}/check-runs/${run.id}/annotations?per_page=100`,
  )) as AnnotationDetails[];
  const errors = annotations.filter((annotation) => annotation.annotation_level === "failure");
  const summary = lastLines(run.output?.summary ?? "", maxSummaryLines);
  return {
    ...job,
    ...(summary === "" ? {} : { summary }),
    errors: errors.slice(0, maxAnnotations).map(failureNote),
    moreErrors: Math.max(0, errors.length - maxAnnotations),
  };
}

/** The commit and the repository's privacy: from the pull request, or from the repository. */
async function resolveHead(
  get: GitHubGet,
  target: CiTarget,
): Promise<{ head: string; isPrivate: boolean; number: number | undefined }> {
  if ("number" in target) {
    const pull = (await get(`/repos/${target.repo}/pulls/${target.number}`)) as PullDetails;
    return {
      head: pull.head.sha,
      isPrivate: pull.base.repo?.private === true,
      number: target.number,
    };
  }
  const repository = (await get(`/repos/${target.repo}`)) as { private?: boolean };
  return { head: target.sha, isPrivate: repository.private === true, number: undefined };
}

/** Check-run pages read at most: CI on one commit has well under 300 jobs. */
export const maxCheckRunPages = 3;

/**
 * The newest run of each check on a commit. The list comes wrapped in an
 * object, so `everyPage`, which reads plain lists, can't page it.
 */
async function latestCheckRuns(
  get: GitHubGet,
  repo: string,
  sha: string,
): Promise<CheckRunDetails[]> {
  const runs: CheckRunDetails[] = [];
  for (let page = 1; page <= maxCheckRunPages; page += 1) {
    const body = (await get(
      `/repos/${repo}/commits/${sha}/check-runs?filter=latest&per_page=100&page=${page}`,
    )) as { check_runs?: CheckRunDetails[] };
    const list = body.check_runs ?? [];
    runs.push(...list);
    if (list.length < 100) {
      break;
    }
  }
  return runs;
}

/**
 * Reads the failed jobs on a pull request's head or a commit: 2 GitHub
 * requests, plus one per extra page of check runs and one per failed job read.
 * `ci-ok` itself is left out: it only says that another job failed.
 */
export async function ciFailures(get: GitHubGet, target: CiTarget): Promise<CiFailures> {
  const { head, isPrivate, number } = await resolveHead(get, target);
  const runs = await latestCheckRuns(get, target.repo, head);
  const red = runs.filter(
    (run) => redConclusions.has(run.conclusion ?? "") && !run.name.startsWith("ci-ok"),
  );
  const failed = await Promise.all(
    red.slice(0, maxJobs).map((run) => failedJob(get, target.repo, run, isPrivate)),
  );
  return {
    repo: target.repo,
    number,
    head,
    private: isPrivate,
    failed,
    moreJobs: Math.max(0, red.length - maxJobs),
    running: runs.filter((run) => run.status !== undefined && run.status !== "completed").length,
  };
}

/** GitHub text, indented under its job, every line JSON-quoted. */
function quoted(text: string, indent: string): string[] {
  return text.split("\n").map((line) => `${indent}${JSON.stringify(line)}`);
}

function noteLines(note: FailureNote): string[] {
  const where = note.line === undefined ? note.path : `${note.path}:${note.line}`;
  const title = note.title === undefined ? "" : ` ${JSON.stringify(note.title)}`;
  return [`  - ${JSON.stringify(where)}${title}`, ...quoted(note.message, "    ")];
}

function jobLines(job: FailedJob): string[] {
  const lines = [`${JSON.stringify(job.name)}: ${job.conclusion}${job.url ? ` ${job.url}` : ""}`];
  for (const note of job.errors ?? []) {
    lines.push(...noteLines(note));
  }
  if (job.moreErrors > 0) {
    lines.push(`  and ${job.moreErrors} more errors`);
  }
  if (job.summary !== undefined) {
    lines.push("  summary, last lines:", ...quoted(job.summary, "    "));
  }
  if (job.errors !== undefined && job.errors.length === 0 && job.summary === undefined) {
    lines.push("  no error lines marked: open the link for its log");
  }
  return lines;
}

/** Cuts the text at a whole line under `maxAnswerLength`, and says so. */
function capped(lines: readonly string[]): string {
  const kept: string[] = [];
  let length = 0;
  for (const line of lines) {
    if (length + line.length + 1 > maxAnswerLength) {
      kept.push(`(cut at ${maxAnswerLength} characters: ask about one job's link for the rest)`);
      break;
    }
    kept.push(line);
    length += line.length + 1;
  }
  return kept.join("\n");
}

/**
 * The text an agent reads: the head, then each failed job with its errors.
 * Job names, paths, test names and messages come from the pull request's own
 * code, a fork's included, so each stays JSON-quoted on a line of its own.
 */
export function ciFailuresText(result: CiFailures): string {
  const subject = result.number === undefined ? result.repo : `#${result.number} (${result.repo})`;
  const head = `${subject} head ${result.head.slice(0, 7)}`;
  const running = result.running > 0 ? `; ${result.running} checks still running` : "";
  if (result.failed.length === 0) {
    return `${head}: no failed jobs${running}.`;
  }
  const note = result.private
    ? "private repository: job names and links only"
    : `${untrustedNote}, each line JSON-quoted`;
  return capped([
    `${head}: ${result.failed.length + result.moreJobs} failed jobs${running}. ${note}.`,
    ...result.failed.flatMap(jobLines),
    ...(result.moreJobs > 0 ? [`and ${result.moreJobs} more failed jobs`] : []),
  ]);
}
