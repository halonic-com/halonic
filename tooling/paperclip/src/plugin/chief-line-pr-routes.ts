import type { PluginApiResponse } from "@paperclipai/plugin-sdk";
import { newestCheck } from "../pr-watcher/github.ts";
import { type ChiefLineApi, fail } from "./chief-line.ts";
import {
  callerPulls,
  callerThreads,
  marker,
  type News,
  oneAtATime,
  type PrOutcomesApi,
  postLines,
  stateNews,
  type TrackedPull,
  verdictNews,
  verdicts,
} from "./chief-line-prs.ts";
import { type ChiefLineSettings, callerPattern, threadTitle } from "./chief-line-settings.ts";

/**
 * The chief line's two pull request routes (HAL-18586): `track` registers a
 * pull request for a caller, and `pr-event` takes one fact from a GitHub
 * webhook delivery that the pr-hooks receiver (infra/pr-hooks) has already
 * checked against GitHub's signature. Both are board only, like every chief
 * line route. `pr-event` reads nothing from GitHub: the delivery carries the
 * fact, and the markers the PR watcher's pass also reads decide whether it is
 * new, so an event the webhook posted is never posted again by the pass.
 */

const repoPattern = /^[\w.-]+\/[\w.-]+$/;

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

/** One fact from a webhook delivery, as the receiver forwards it. */
type PrEvent =
  | {
      readonly kind: "comment";
      readonly comment: {
        readonly id: number;
        readonly body: string;
        readonly author_association: string;
        readonly created_at: string;
        readonly html_url?: string | undefined;
      };
    }
  | { readonly kind: "ci-ok"; readonly head: string; readonly conclusion: string }
  | { readonly kind: "closed"; readonly merged: boolean };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A webhook comment's fields, or undefined when one is missing or of the wrong type. */
function parseComment(raw: unknown) {
  if (!isRecord(raw)) {
    return undefined;
  }
  const { id, body, author_association: association, created_at: at, html_url: url } = raw;
  const valid =
    typeof id === "number" &&
    typeof body === "string" &&
    typeof association === "string" &&
    typeof at === "string" &&
    !Number.isNaN(Date.parse(at)) &&
    (url === undefined || typeof url === "string");
  return valid
    ? { id, body, author_association: association, created_at: at, html_url: url }
    : undefined;
}

/** The event in a `pr-event` body, or why it is refused. */
function parseEvent(body: Record<string, unknown>): PrEvent | string {
  const { kind, head, conclusion, merged } = body;
  if (kind === "comment") {
    const comment = parseComment(body["comment"]);
    return comment === undefined
      ? "comment needs id, body, author_association and created_at."
      : { kind, comment };
  }
  if (kind === "ci-ok") {
    return typeof head === "string" && /^[0-9a-f]{40}$/.test(head) && typeof conclusion === "string"
      ? { kind, head, conclusion }
      : "ci-ok needs a 40-character head and a conclusion.";
  }
  if (kind === "closed") {
    return typeof merged === "boolean" ? { kind, merged } : "closed needs merged: true or false.";
  }
  return "kind must be comment, ci-ok or closed.";
}

/** What the event adds for a tracked pull request, with the keys the pass uses for the same event. */
function eventNews(event: PrEvent, pull: TrackedPull): News[] {
  if (event.kind === "comment") {
    // The head isn't in the delivery: a verdict made since tracking began counts, as in the pass.
    return verdictNews(verdicts([event.comment]), pull, "");
  }
  if (event.kind === "ci-ok") {
    const ciOk = newestCheck([{ status: "completed", conclusion: event.conclusion }]);
    return stateNews({ state: "open", head: event.head, ciOk }, pull);
  }
  return stateNews({ state: event.merged ? "merged" : "closed", head: "", ciOk: "missing" }, pull);
}

/**
 * `POST /chief-line/pr-event` {repo, pr, kind, …}: posts the event on the
 * chief line of every caller tracking the pull request, unless a marker shows
 * it was already posted. Answers how many comments it posted; an untracked
 * pull request posts nothing.
 */
export async function prEvent(
  ctx: PrOutcomesApi,
  companyId: string,
  settings: ChiefLineSettings,
  body: Record<string, unknown>,
): Promise<PluginApiResponse> {
  if (!settings.prOutcomes) {
    return fail(409, "Pull request outcomes are off: set chiefLine.prOutcomes.");
  }
  const { repo, pr } = body;
  if (typeof repo !== "string" || !repoPattern.test(repo)) {
    return fail(400, "repo must be owner/name.");
  }
  if (typeof pr !== "number" || !Number.isInteger(pr) || pr <= 0) {
    return fail(400, "pr must be a pull request number.");
  }
  const event = parseEvent(body);
  if (typeof event === "string") {
    return fail(400, event);
  }
  if (settings.projectId === undefined) {
    return fail(409, "The chief line has no project: set chiefLine.projectId.");
  }
  let posted = 0;
  for (const [caller, threads] of await callerThreads(ctx, companyId, settings.projectId)) {
    posted += await oneAtATime(`${companyId} ${caller}`, async () => {
      const pulls = await callerPulls(ctx, companyId, threads);
      const pull = pulls.find((p) => p.repo === repo && p.number === pr);
      const news = pull === undefined ? [] : eventNews(event, pull);
      if (news.length === 0) {
        return 0;
      }
      return await postLines(ctx, { companyId, settings, dryRun: false }, caller, threads, {
        lines: news.map((n) => n.line),
        markers: news.map((n) => marker(repo, pr, n.key)),
      });
    });
  }
  return { status: 200, body: { posted } };
}
