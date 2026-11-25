import type { PluginApiResponse, PluginIssuesClient } from "@paperclipai/plugin-sdk";
import { plainLines } from "../merge-control/signed.ts";
import { reviewers } from "../pr-tools/approvals.ts";
import type { CheckState } from "../pr-watcher/decide.ts";
import { byReviewer, everyPage, type GitHubGet } from "../pr-watcher/github.ts";
import type { Snapshot } from "../snapshot/shape.ts";
import { type ChiefLineApi, fail, readRecords } from "./chief-line.ts";
import {
  type ChiefLineSettings,
  callerPattern,
  parseThreadTitle,
  threadTitle,
  webhookAllowed,
} from "./chief-line-settings.ts";
import { type ChiefLineSignalApi, sendSignal } from "./chief-line-signal.ts";

/**
 * Pull request outcomes on the chief line (HAL-18586): a server session has no
 * Paperclip task the PR watcher could wake, so it registers its pull requests
 * with `POST /chief-line/track`, and every watcher pass posts what changed on
 * the caller's chief line: a signed verdict from Liam or Julian, a green or
 * red `ci-ok` on the head, a merge or a close. Both the registry and what was
 * already sent are hidden markers in the plugin's own comments on the thread,
 * so they survive a plugin reinstall, which clears plugin state.
 */

/** The marker's prefix, in an HTML comment that the task page doesn't show. */
const markerPrefix = "chief-line-pr";
const markerPattern = /<!-- chief-line-pr ([\w.-]+\/[\w.-]+)#(\d+) (\S+) -->/g;
const repoPattern = /^[\w.-]+\/[\w.-]+$/;
/** Keys that end tracking: the pull request is gone, nothing more will come. */
const endKeys = new Set(["merged", "closed", "dropped"]);

const marker = (repo: string, number: number, key: string) =>
  `<!-- ${markerPrefix} ${repo}#${number} ${key} -->`;

/** A tracked pull request, from the markers on a caller's threads. */
export interface TrackedPull {
  readonly repo: string;
  readonly number: number;
  /** When the newest `track` marker was posted. */
  readonly trackedAt: number;
  /** The keys already posted for it, such as `verdict:123` or `ci-ok:failure:<head>`. */
  readonly sent: ReadonlySet<string>;
}

interface MarkedComment {
  readonly body: string;
  readonly authorAgentId: string | null;
  readonly authorUserId: string | null;
  readonly createdAt: Date | string;
}

/** The pull requests still tracked: a `track` marker with no end marker after it. Only the plugin's own comments count. */
export function trackedPulls(comments: readonly MarkedComment[]): TrackedPull[] {
  const pulls = new Map<string, { trackedAt: number; open: boolean; sent: Set<string> }>();
  const ordered = [...comments].sort(
    (x, y) => new Date(x.createdAt).getTime() - new Date(y.createdAt).getTime(),
  );
  for (const comment of ordered) {
    if (comment.authorAgentId !== null || comment.authorUserId !== null) {
      continue;
    }
    for (const [, repo = "", number = "", key = ""] of comment.body.matchAll(markerPattern)) {
      const id = `${repo}#${number}`;
      const pull = pulls.get(id) ?? { trackedAt: 0, open: false, sent: new Set<string>() };
      if (key === "track") {
        pull.open = true;
        pull.trackedAt = new Date(comment.createdAt).getTime();
      } else if (endKeys.has(key)) {
        pull.open = false;
      } else {
        pull.sent.add(key);
      }
      pulls.set(id, pull);
    }
  }
  return [...pulls]
    .filter(([, pull]) => pull.open)
    .map(([id, { trackedAt, sent }]) => {
      const [repo = "", number = "0"] = id.split("#");
      return { repo, number: Number(number), trackedAt, sent };
    });
}

/** A signed verdict line: Liam or Julian, approved, changes requested or cache OK, on a head. */
const verdictLine =
  /^(?:\*\*)?([A-Z][a-z]+)(?:\*\*)?:[ \t]*(re-approved|approved again|approved|changes requested|cache OK) on head[ \t]*`?([0-9a-f]{7,40})`?/i;

/** A conversation comment as GitHub lists it. */
interface IssueComment {
  readonly id: number;
  readonly html_url?: string;
  readonly body?: string | null;
  readonly author_association?: string;
  readonly created_at: string;
}

/** One verdict found in a reviewer's comment. */
export interface Verdict {
  readonly commentId: number;
  readonly url: string | undefined;
  readonly at: number;
  /** The head it names, as written (7 to 40 characters). */
  readonly head: string;
  readonly text: string;
}

/** The first signed verdict line of each comment by our team, outside code and quotes. */
export function verdicts(comments: readonly IssueComment[]): Verdict[] {
  return comments.filter(byReviewer).flatMap((comment): Verdict[] => {
    for (const line of plainLines(comment.body ?? "")) {
      const match = verdictLine.exec(line);
      const [, by = "", what = "", head = ""] = match ?? [];
      if (match !== null && reviewers.includes(by)) {
        return [
          {
            commentId: comment.id,
            url: comment.html_url,
            at: Date.parse(comment.created_at),
            head: head.toLowerCase(),
            text: `${by}: ${what} on head \`${head.slice(0, 9)}\``,
          },
        ];
      }
    }
    return [];
  });
}

/** What the pass knows about a pull request's state. */
interface PullState {
  readonly state: "open" | "merged" | "closed";
  readonly head: string;
  readonly ciOk: CheckState;
}

/** The pull request's state from the snapshot, or from GitHub when it closed before the snapshot's window. */
async function pullState(
  get: GitHubGet,
  snapshot: Snapshot,
  repo: string,
  number: number,
): Promise<PullState> {
  const pull = snapshot.repos.find((r) => r.repo === repo)?.pulls.find((p) => p.number === number);
  if (pull !== undefined) {
    return { state: pull.state, head: pull.head, ciOk: pull.open?.ciOk ?? "missing" };
  }
  // Closed before the snapshot's window: only its state matters now.
  const read = (await get(`/repos/${repo}/pulls/${number}`)) as {
    state?: string;
    merged_at?: string | null;
    head?: { sha?: string };
  };
  if (read.state === "open") {
    return { state: "open", head: read.head?.sha ?? "", ciOk: "missing" };
  }
  return {
    state: read.merged_at ? "merged" : "closed",
    head: read.head?.sha ?? "",
    ciOk: "missing",
  };
}

/** One event to post: its line and the key that marks it sent. */
interface News {
  readonly line: string;
  readonly key: string;
}

/** Verdicts on the current head, and any made since tracking began, so one just ahead of `track` still arrives. */
function verdictNews(found: readonly Verdict[], pull: TrackedPull, head: string): News[] {
  const name = `${pull.repo}#${pull.number}`;
  return found.flatMap((verdict): News[] => {
    const key = `verdict:${verdict.commentId}`;
    const onHead = head !== "" && head.startsWith(verdict.head);
    if (pull.sent.has(key) || !(verdict.at > pull.trackedAt || onHead)) {
      return [];
    }
    const link = verdict.url === undefined ? "" : ` ${verdict.url}`;
    return [{ line: `${name}: ${verdict.text}.${link}`, key }];
  });
}

/** A green or red `ci-ok` on the open head, or the merge or close that ends tracking. */
function stateNews(state: PullState, pull: TrackedPull): News[] {
  const name = `${pull.repo}#${pull.number}`;
  if (state.state !== "open") {
    const what = state.state === "merged" ? "merged" : "closed without merging";
    return [{ line: `${name}: ${what}; no longer tracked.`, key: state.state }];
  }
  const key = `ci-ok:${state.ciOk}:${state.head}`;
  if ((state.ciOk !== "success" && state.ciOk !== "failure") || pull.sent.has(key)) {
    return [];
  }
  const colour = state.ciOk === "success" ? "green" : "red";
  return [{ line: `${name}: \`ci-ok\` ${colour} on head \`${state.head.slice(0, 9)}\`.`, key }];
}

/** The lines and markers to post for one pull request, none when nothing is new. */
export async function pullNews(
  get: GitHubGet,
  snapshot: Snapshot,
  watched: readonly string[],
  pull: TrackedPull,
): Promise<{ lines: string[]; keys: string[] }> {
  const { repo, number } = pull;
  const news: News[] = [];
  if (watched.includes(repo)) {
    try {
      const state = await pullState(get, snapshot, repo, number);
      const comments = await everyPage(get, `/repos/${repo}/issues/${number}/comments`);
      news.push(...verdictNews(verdicts(comments as IssueComment[]), pull, state.head));
      news.push(...stateNews(state, pull));
    } catch (error) {
      // A number that doesn't exist would fail every pass; any other error is retried next pass.
      if (!/ answered 404\b/.test((error as Error).message)) {
        throw error;
      }
      news.push({
        line: `${repo}#${number}: not found on GitHub, so not tracked.`,
        key: "dropped",
      });
    }
  } else {
    const line = `${repo}#${number}: not a repository the PR watcher reads, so not tracked.`;
    news.push({ line, key: "dropped" });
  }
  return {
    lines: news.map((n) => n.line),
    keys: news.map((n) => marker(repo, number, n.key)),
  };
}

/** What the pass uses from the plugin context. */
export type PrOutcomesApi = Pick<ChiefLineSignalApi, "state" | "http" | "logger"> & {
  readonly issues: Pick<PluginIssuesClient, "list" | "listComments" | "createComment">;
};

/** What one pass reads and where it posts. */
export interface PassOptions {
  readonly companyId: string;
  readonly settings: ChiefLineSettings;
  readonly snapshot: Snapshot;
  readonly get: GitHubGet;
  /** The repositories the PR watcher reads. */
  readonly watched: readonly string[];
  readonly dryRun: boolean;
}

/** A chief line thread as the pass reads it. */
interface PassThread {
  readonly id: string;
  readonly identifier?: string | null;
  readonly createdAt: Date | string;
}

/** Posts one caller's news on its newest thread and signals its webhook; 1 when it posted. */
async function postNews(
  ctx: PrOutcomesApi,
  { companyId, settings, snapshot, get, watched, dryRun }: PassOptions,
  caller: string,
  threads: readonly PassThread[],
): Promise<number> {
  const comments = (
    await Promise.all(threads.map((thread) => ctx.issues.listComments(thread.id, companyId)))
  ).flat();
  const news = [];
  for (const pull of trackedPulls(comments)) {
    try {
      news.push(await pullNews(get, snapshot, watched, pull));
    } catch (error) {
      ctx.logger.error(
        `Chief line PRs: couldn't read ${pull.repo}#${pull.number}: ${(error as Error).message}`,
        { companyId },
      );
    }
  }
  const lines = news.flatMap((n) => n.lines);
  const thread = [...threads].sort(
    (x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime(),
  )[0];
  if (lines.length === 0 || thread === undefined) {
    return 0;
  }
  if (dryRun) {
    ctx.logger.info(`Chief line PRs (dry run) for ${caller}: ${lines.join(" | ")}`, { companyId });
    return 0;
  }
  const list = lines.map((line) => `- ${line}`).join("\n");
  const markers = news.flatMap((n) => n.keys).join("\n");
  const body = `**PR watcher (chief line)**\n\n${list}\n\n${markers}`;
  const comment = await ctx.issues.createComment(thread.id, body, companyId);
  const url = (await readRecords<string>(ctx, companyId, "hooks"))[caller];
  if (url !== undefined && webhookAllowed(url, settings.webhookHosts)) {
    // The session reads the thread on a signal; `Chief` as on any reply on the chief line.
    await sendSignal(ctx, companyId, url, {
      thread: thread.identifier ?? thread.id,
      caller,
      commentId: comment.id,
      at: new Date(comment.createdAt).toISOString(),
      agent: "Chief",
    });
  }
  return 1;
}

/**
 * One pass for one company: for every caller's live chief line, posts one
 * comment with what changed on its tracked pull requests and signals the
 * caller's webhook. It doesn't wake Chief. Returns how many comments it posted.
 */
export async function chiefLinePrPass(ctx: PrOutcomesApi, options: PassOptions): Promise<number> {
  const { companyId, settings } = options;
  if (!settings.enabled || settings.projectId === undefined) {
    return 0;
  }
  const listed = await ctx.issues.list({ companyId, projectId: settings.projectId, limit: 500 });
  const byCaller = new Map<string, typeof listed>();
  for (const issue of listed) {
    const parsed = parseThreadTitle(issue.title);
    if (issue.status !== "cancelled" && parsed !== undefined && parsed.agentName === undefined) {
      byCaller.set(parsed.caller, [...(byCaller.get(parsed.caller) ?? []), issue]);
    }
  }
  let posted = 0;
  for (const [caller, threads] of byCaller) {
    posted += await postNews(ctx, options, caller, threads);
  }
  return posted;
}

/** A pull request number from `6085`, `"#6085"` or its GitHub URL, with the URL's repository. */
function parsePull(pr: unknown): { number: number; repo?: string } | undefined {
  if (typeof pr === "number") {
    return Number.isInteger(pr) && pr > 0 ? { number: pr } : undefined;
  }
  if (typeof pr !== "string") {
    return undefined;
  }
  const url = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)\/?$/.exec(pr.trim());
  if (url?.[1] !== undefined) {
    return { number: Number(url[2]), repo: url[1] };
  }
  const plain = /^#?(\d+)$/.exec(pr.trim());
  return plain === null ? undefined : { number: Number(plain[1]) };
}

/**
 * `POST /chief-line/track` {caller, pr, repo?}: registers a pull request for
 * the caller's chief line by posting a `track` marker there as the plugin,
 * which wakes nobody. The repository defaults to halonic-com/halonic.
 */
export async function trackPull(
  ctx: ChiefLineApi,
  companyId: string,
  settings: ChiefLineSettings,
  body: Record<string, unknown>,
): Promise<PluginApiResponse> {
  const { caller } = body;
  if (typeof caller !== "string" || !callerPattern.test(caller)) {
    return fail(400, "caller must match ^[a-z0-9][a-z0-9-]{0,40}$.");
  }
  const pull = parsePull(body["pr"]);
  const repo = pull?.repo ?? body["repo"] ?? "halonic-com/halonic";
  if (pull === undefined || typeof repo !== "string" || !repoPattern.test(repo)) {
    return fail(400, "pr must be a pull request number or URL, and repo owner/name.");
  }
  if (settings.projectId === undefined) {
    return fail(409, "The chief line has no project: set chiefLine.projectId.");
  }
  const title = threadTitle(caller);
  const thread = (await ctx.issues.list({ companyId, projectId: settings.projectId, limit: 500 }))
    .filter((issue) => issue.title === title && issue.status !== "cancelled")
    .sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime())[0];
  if (thread === undefined) {
    return fail(404, `No chief line thread for ${caller} yet.`);
  }
  const name = `${repo}#${pull.number}`;
  const comment = await ctx.issues.createComment(
    thread.id,
    `**PR watcher (chief line)**\n\nTracking ${name} for ${caller}: review verdicts, \`ci-ok\`, a merge or a close come here.\n\n${marker(repo, pull.number, "track")}`,
    companyId,
  );
  return { status: 200, body: { caller, repo, pr: pull.number, commentId: comment.id } };
}
